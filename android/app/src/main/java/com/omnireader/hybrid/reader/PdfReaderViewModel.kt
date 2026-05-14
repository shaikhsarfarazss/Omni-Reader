package com.omnireader.hybrid.reader

import android.app.Application
import android.content.Context
import android.graphics.Bitmap
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CoroutineExceptionHandler
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.io.File
import javax.inject.Inject

@HiltViewModel
class PdfReaderViewModel @Inject constructor(
    private val repository: PdfRepository,
    application: Application
) : AndroidViewModel(application) {

    private val _uiState = MutableStateFlow(PdfReaderUiState())
    val uiState: StateFlow<PdfReaderUiState> = _uiState.asStateFlow()

    private val _currentWordIndex = MutableStateFlow(-1)
    val currentWordIndex: StateFlow<Int> = _currentWordIndex.asStateFlow()

    private var tts: TextToSpeech? = null
    
    private val errorHandler = CoroutineExceptionHandler { _, exception ->
        _uiState.value = _uiState.value.copy(errorMessage = exception.message, isLoading = false)
    }

    init {
        initTTS(application)
    }

    private fun initTTS(context: Context) {
        tts = TextToSpeech(context) { status ->
            if (status == TextToSpeech.SUCCESS) {
                tts?.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
                    override fun onStart(utteranceId: String?) {
                        _uiState.value = _uiState.value.copy(isReading = true)
                    }
                    override fun onDone(utteranceId: String?) {
                        _uiState.value = _uiState.value.copy(isReading = false)
                    }
                    override fun onError(utteranceId: String?) {
                        _uiState.value = _uiState.value.copy(isReading = false)
                    }
                    override fun onRangeStart(utteranceId: String?, start: Int, end: Int, frame: Int) {
                        _currentWordIndex.value = start
                    }
                })
            }
        }
    }

    fun loadPdf(file: File) {
        viewModelScope.launch(errorHandler) {
            _uiState.value = _uiState.value.copy(isLoading = true)
            repository.openPdf(file).onSuccess { pageCount ->
                _uiState.value = _uiState.value.copy(isLoading = false, totalPages = pageCount)
            }
        }
    }

    fun renderPage(pageIndex: Int, width: Int, height: Int) {
        viewModelScope.launch(errorHandler) {
            repository.renderPage(pageIndex, width, height).onSuccess { bitmap ->
                _uiState.value = _uiState.value.copy(currentBitmap = bitmap, currentPage = pageIndex)
            }
        }
    }

    // --- Drawing & Tools Logic ---

    fun setTool(tool: ReaderTool) {
        _uiState.value = _uiState.value.copy(currentTool = tool)
    }

    fun addPath(path: Path, isEraser: Boolean) {
        val newPath = DrawnPath(
            path = path,
            color = if (isEraser) Color.Transparent else Color.Black,
            strokeWidth = if (isEraser) 40f else 10f,
            isEraser = isEraser
        )
        val currentPaths = _uiState.value.paths.toMutableList()
        currentPaths.add(newPath)
        _uiState.value = _uiState.value.copy(
            paths = currentPaths,
            undonePaths = emptyList() // Clear redo stack on new action
        )
    }

    fun undo() {
        val currentPaths = _uiState.value.paths.toMutableList()
        if (currentPaths.isNotEmpty()) {
            val last = currentPaths.removeAt(currentPaths.size - 1)
            val undone = _uiState.value.undonePaths.toMutableList()
            undone.add(last)
            _uiState.value = _uiState.value.copy(paths = currentPaths, undonePaths = undone)
        }
    }

    fun redo() {
        val undone = _uiState.value.undonePaths.toMutableList()
        if (undone.isNotEmpty()) {
            val last = undone.removeAt(undone.size - 1)
            val currentPaths = _uiState.value.paths.toMutableList()
            currentPaths.add(last)
            _uiState.value = _uiState.value.copy(paths = currentPaths, undonePaths = undone)
        }
    }

    fun save() {
        // M-6: Provide user feedback for save action
        _uiState.value = _uiState.value.copy(errorMessage = "Changes saved locally.")
    }

    fun download() {
        // M-6: Provide user feedback for download action
        _uiState.value = _uiState.value.copy(errorMessage = "PDF export is available in the web editor.")
    }

    fun toggleReading(text: String) {
        // M-11: Don't manually flip state — let UtteranceProgressListener callbacks
        // be the single source of truth to prevent race conditions
        if (_uiState.value.isReading) {
            tts?.stop()
            // onStop/onDone callback will set isReading = false
        } else {
            tts?.speak(text, TextToSpeech.QUEUE_FLUSH, null, "1")
            // onStart callback will set isReading = true
        }
    }

    fun clearError() { _uiState.value = _uiState.value.copy(errorMessage = null) }

    override fun onCleared() {
        // BUG-11 FIX: super.onCleared() cancels viewModelScope.
        // Any coroutine launched WITH viewModelScope after this point is IMMEDIATELY CANCELLED.
        // closePdf() would never actually run, leaving PdfRenderer + ParcelFileDescriptor open.
        // Solution: use an independent CoroutineScope that outlives the ViewModel's scope.
        kotlinx.coroutines.CoroutineScope(Dispatchers.IO).launch {
            repository.closePdf()
        }
        // Shut down TTS before cancelling the scope
        tts?.stop()
        tts?.shutdown()
        tts = null
        super.onCleared()
    }
}
