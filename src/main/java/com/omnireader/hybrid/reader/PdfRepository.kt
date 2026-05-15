package com.omnireader.hybrid.reader

import android.content.Context
import android.graphics.Bitmap
import android.graphics.pdf.PdfRenderer
import android.os.ParcelFileDescriptor
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import java.io.File
import javax.inject.Inject

import dagger.hilt.android.qualifiers.ApplicationContext

class PdfRepository @Inject constructor(
    @ApplicationContext private val context: Context
) {
    private var pdfRenderer: PdfRenderer? = null
    private var fileDescriptor: ParcelFileDescriptor? = null

    /**
     * BUG-03 FIX: closePdf() and renderPage() could run concurrently if the ViewModel
     * launches them from separate coroutines. A Mutex ensures only one operation
     * touches the PdfRenderer at a time, preventing NullPointerException.
     */
    private val lock = Mutex()

    /**
     * Opens a PDF file securely using a background thread.
     */
    suspend fun openPdf(file: File): Result<Int> = lock.withLock {
        withContext(Dispatchers.IO) {
            try {
                // Close any previously open renderer inside the lock to avoid TOCTOU
                _closePdfInternal()

                fileDescriptor = ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
                pdfRenderer = PdfRenderer(fileDescriptor!!)

                Result.success(pdfRenderer?.pageCount ?: 0)
            } catch (e: SecurityException) {
                _closePdfInternal()
                Result.failure(Exception("This PDF is password-protected and cannot be opened.", e))
            } catch (e: Exception) {
                _closePdfInternal()
                Result.failure(Exception("Corrupted or unreadable PDF file.", e))
            }
        }
    }

    /**
     * Renders a specific page of the PDF into a Bitmap.
     * All Matrix manipulations and Bitmap configurations are performed off the Main Thread.
     * Locked with the same Mutex as openPdf / closePdf to prevent concurrent access races.
     */
    suspend fun renderPage(pageIndex: Int, width: Int, height: Int): Result<Bitmap> = lock.withLock {
        withContext(Dispatchers.IO) {
            var page: PdfRenderer.Page? = null
            try {
                val renderer = pdfRenderer ?: throw IllegalStateException("PdfRenderer not initialized")
                if (pageIndex < 0 || pageIndex >= renderer.pageCount) {
                    throw IndexOutOfBoundsException("Invalid page index: $pageIndex")
                }

                page = renderer.openPage(pageIndex)
                val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)

                // White background to avoid transparent renders showing black areas
                bitmap.eraseColor(android.graphics.Color.WHITE)

                page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)

                Result.success(bitmap)
            } catch (e: Exception) {
                Result.failure(e)
            } finally {
                // Guarantee resource cleanup per page request
                page?.close()
            }
        }
    }

    /**
     * Safely closes open file descriptors.
     * Thread-safe: uses the same Mutex as renderPage.
     */
    suspend fun closePdf() = lock.withLock {
        withContext(Dispatchers.IO) {
            _closePdfInternal()
        }
    }

    /**
     * Internal close — must only be called while already holding [lock].
     */
    private fun _closePdfInternal() {
        try {
            pdfRenderer?.close()
        } catch (e: Exception) {
            // Ignore close exceptions
        } finally {
            pdfRenderer = null
        }

        try {
            fileDescriptor?.close()
        } catch (e: Exception) {
            // Ignore close exceptions
        } finally {
            fileDescriptor = null
        }
    }
}
