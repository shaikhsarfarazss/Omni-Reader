package com.omnireader.hybrid.reader.components

import android.graphics.Bitmap
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.*
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.unit.IntSize
import com.omnireader.hybrid.reader.DrawnPath
import com.omnireader.hybrid.reader.ReaderTool

@Composable
fun PdfPageImage(
    bitmap: Bitmap?,
    paths: List<DrawnPath>,
    currentTool: ReaderTool,
    onPathAdded: (Path, Boolean) -> Unit,
    onSizeReady: (IntSize) -> Unit,
    modifier: Modifier = Modifier
) {
    // M-5: Guard against infinite re-render loops by tracking last rendered size
    var lastRenderedSize by remember { mutableStateOf(IntSize.Zero) }

    if (bitmap == null) {
        Box(
            modifier = modifier
                .fillMaxSize()
                .onSizeChanged { size ->
                    if (size != lastRenderedSize && size.width > 0 && size.height > 0) {
                        lastRenderedSize = size
                        onSizeReady(size)
                    }
                }
        )
        return
    }

    var currentPath by remember { mutableStateOf<Path?>(null) }
    // H-6: Use a revision counter instead of null-swap to force Canvas redraw
    var pathRevision by remember { mutableIntStateOf(0) }

    Box(
        modifier = modifier
            .fillMaxSize()
            .onSizeChanged { size ->
                if (size != lastRenderedSize && size.width > 0 && size.height > 0) {
                    lastRenderedSize = size
                    onSizeReady(size)
                }
            }
            .pointerInput(currentTool) {
                if (currentTool == ReaderTool.PEN || currentTool == ReaderTool.ERASER) {
                    detectDragGestures(
                        onDragStart = { offset ->
                            currentPath = Path().apply { moveTo(offset.x, offset.y) }
                        },
                        onDrag = { change, _ ->
                            currentPath?.lineTo(change.position.x, change.position.y)
                            // H-6: Increment revision counter to trigger targeted Canvas redraw
                            pathRevision++
                        },
                        onDragEnd = {
                            currentPath?.let {
                                onPathAdded(it, currentTool == ReaderTool.ERASER)
                            }
                            currentPath = null
                        }
                    )
                }
            }
    ) {
        // Base PDF Image
        Image(
            bitmap = bitmap.asImageBitmap(),
            contentDescription = "PDF Page",
            contentScale = ContentScale.Fit,
            modifier = Modifier.fillMaxSize()
        )

        // Drawing Layer
        Canvas(
            modifier = Modifier
                .fillMaxSize()
                .graphicsLayer(compositingStrategy = CompositingStrategy.Offscreen)
        ) {
            // H-6: Reference pathRevision so Canvas redraws when it changes
            pathRevision.let { _ ->
                // Draw existing paths
                paths.forEach { drawnPath ->
                    drawPath(
                        path = drawnPath.path,
                        color = drawnPath.color,
                        style = Stroke(width = drawnPath.strokeWidth, cap = StrokeCap.Round, join = StrokeJoin.Round),
                        blendMode = if (drawnPath.isEraser) BlendMode.Clear else BlendMode.SrcOver
                    )
                }

                // Draw current path in real-time
                currentPath?.let { path ->
                    drawPath(
                        path = path,
                        color = if (currentTool == ReaderTool.ERASER) Color.Transparent else Color.Black,
                        style = Stroke(
                            width = if (currentTool == ReaderTool.ERASER) 40f else 10f,
                            cap = StrokeCap.Round,
                            join = StrokeJoin.Round
                        ),
                        blendMode = if (currentTool == ReaderTool.ERASER) BlendMode.Clear else BlendMode.SrcOver
                    )
                }
            }
        }
    }
}

