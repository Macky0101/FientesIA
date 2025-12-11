package com.fientesia

import android.net.Uri
import android.util.Log
import com.facebook.react.bridge.*
import org.json.JSONArray
import org.json.JSONObject
import org.json.JSONTokener
import org.tensorflow.lite.Interpreter
import java.io.BufferedReader
import java.io.File
import java.io.FileInputStream
import java.io.InputStreamReader
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.MappedByteBuffer
import java.nio.channels.FileChannel
import org.tensorflow.lite.flex.FlexDelegate


class HybridModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        private const val TAG = "HybridModule"
    }

    private var interpreter: Interpreter? = null
    private val sampleCount = 168
    private val featureCount = 47
    private val inputDim = 1 * sampleCount * featureCount
    private var scalers: Map<Int, Pair<Float, Float>> = emptyMap() // index -> (mean, scale)
    private var targetNames: List<String> = emptyList()

    override fun getName(): String {
        return "HybridModule"
    }

    /** Charger le modèle + scaler_params.json + app_config.json (target names) */
    @ReactMethod
    fun loadModel(modelName: String, scalerName: String, configName: String, promise: Promise) {
        try {
            Log.d(TAG, "========================================")
            Log.d(TAG, " CHARGEMENT DU MODÈLE DÉMARRÉ")
            Log.d(TAG, "========================================")
            Log.d(TAG, "Fichiers:")
            Log.d(TAG, "  - Modèle: $modelName")
            Log.d(TAG, "  - Scalers: $scalerName")
            Log.d(TAG, "  - Config: $configName")
            
            val model = loadModelFile(modelName)
            Log.d(TAG, " Fichier modèle chargé (taille: ${model.capacity()} bytes)")
            
            val options = Interpreter.Options()
            options.addDelegate(FlexDelegate())
            Log.d(TAG, " FlexDelegate activé")

            interpreter = Interpreter(model, options)
            Log.d(TAG, " Interpreter TensorFlow Lite créé")
            
            // Log des informations sur le modèle
            val inputTensor = interpreter!!.getInputTensor(0)
            val outputTensor = interpreter!!.getOutputTensor(0)
            Log.d(TAG, " Informations du modèle:")
            Log.d(TAG, "  Input shape: ${inputTensor.shape().contentToString()}")
            Log.d(TAG, "  Input type: ${inputTensor.dataType()}")
            Log.d(TAG, "  Output shape: ${outputTensor.shape().contentToString()}")
            Log.d(TAG, "  Output type: ${outputTensor.dataType()}")

            scalers = loadScalerParams(scalerName)
            Log.d(TAG, " Scalers chargés (${scalers.size} features)")
            
            targetNames = loadTargetNames(configName)
            Log.d(TAG, " Target names chargés (${targetNames.size} targets):")
            targetNames.forEachIndexed { idx, name ->
                Log.d(TAG, "    [$idx] $name")
            }

            Log.d(TAG, "========================================")
            Log.d(TAG, " MODÈLE PRÊT À L'UTILISATION")
            Log.d(TAG, "========================================")
            promise.resolve("Model & scalers loaded")
        } catch (e: Exception) {
            Log.e(TAG, " ERREUR CHARGEMENT MODÈLE: ${e.message}", e)
            promise.reject("MODEL_LOAD_ERROR", e)
        }
    }

    /** Classifier une séquence via son URI (fichier JSON) */
    @ReactMethod
    fun classifySequenceFromUri(uriString: String, promise: Promise) {
        try {
            Log.d(TAG, "========================================")
            Log.d(TAG, " INFÉRENCE DÉMARRÉE")
            Log.d(TAG, "========================================")
            
            if (interpreter == null) {
                Log.e(TAG, " ERREUR: Modèle non chargé")
                promise.reject("NO_MODEL", "Model not loaded")
                return
            }

            Log.d(TAG, " Lecture du fichier: $uriString")
            val sequence = loadSequenceFromUri(uriString)
            Log.d(TAG, " Séquence chargée: ${sequence.size} timesteps")
            
            if (sequence.size != sampleCount) {
                Log.e(TAG, " ERREUR: Mauvaise longueur de séquence (attendu: $sampleCount, reçu: ${sequence.size})")
                promise.reject("BAD_SHAPE", "Sequence length must be $sampleCount (got ${sequence.size})")
                return
            }
            for (r in sequence) {
                if (r.size != featureCount) {
                    Log.e(TAG, " ERREUR: Mauvais nombre de features (attendu: $featureCount, reçu: ${r.size})")
                    promise.reject("BAD_SHAPE", "Each timestep must have $featureCount features")
                    return
                }
            }

            // Log quelques valeurs brutes avant normalisation
            Log.d(TAG, " Échantillon de données brutes (premier timestep, 5 premières features):")
            for (i in 0 until minOf(5, featureCount)) {
                Log.d(TAG, "    Feature[$i]: ${sequence[0][i]}")
            }

            Log.d(TAG, " Construction du buffer d'entrée avec normalisation...")
            val inputBuffer = buildInputBuffer(sequence)
            Log.d(TAG, " Buffer d'entrée préparé (taille: ${inputBuffer.capacity()} bytes)")
            
            val output = Array(1) { FloatArray(targetNames.size.coerceAtLeast(12)) }
            Log.d(TAG, " Taille de sortie: ${output[0].size}")

            Log.d(TAG, " EXÉCUTION DE L'INFÉRENCE...")
            val startTime = System.currentTimeMillis()
            interpreter!!.run(inputBuffer, output)
            val inferenceTime = System.currentTimeMillis() - startTime
            Log.d(TAG, " INFÉRENCE TERMINÉE en ${inferenceTime}ms")

            // Log des résultats
            Log.d(TAG, "========================================")
            Log.d(TAG, " RÉSULTATS DE PRÉDICTION:")
            Log.d(TAG, "========================================")
            val resultArray = WritableNativeArray()
            val names = if (targetNames.isNotEmpty()) targetNames else generateDefaultTargets()
            val out = output[0]
            for (i in out.indices) {
                val obj = WritableNativeMap()
                val label = if (i < names.size) names[i] else "out_$i"
                obj.putString("label", label)
                obj.putDouble("value", out[i].toDouble())
                resultArray.pushMap(obj)
                
                // Log chaque prédiction
                Log.d(TAG, "  [$i] $label = ${String.format("%.4f", out[i])}")
            }
            Log.d(TAG, "========================================")

            promise.resolve(resultArray)
        } catch (e: Exception) {
            Log.e(TAG, " ERREUR INFÉRENCE: ${e.message}", e)
            e.printStackTrace()
            promise.reject("INFERENCE_ERROR", e)
        }
    }

    // --- Helper: read model .tflite from assets (copy to filesDir then mmap) ---
    private fun loadModelFile(modelName: String): MappedByteBuffer {
        val file = File(reactApplicationContext.filesDir, modelName)
        if (!file.exists()) {
            reactApplicationContext.assets.open(modelName).use { input ->
                file.outputStream().use { output -> input.copyTo(output) }
            }
        }
        val inputStream = FileInputStream(file)
        val fileChannel = inputStream.channel
        return fileChannel.map(FileChannel.MapMode.READ_ONLY, 0, file.length())
    }

    // --- Helper: load scaler_params.json from assets ---
    private fun loadScalerParams(scalerName: String): Map<Int, Pair<Float, Float>> {
        val jsonStr = reactApplicationContext.assets.open(scalerName).bufferedReader().use { it.readText() }
        val tokener = JSONTokener(jsonStr)
        val obj = tokener.nextValue() as JSONObject

        val map = mutableMapOf<Int, Pair<Float, Float>>()
        val keys = obj.keys()
        while (keys.hasNext()) {
            val key = keys.next() // "feature_0"
            val idx = key.removePrefix("feature_").toIntOrNull() ?: continue
            val entry = obj.getJSONObject(key)
            val mean = entry.optDouble("mean", 0.0).toFloat()
            val scale = entry.optDouble("scale", 1.0).toFloat()
            // Avoid zero scale
            val s = if (scale == 0f) 1.0f else scale
            map[idx] = Pair(mean, s)
        }
        return map
    }

    // --- Helper: load target_names from app_config.json ---
    private fun loadTargetNames(configName: String): List<String> {
        val jsonStr = reactApplicationContext.assets.open(configName).bufferedReader().use { it.readText() }
        val tokener = JSONTokener(jsonStr)
        val obj = tokener.nextValue() as JSONObject
        val arr = obj.optJSONArray("target_names") ?: JSONArray()
        val names = mutableListOf<String>()
        for (i in 0 until arr.length()) {
            names.add(arr.optString(i))
        }
        return names
    }

    // --- Helper: parse JSON sequence from content URI ---
    private fun loadSequenceFromUri(uriString: String): List<FloatArray> {
        val uri = Uri.parse(uriString)
        val inputStream = reactApplicationContext.contentResolver.openInputStream(uri)
            ?: throw Exception("Cannot open URI: $uriString")
        val text = BufferedReader(InputStreamReader(inputStream)).use { it.readText() }

        val tokener = JSONTokener(text)
        val top = tokener.nextValue()
        // Expect either a top-level array (168 arrays of 47 floats) or an object with "sequence"
        val seqArray: JSONArray = when (top) {
            is JSONArray -> top
            is JSONObject -> {
                val o = top as JSONObject
                if (o.has("sequence")) o.getJSONArray("sequence") else throw Exception("JSON must be an array or contain 'sequence'")
            }
            else -> throw Exception("Invalid JSON format")
        }

        val result = mutableListOf<FloatArray>()
        for (i in 0 until seqArray.length()) {
            val row = seqArray.getJSONArray(i)
            val floats = FloatArray(row.length())
            for (j in 0 until row.length()) {
                floats[j] = row.optDouble(j, 0.0).toFloat()
            }
            result.add(floats)
        }
        return result
    }

    // --- Helper: build input ByteBuffer with normalization ---
    private fun buildInputBuffer(sequence: List<FloatArray>): ByteBuffer {
        val bb = ByteBuffer.allocateDirect(4 * inputDim)
        bb.order(ByteOrder.nativeOrder())

        // sequence is [168][47] ; put in row-major order [1,168,47]
        // Log quelques valeurs normalisées pour vérification
        var loggedSamples = 0
        for (t in 0 until sampleCount) {
            val row = sequence[t]
            for (f in 0 until featureCount) {
                val raw = row[f]
                val (mean, scale) = scalers[f] ?: Pair(0f, 1f)
                val norm = (raw - mean) / scale
                bb.putFloat(norm)
                
                // Log les 3 premières valeurs normalisées pour vérification
                if (t == 0 && f < 3 && loggedSamples < 3) {
                    Log.d(TAG, "    Normalisation feature[$f]: raw=$raw, mean=$mean, scale=$scale -> normalized=$norm")
                    loggedSamples++
                }
            }
        }

        bb.rewind()
        return bb
    }

    private fun generateDefaultTargets(): List<String> {
        val defaults = mutableListOf<String>()
        for (h in listOf("1h", "6h", "24h")) {
            for (v in listOf("temp", "humidity", "nh3", "co")) {
                defaults.add("${v}_${h}")
            }
        }
        return defaults
    }
}
