package com.fientesia

import android.graphics.BitmapFactory
import android.graphics.Bitmap
import android.net.Uri
import com.facebook.react.bridge.*
import org.tensorflow.lite.Interpreter
import java.io.FileInputStream
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.MappedByteBuffer
import java.nio.channels.FileChannel

class TFLiteModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private var interpreter: Interpreter? = null
    private val inputSize = 224
    private val imageMean = 127.5f
    private val imageStd = 127.5f
    private var labels: List<String> = emptyList()

    override fun getName(): String {
        return "TFLiteModule"
    }

    /** Charger le modèle */
    @ReactMethod
    fun loadModel(modelName: String, labelsName: String, promise: Promise) {
        try {
            val model = loadModelFile(modelName)
            interpreter = Interpreter(model)

            // Charger labels.txt
            labels = loadLabels(labelsName)

            promise.resolve("Model Loaded")
        } catch (e: Exception) {
            promise.reject("MODEL_ERROR", e)
        }
    }

    /** Classifier une image via son URI */
    @ReactMethod
    fun classifyImage(imageUri: String, promise: Promise) {
        try {
            if (interpreter == null) {
                promise.reject("NO_MODEL", "Model not loaded")
                return
            }

            val bitmap = loadAndResize(imageUri)
            val inputBuffer = convertBitmapToTensor(bitmap)

            val output = Array(1) { FloatArray(labels.size) }
            interpreter!!.run(inputBuffer, output)

            val resultArray = WritableNativeArray()

            for (i in labels.indices) {
                val obj = WritableNativeMap()
                obj.putString("label", labels[i])
                obj.putDouble("probability", output[0][i].toDouble())
                resultArray.pushMap(obj)
            }

            promise.resolve(resultArray)

        } catch (e: Exception) {
            promise.reject("INFERENCE_ERROR", e)
        }
    }

    // Charger modèle .tflite
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

    // Charger labels.txt
    private fun loadLabels(labelsName: String): List<String> {
        return reactApplicationContext.assets.open(labelsName)
            .bufferedReader()
            .readLines()
    }

    // Charger et redimensionner l'image → 224×224
    private fun loadAndResize(uriString: String): Bitmap {
        val uri = Uri.parse(uriString)
        val stream = reactApplicationContext.contentResolver.openInputStream(uri)
        val bitmap = BitmapFactory.decodeStream(stream)
        return Bitmap.createScaledBitmap(bitmap, inputSize, inputSize, true)
    }

    // Convertir Bitmap → Float32 Tensor normalisé : (x − 127.5) / 127.5
    private fun convertBitmapToTensor(bitmap: Bitmap): ByteBuffer {
        val inputBuffer = ByteBuffer.allocateDirect(4 * inputSize * inputSize * 3)
        inputBuffer.order(ByteOrder.nativeOrder())

        val pixels = IntArray(inputSize * inputSize)
        bitmap.getPixels(pixels, 0, bitmap.width, 0, 0, bitmap.width, bitmap.height)

        var pixelIndex = 0
        for (y in 0 until inputSize) {
            for (x in 0 until inputSize) {
                val value = pixels[pixelIndex++]

                val r = ((value shr 16) and 0xFF)
                val g = ((value shr 8) and 0xFF)
                val b = (value and 0xFF)

                // MobileNetV2 normalization [-1, +1]
                inputBuffer.putFloat((r - imageMean) / imageStd)
                inputBuffer.putFloat((g - imageMean) / imageStd)
                inputBuffer.putFloat((b - imageMean) / imageStd)
            }
        }

        return inputBuffer
    }
}
