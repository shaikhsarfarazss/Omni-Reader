package com.omnireader.hybrid.reader

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.omnireader.hybrid.reader.components.PdfPageImage
import com.omnireader.hybrid.reader.components.PlayerBar
import com.omnireader.hybrid.reader.components.ReaderTopAppBar

@Composable
fun PdfReaderScreen(
    viewModel: PdfReaderViewModel = hiltViewModel(),
    onNavigateBack: () -> Unit
) {
    val uiState by viewModel.uiState.collectAsState()
    val snackbarHostState = remember { SnackbarHostState() }

    LaunchedEffect(uiState.errorMessage) {
        uiState.errorMessage?.let { errorMsg ->
            snackbarHostState.showSnackbar(message = errorMsg)
            viewModel.clearError()
        }
    }

    Scaffold(
        topBar = {
            ReaderTopAppBar(
                title = "OmniReader",
                onBackClick = onNavigateBack,
                onToolClick = { viewModel.setTool(it) },
                onUndoClick = { viewModel.undo() },
                onRedoClick = { viewModel.redo() },
                onSaveClick = { viewModel.save() },
                onDownloadClick = { viewModel.download() },
                onExitClick = onNavigateBack,
                currentTool = uiState.currentTool
            )
        },
        snackbarHost = { SnackbarHost(snackbarHostState) },
        bottomBar = {
            AnimatedVisibility(visible = uiState.totalPages > 0) {
                PlayerBar(
                    isReading = uiState.isReading,
                    onPlayPauseClick = {
                        viewModel.toggleReading("Reading logic goes here")
                    }
                )
            }
        }
    ) { paddingValues ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .background(Color(0xFFF5F5F5)),
            contentAlignment = Alignment.Center
        ) {
            if (uiState.isLoading && uiState.currentBitmap == null) {
                CircularProgressIndicator()
            } else if (uiState.totalPages > 0) {
                PdfPageImage(
                    bitmap = uiState.currentBitmap,
                    paths = uiState.paths,
                    currentTool = uiState.currentTool,
                    onPathAdded = { path, isEraser ->
                        viewModel.addPath(path, isEraser)
                    },
                    onSizeReady = { size ->
                        viewModel.renderPage(uiState.currentPage, size.width, size.height)
                    }
                )
            } else {
                Text(text = "No Document Loaded.", color = Color.Gray)
            }
        }
    }
}
