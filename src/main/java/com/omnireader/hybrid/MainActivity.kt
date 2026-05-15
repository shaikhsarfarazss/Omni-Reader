package com.omnireader.hybrid

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.util.Log
import android.media.AudioAttributes
import androidx.activity.compose.setContent
import androidx.activity.viewModels
import androidx.compose.runtime.*
import androidx.lifecycle.lifecycleScope
import com.getcapacitor.BridgeActivity
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.omnireader.hybrid.reader.PdfReaderScreen
import com.omnireader.hybrid.reader.PdfReaderViewModel
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileOutputStream
import java.util.Locale

@AndroidEntryPoint
class MainActivity : BridgeActivity() {

    private val pdfReaderViewModel: PdfReaderViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        registerPlugin(NativeTTS::class.java)
        super.onCreate(savedInstanceState)

        // Handle incoming file intent (when app is opened via a PDF from file manager)
        handleIncomingIntent(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleIncomingIntent(intent)
    }

    /**
     * BUG-01 FIX: copyUriToTempFile performs blocking I/O and MUST run on a background thread.
     * Previously this ran on the Main Thread, which would trigger an ANR on Android 14+.
     * We now use lifecycleScope + Dispatchers.IO, then switch back to Main to update UI.
     *
     * Intercepts share/open intents for PDF files, copies to private storage (bypassing sandbox
     * limitations that block direct content URI access on Android 10+), then loads into ViewModel.
     */
    private fun handleIncomingIntent(intent: Intent?) {
        if (intent?.action == Intent.ACTION_VIEW) {
            val uri: Uri? = intent.data
            val mimeType = intent.type ?: contentResolver.getType(uri ?: return)

            if (mimeType == "application/pdf" && uri != null) {
                // BUG-01: Offload I/O to background thread
                lifecycleScope.launch(Dispatchers.IO) {
                    val tempFile = copyUriToTempFile(uri, "incoming_pdf.pdf")
                    withContext(Dispatchers.Main) {
                        if (tempFile != null) {
                            // Switch to native Compose reader for PDF files
                            setContent {
                                com.omnireader.hybrid.ui.theme.OmniReaderTheme {
                                    PdfReaderScreen(
                                        viewModel = pdfReaderViewModel,
                                        onNavigateBack = {
                                            // Fall back to Capacitor WebView on back navigation
                                            recreate()
                                        }
                                    )
                                }
                            }
                            pdfReaderViewModel.loadPdf(tempFile)
                        } else {
                            Log.e("MainActivity", "Failed to copy PDF to temp file — intent URI: $uri")
                        }
                    }
                }
            }
        }
    }

    /**
     * Copies a content URI to an app-private temp file so PdfRenderer (which needs a real file path)
     * can safely access it without running into permission denied crashes on Android 10+.
     * Must be called from a background thread (see BUG-01).
     */
    private fun copyUriToTempFile(uri: Uri, fileName: String): File? {
        return try {
            val tempFile = File(cacheDir, fileName)
            contentResolver.openInputStream(uri)?.use { inputStream ->
                FileOutputStream(tempFile).use { outputStream ->
                    inputStream.copyTo(outputStream)
                }
            }
            tempFile
        } catch (e: Exception) {
            Log.e("MainActivity", "Failed to copy URI to temp file: ${e.message}", e)
            null
        }
    }
}

@CapacitorPlugin(name = "NativeTTS")
class NativeTTS : Plugin() {
    private var tts: TextToSpeech? = null
    private var isReady = false
    private var initializationStatus: Int = TextToSpeech.ERROR
    private val TAG = "NativeTTS"

    // BUG-02 FIX: Guard all notifyListeners calls against a destroyed plugin.
    // Without this, the UtteranceProgressListener captures a reference to the Plugin
    // and fires callbacks after the Activity/Plugin is destroyed → memory leak + crash.
    @Volatile
    private var isDestroyed = false

    override fun load() {
        super.load()
        initTTS()
    }

    private fun initTTS() {
        Log.d(TAG, "Initializing TTS Engine...")
        tts?.shutdown()
        tts = TextToSpeech(context) { status ->
            initializationStatus = status
            isReady = (status == TextToSpeech.SUCCESS)
            Log.d(TAG, "TTS Init finished with status: $status, isReady: $isReady")

            if (isReady) {
                val result = tts?.setLanguage(Locale.getDefault())
                Log.d(TAG, "TTS Language default set result: $result")

                val audioAttributes = AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build()
                tts?.setAudioAttributes(audioAttributes)
                
                tts?.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
                    override fun onStart(utteranceId: String?) {
                        Log.d(TAG, "TTS onStart: $utteranceId")
                        if (isDestroyed) return  // BUG-02
                        val data = JSObject()
                        data.put("event", "start")
                        data.put("utteranceId", utteranceId)
                        notifyListeners("onTTSStateChange", data)
                    }

                    override fun onDone(utteranceId: String?) {
                        Log.d(TAG, "TTS onDone: $utteranceId")
                        if (isDestroyed) return  // BUG-02
                        // BUG-07 FIX: Only use the _last suffix as the canonical end signal.
                        // The fallback `count { '_' } < 3` was unreliable and removed.
                        if (utteranceId?.endsWith("_last") == true) {
                            val data = JSObject()
                            data.put("event", "end")
                            data.put("utteranceId", utteranceId)
                            notifyListeners("onTTSStateChange", data)
                        }
                    }

                    @Deprecated("Deprecated in Java")
                    override fun onError(utteranceId: String?) {
                        Log.e(TAG, "TTS onError: $utteranceId")
                        if (isDestroyed) return  // BUG-02
                        notifyError("TTS Generic Error: $utteranceId")
                    }

                    override fun onError(utteranceId: String?, errorCode: Int) {
                        Log.e(TAG, "TTS onError code $errorCode for: $utteranceId")
                        if (isDestroyed) return  // BUG-02
                        notifyError("TTS Error Code: $errorCode")
                    }

                    override fun onRangeStart(utteranceId: String?, start: Int, end: Int, frame: Int) {
                        if (isDestroyed) return  // BUG-02
                        val parts = utteranceId?.split("_")
                        val offset = parts?.getOrNull(2)?.toIntOrNull() ?: 0
                        val data = JSObject()
                        data.put("charIndex", start + offset)
                        notifyListeners("onBoundary", data)
                    }

                    override fun onStop(utteranceId: String?, interrupted: Boolean) {
                        Log.d(TAG, "TTS onStop (interrupted: $interrupted): $utteranceId")
                        if (isDestroyed) return  // BUG-02
                        val data = JSObject()
                        data.put("event", "stop")
                        notifyListeners("onTTSStateChange", data)
                    }
                })
            }
        }
    }

    private fun notifyError(msg: String) {
        val data = JSObject()
        data.put("event", "error")
        data.put("message", msg)
        notifyListeners("onTTSStateChange", data)
    }

    @PluginMethod
    fun reinitialize(call: PluginCall) {
        initTTS()
        call.resolve()
    }

    @PluginMethod
    fun speak(call: PluginCall) {
        val text = call.getString("text") ?: return call.reject("No text provided")
        val rate = call.getFloat("rate", 1.0f)!!
        val voiceName = call.getString("voice")

        if (!isReady) {
            Log.w(TAG, "TTS not ready, retrying in 1000ms")
            android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
                if (isReady) performSpeak(call, text, rate, voiceName)
                else call.reject("TTS not initialized after retry")
            }, 1000)
            return
        }

        performSpeak(call, text, rate, voiceName)
    }

    data class TextChunk(val text: String, val offset: Int, val isLast: Boolean)

    private fun chunkText(text: String, maxLength: Int): List<TextChunk> {
        val chunks = mutableListOf<TextChunk>()
        var currentIndex = 0

        while (currentIndex < text.length) {
            var endIndex = currentIndex + maxLength
            if (endIndex >= text.length) {
                endIndex = text.length
            } else {
                var breakIndex = -1
                for (i in endIndex downTo currentIndex) {
                    val c = text[i]
                    if (c.isWhitespace() || c == '.' || c == ',' || c == '!' || c == '?' || c == '\n') {
                        breakIndex = i
                        break
                    }
                }
                if (breakIndex != -1 && breakIndex > currentIndex) {
                    endIndex = breakIndex + 1
                }
            }

            val chunkContent = text.substring(currentIndex, endIndex)
            val isLast = endIndex >= text.length
            chunks.add(TextChunk(chunkContent, currentIndex, isLast))
            currentIndex = endIndex
        }
        return chunks
    }

    private fun performSpeak(call: PluginCall, text: String, rate: Float, voiceName: String?) {
        try {
            tts?.stop()
            tts?.setSpeechRate(rate)

            if (voiceName != null) {
                val voices = tts?.voices
                val selectedVoice = voices?.find { it.name == voiceName }
                if (selectedVoice != null) {
                    tts?.voice = selectedVoice
                    tts?.language = selectedVoice.locale
                    Log.d(TAG, "Voice set to: ${selectedVoice.name}, Language: ${selectedVoice.locale}")
                }
            }

            val maxLength = TextToSpeech.getMaxSpeechInputLength() - 100
            val chunks = chunkText(text, maxLength)
            val baseUtteranceId = "omni_${System.currentTimeMillis()}"

            chunks.forEachIndexed { index, chunk ->
                val params = android.os.Bundle()
                val isLastStr = if (chunk.isLast) "last" else "notlast"
                val chunkUtteranceId = "${baseUtteranceId}_${chunk.offset}_${isLastStr}"
                params.putString(TextToSpeech.Engine.KEY_PARAM_UTTERANCE_ID, chunkUtteranceId)

                val queueMode = if (index == 0) TextToSpeech.QUEUE_FLUSH else TextToSpeech.QUEUE_ADD
                val result = tts?.speak(chunk.text, queueMode, params, chunkUtteranceId)
                
                if (result == TextToSpeech.ERROR) {
                    Log.e(TAG, "TTS speak returned ERROR for chunk $index. Force-reinitializing...")
                    if (index == 0) {
                        // If it fails on the first chunk, it's likely a dead engine state.
                        initTTS()
                        call.reject("Speech engine was stuck. Reinitializing... Please try once more.", "STUCK_REINIT")
                        return
                    }
                }
            }

            call.resolve()
        } catch (e: Exception) {
            Log.e(TAG, "TTS speak exception: ${e.message}", e)
            call.reject("TTS speak failed: ${e.message}")
        }
    }

    @PluginMethod
    fun stop(call: PluginCall) {
        tts?.stop()
        Log.d(TAG, "TTS stopped")
        call.resolve()
    }

    @PluginMethod
    fun getVoices(call: PluginCall) {
        if (!isReady) {
            call.reject("TTS not ready")
            return
        }

        val voices = tts?.voices ?: run {
            call.reject("No voices available")
            return
        }

        val result = JSObject()
        val voicesArray = com.getcapacitor.JSArray()

        voices.filter { voice ->
            !voice.isNetworkConnectionRequired &&
                    (tts?.isLanguageAvailable(voice.locale) ?: TextToSpeech.LANG_NOT_SUPPORTED) >= TextToSpeech.LANG_AVAILABLE
        }
            .sortedBy { it.locale.displayName }
            .forEach { voice ->
                val voiceObj = JSObject()
                voiceObj.put("name", voice.name)
                voiceObj.put("locale", voice.locale.toLanguageTag())
                voiceObj.put("label", voice.locale.displayName)
                voicesArray.put(voiceObj)
            }
        Log.d(TAG, "Returning ${voicesArray.length()} robust local voices")

        result.put("voices", voicesArray)
        call.resolve(result)
    }

    override fun handleOnDestroy() {
        // BUG-02 FIX: Set the destroyed flag BEFORE shutdown so in-flight callbacks don't
        // try to call notifyListeners on a dead plugin instance.
        isDestroyed = true
        tts?.stop()
        tts?.shutdown()
        tts = null
        Log.d(TAG, "TTS shutdown cleanly")
    }
}
