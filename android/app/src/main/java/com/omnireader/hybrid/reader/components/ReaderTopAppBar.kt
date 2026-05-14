package com.omnireader.hybrid.reader.components


import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.omnireader.hybrid.reader.ReaderTool

@Preview
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ReaderTopAppBar(
    title: String,
    onBackClick: () -> Unit,
    onToolClick: (ReaderTool) -> Unit,
    onUndoClick: () -> Unit,    onRedoClick: () -> Unit,
    onSaveClick: () -> Unit,
    onDownloadClick: () -> Unit,
    onExitClick: () -> Unit,
    currentTool: ReaderTool
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.surface)
    ) {
        // First Header Line: Main Navigation & Title
        TopAppBar(
            modifier = Modifier.height(48.dp), // Smaller header
            title = {
                Text(
                    text = title,
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Bold
                )
            },
            navigationIcon = {
                IconButton(onClick = onBackClick) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back", modifier = Modifier.size(20.dp))
                }
            },
            actions = {
                IconButton(onClick = onExitClick) {
                    Icon(Icons.Default.Close, "Exit", modifier = Modifier.size(20.dp))
                }
            },
            colors = TopAppBarDefaults.topAppBarColors(containerColor = Color.Transparent)
        )

        // Second Header Line: Tools & Actions
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .height(40.dp) // Even smaller second line
                .padding(horizontal = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                ToolButton(
                    icon = Icons.Default.ContentCut,
                    label = "Crop",
                    isSelected = currentTool == ReaderTool.CROP,
                    onClick = { onToolClick(ReaderTool.CROP) }
                )
                ToolButton(
                    icon = Icons.Default.Edit,
                    label = "Pen",
                    isSelected = currentTool == ReaderTool.PEN,
                    onClick = { onToolClick(ReaderTool.PEN) }
                )
                ToolButton(
                    icon = Icons.Default.AutoFixNormal,
                    label = "Eraser",
                    isSelected = currentTool == ReaderTool.ERASER,
                    onClick = { onToolClick(ReaderTool.ERASER) }
                )
            }

            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onUndoClick, modifier = Modifier.size(32.dp)) {
                    Icon(Icons.Default.Undo, "Undo", modifier = Modifier.size(18.dp))
                }
                IconButton(onClick = onRedoClick, modifier = Modifier.size(32.dp)) {
                    Icon(Icons.Default.Redo, "Redo", modifier = Modifier.size(18.dp))
                }
                IconButton(onClick = onSaveClick, modifier = Modifier.size(32.dp)) {
                    Icon(Icons.Default.Save, "Save", modifier = Modifier.size(18.dp))
                }
                IconButton(onClick = onDownloadClick, modifier = Modifier.size(32.dp)) {
                    Icon(Icons.Default.Download, "Download", modifier = Modifier.size(18.dp))
                }
            }
        }
        HorizontalDivider(thickness = 0.5.dp, color = Color.LightGray)
    }
}

@Composable
fun ToolButton(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
    isSelected: Boolean,
    onClick: () -> Unit
) {
    IconButton(
        onClick = onClick,
        modifier = Modifier.size(36.dp)
    ) {
        Icon(
            imageVector = icon,
            contentDescription = label,
            tint = if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface,
            modifier = Modifier.size(20.dp)
        )
    }
}
