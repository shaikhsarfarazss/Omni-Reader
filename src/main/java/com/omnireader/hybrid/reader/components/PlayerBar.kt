package com.omnireader.hybrid.reader.components

import androidx.compose.animation.*
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.FastForward
import androidx.compose.material.icons.filled.FastRewind
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

@Composable
fun PlayerBar(
    isReading: Boolean,
    onPlayPauseClick: () -> Unit,
    onPreviousPage: (() -> Unit)? = null,
    onNextPage: (() -> Unit)? = null,
    modifier: Modifier = Modifier
) {
    // A floating bar that represents the TTS Playback controls
    Box(
        modifier = modifier
            .fillMaxWidth()
            .padding(16.dp),
        contentAlignment = Alignment.BottomCenter
    ) {
        Surface(
            modifier = Modifier
                .shadow(12.dp, RoundedCornerShape(24.dp))
                .clip(RoundedCornerShape(24.dp)),
            color = Color.White
        ) {
            Row(
                modifier = Modifier
                    .padding(horizontal = 24.dp, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                // M-9: Previous Page Button (enabled only when callback is provided)
                IconButton(
                    onClick = { onPreviousPage?.invoke() },
                    enabled = onPreviousPage != null
                ) {
                    Icon(Icons.Default.FastRewind, "Previous", modifier = Modifier.size(24.dp))
                }

                // Play / Pause Button with slight color difference
                FloatingActionButton(
                    onClick = onPlayPauseClick,
                    containerColor = if (isReading) Color(0xFFE91E63) else Color(0xFF4CAF50),
                    contentColor = Color.White,
                    shape = CircleShape,
                ) {
                    Icon(
                        imageVector = if (isReading) Icons.Default.Pause else Icons.Default.PlayArrow,
                        contentDescription = if (isReading) "Pause" else "Play",
                        modifier = Modifier.size(28.dp)
                    )
                }

                // M-9: Next Page Button (enabled only when callback is provided)
                IconButton(
                    onClick = { onNextPage?.invoke() },
                    enabled = onNextPage != null
                ) {
                    Icon(Icons.Default.FastForward, "Next", modifier = Modifier.size(24.dp))
                }
            }
        }
    }
}

