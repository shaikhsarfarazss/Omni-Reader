package com.omnireader.hybrid.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val LightColorScheme = lightColorScheme(
    primary = Color(0xFFE91E63),         // Vibrant Pink — OmniReader brand
    onPrimary = Color.White,
    primaryContainer = Color(0xFFFFD6E4),
    secondary = Color(0xFF4CAF50),
    onSecondary = Color.White,
    background = Color(0xFFF5F5F7),
    surface = Color.White,
    onBackground = Color(0xFF1C1B1F),
    onSurface = Color(0xFF1C1B1F),
    error = Color(0xFFBA1A1A)
)

@Composable
fun OmniReaderTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = LightColorScheme,
        content = content
    )
}
