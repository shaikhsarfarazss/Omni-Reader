package com.omnireader.hybrid.reader

import android.graphics.Bitmap
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.Stable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path


@Immutable
data class DrawnPath(
    val path: Path,
    val color: Color,
    val strokeWidth: Float,
    val isEraser: Boolean = false
)

enum class ReaderTool {
    NONE, PEN, ERASER, CROP
}

/**
 * H-5: Marked @Stable so Compose skips expensive auto-generated equals() on Bitmap fields.
 * The currentBitmap is compared by reference only (identity), not by pixel content.
 */
@Stable
data class PdfReaderUiState(
    val isLoading: Boolean = false,
    val isReading: Boolean = false,
    val currentPage: Int = 0,
    val totalPages: Int = 0,
    val errorMessage: String? = null,
    val currentBitmap: Bitmap? = null,
    
    // Drawing & Tool State
    val currentTool: ReaderTool = ReaderTool.NONE,
    val paths: List<DrawnPath> = emptyList(),
    val undonePaths: List<DrawnPath> = emptyList()
) {
    // Override equals/hashCode to compare Bitmap by identity (reference), not by pixel content
    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (other !is PdfReaderUiState) return false
        return isLoading == other.isLoading &&
                isReading == other.isReading &&
                currentPage == other.currentPage &&
                totalPages == other.totalPages &&
                errorMessage == other.errorMessage &&
                currentBitmap === other.currentBitmap && // Reference equality for Bitmap
                currentTool == other.currentTool &&
                paths === other.paths &&
                undonePaths === other.undonePaths
    }

    override fun hashCode(): Int {
        var result = isLoading.hashCode()
        result = 31 * result + isReading.hashCode()
        result = 31 * result + currentPage
        result = 31 * result + totalPages
        result = 31 * result + (errorMessage?.hashCode() ?: 0)
        result = 31 * result + System.identityHashCode(currentBitmap)
        result = 31 * result + currentTool.hashCode()
        result = 31 * result + System.identityHashCode(paths)
        result = 31 * result + System.identityHashCode(undonePaths)
        return result
    }
}
