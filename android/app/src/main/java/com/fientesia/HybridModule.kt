package com.fientesia

import android.net.Uri
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
            val model = loadModelFile(modelName)
            val options = Interpreter.Options()
            options.addDelegate(FlexDelegate())   // <<< IMPORTANT

            interpreter = Interpreter(model, options)

            scalers = loadScalerParams(scalerName)
            targetNames = loadTargetNames(configName)

            promise.resolve("Model & scalers loaded")
        } catch (e: Exception) {
            promise.reject("MODEL_LOAD_ERROR", e)
        }
    }

    /** Classifier une séquence via son URI (fichier JSON) */
    @ReactMethod
    fun classifySequenceFromUri(uriString: String, promise: Promise) {
        try {
            if (interpreter == null) {
                promise.reject("NO_MODEL", "Model not loaded")
                return
            }

            val sequence = loadSequenceFromUri(uriString)
            if (sequence.size != sampleCount) {
                promise.reject("BAD_SHAPE", "Sequence length must be $sampleCount (got ${sequence.size})")
                return
            }
            for (r in sequence) {
                if (r.size != featureCount) {
                    promise.reject("BAD_SHAPE", "Each timestep must have $featureCount features")
                    return
                }
            }

            val inputBuffer = buildInputBuffer(sequence)
            val output = Array(1) { FloatArray(targetNames.size.coerceAtLeast(12)) } // ensure size >= 12

            interpreter!!.run(inputBuffer, output)

            // Build result
            val resultArray = WritableNativeArray()
            val names = if (targetNames.isNotEmpty()) targetNames else generateDefaultTargets()
            val out = output[0]
            for (i in out.indices) {
                val obj = WritableNativeMap()
                val label = if (i < names.size) names[i] else "out_$i"
                obj.putString("label", label)
                obj.putDouble("value", out[i].toDouble())
                resultArray.pushMap(obj)
            }

            promise.resolve(resultArray)
        } catch (e: Exception) {
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
        for (t in 0 until sampleCount) {
            val row = sequence[t]
            for (f in 0 until featureCount) {
                val raw = row[f]
                val (mean, scale) = scalers[f] ?: Pair(0f, 1f)
                val norm = (raw - mean) / scale
                bb.putFloat(norm)
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
