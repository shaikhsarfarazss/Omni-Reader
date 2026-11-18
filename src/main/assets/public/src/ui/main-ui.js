// ============================================================
// MAIN UI NAVIGATION, TEXT MODE & LAYOUT CONTROLS
// ============================================================

let _editInitTimer = null;

function toggleTextEdit(editing) {
    isTextEditing = editing;
    const reader = document.getElementById('text-reader-display');
    const editBtn = document.getElementById('edit-text-btn');
    const readBtn = document.getElementById('read-text-btn');
    const editor = document.getElementById('text-editor');
    if (!reader || !editor) return;

    reader.classList.remove('hidden');

    if (editing) {
        synth.cancel();
        isPlaying = false;
        updateUI();

        reader.innerText = editor.value || '';
        reader.contentEditable = 'true';
        reader.focus();
        if (editBtn) editBtn.classList.add('hidden');
        if (readBtn) readBtn.classList.remove('hidden');
    } else {
        reader.contentEditable = 'false';
        reader.blur();
        if (editBtn) editBtn.classList.remove('hidden');
        if (readBtn) readBtn.classList.add('hidden');
        reRenderTextWithSpans();
    }

    const wordsCount = (editor.value || '').split(/\s+/).filter(w => w.trim()).length;
    updateWordCountBadge(wordsCount);
}

function onTextContentInput(el) {
    const text = el ? el.innerText : '';
    const editor = document.getElementById('text-editor');
    if (editor) editor.value = text;
    try { localStorage.setItem('OMNI_SAVED_TEXT', text); } catch (e) {}

    const wordsCount = text.split(/\s+/).filter(w => w.trim()).length;
    updateWordCountBadge(wordsCount);
}

function onTextChange() {
    const display = document.getElementById('text-reader-display');
    if (!display) return;
    textWords = display.innerText.split(/\s+/).filter(w => w.length > 0);
    updateWordCountBadge(textWords.length);
}

function reRenderTextWithSpans() {
    const editor = document.getElementById('text-editor');
    const reader = document.getElementById('text-reader-display');
    if (!editor || !reader) return;

    const words = (editor.value || '').split(/(\s+)/);
    const fragment = document.createDocumentFragment();
    let globalIdx = 0;
    textWords = [];
    readerTokenMeta.text = [];

    words.forEach(word => {
        if (!word.trim()) {
            fragment.appendChild(document.createTextNode(word));
            return;
        }
        const idx = globalIdx++;
        textWords.push(word);
        const span = document.createElement('span');
        span.id = `text-word-${idx}`;
        span.className = 'text-word-span';
        span.textContent = word;
        span.onclick = () => jumpToWord(idx);
        readerTokenMeta.text[idx] = { index: idx, text: word, elementId: span.id, mode: 'text' };
        fragment.appendChild(span);
    });

    reader.replaceChildren(fragment);
    updateWordCountBadge(textWords.length);
}

function showDashboard() {
    synth.cancel();
    isPlaying = false;
    updateUI();

    const editor = document.getElementById('text-editor');
    if (editor) editor.value = '';
    try { localStorage.removeItem('OMNI_SAVED_TEXT'); } catch (e) {}

    const modeToggle = document.getElementById('mode-toggle-container');
    const toolsContainer = document.getElementById('tools-container');
    if (modeToggle) modeToggle.classList.add('hidden');
    if (toolsContainer) toolsContainer.classList.add('hidden');

    pdfWords = [];
    textWords = [];
    readerTokenMeta.pdf = [];
    readerTokenMeta.text = [];
    pdfActiveIndex = -1;
    textActiveIndex = -1;
    pdfDoc = null;
    lastSyncedPdf = null;
    isSelectionReading = false;
    activeSelectedText = '';
    selectionWordIndices = [];

    const pdfRender = document.getElementById('pdf-render-container');
    if (pdfRender) pdfRender.innerHTML = '';
    const textDisplay = document.getElementById('text-reader-display');
    if (textDisplay) textDisplay.innerHTML = '';
    updateWordCountBadge(0);
    const fileUpload = document.getElementById('file-upload');
    if (fileUpload) fileUpload.value = '';

    const dashboard = document.getElementById('dashboard-view');
    if (dashboard) {
        dashboard.style.display = 'flex';
        dashboard.classList.remove('opacity-0', 'pointer-events-none');
    }

    const readerView = document.getElementById('reader-view');
    if (readerView) readerView.classList.add('opacity-0', 'pointer-events-none');
    const playerBar = document.getElementById('player-bar');
    if (playerBar) playerBar.classList.add('translate-y-32');

    if (fabricCanvas) {
        try {
            fabricCanvas.clear();
            fabricCanvas.dispose();
        } catch (e) {}
        fabricCanvas = null;
    }
    editorHistory = [];
    redoStack = [];
    const canvasWrapper = document.getElementById('canvas-wrapper');
    if (canvasWrapper) canvasWrapper.innerHTML = '<canvas id="editor-canvas" class="shadow-2xl"></canvas>';

    const editorContainer = document.getElementById('editor-container');
    if (editorContainer) {
        editorContainer.classList.add('hidden');
        editorContainer.style.display = 'none';
    }
    const header = document.querySelector('header');
    if (header) header.classList.remove('hidden');

    scale = 1;
    currentX = 0;
    currentY = 0;
    updateTransform();
    currentMode = 'pdf';
}

function hideDashboard() {
    const dashboard = document.getElementById('dashboard-view');
    if (dashboard) {
        dashboard.classList.add('opacity-0', 'pointer-events-none');
        setTimeout(() => {
            if (dashboard.classList.contains('opacity-0')) dashboard.style.display = 'none';
        }, 450);
    }
    const readerView = document.getElementById('reader-view');
    if (readerView) readerView.classList.remove('opacity-0', 'pointer-events-none');
    const playerBar = document.getElementById('player-bar');
    if (playerBar) playerBar.classList.remove('translate-y-32');
    const modeToggle = document.getElementById('mode-toggle-container');
    if (modeToggle) modeToggle.classList.remove('hidden');
    const toolsContainer = document.getElementById('tools-container');
    if (toolsContainer) toolsContainer.classList.remove('hidden');
}

function showTextView() {
    hideDashboard();
    switchMode('text');
}

function switchMode(mode) {
    synth.cancel();
    isPlaying = false;
    isSelectionReading = false;
    activeSelectedText = '';
    selectionWordIndices = [];

    if (_editInitTimer) {
        clearTimeout(_editInitTimer);
        _editInitTimer = null;
    }

    if (mode === 'edit' && !pdfDoc) {
        showToast('Please open a PDF file first before using the editor.', 3000);
        return;
    }

    currentMode = mode;

    if (window.getSelection) {
        const sel = window.getSelection();
        if (sel && sel.empty) sel.empty();
        else if (sel && sel.removeAllRanges) sel.removeAllRanges();
    }

    const pdfContainer = document.getElementById('pdf-viewport-container');
    const textContainer = document.getElementById('text-container');
    const editorContainer = document.getElementById('editor-container');
    const pdfControls = document.getElementById('pdf-view-controls');
    const mainHeader = document.querySelector('header');

    if (pdfContainer) pdfContainer.classList.add('hidden');
    if (textContainer) textContainer.classList.add('hidden');
    if (editorContainer) {
        editorContainer.classList.add('hidden');
        editorContainer.style.display = 'none';
    }

    if (mode === 'pdf') {
        if (pdfContainer) pdfContainer.classList.remove('hidden');
        if (pdfControls) pdfControls.classList.remove('hidden');
        if (mainHeader) mainHeader.classList.remove('hidden');
        setTimeout(() => updateTransform(), 50);
    } else if (mode === 'text') {
        if (textContainer) textContainer.classList.remove('hidden');
        if (pdfControls) pdfControls.classList.add('hidden');
        if (mainHeader) mainHeader.classList.remove('hidden');
    } else if (mode === 'edit') {
        if (editorContainer) {
            editorContainer.classList.remove('hidden');
            editorContainer.style.display = 'flex';
            void editorContainer.offsetHeight;
        }
        if (pdfControls) pdfControls.classList.add('hidden');

        _editInitTimer = setTimeout(() => {
            _editInitTimer = null;
            initEditor();
            syncPdfToEditor();
        }, 100);
    }

    const wordCountContainer = document.getElementById('word-count-container');
    if (wordCountContainer) {
        if (mode === 'edit') {
            wordCountContainer.classList.add('hidden');
        } else {
            wordCountContainer.classList.remove('hidden');
            const wordsCount = (mode === 'pdf') ? pdfWords.length : textWords.filter(w => w.trim()).length;
            updateWordCountBadge(wordsCount);
        }
    }

    const tools = document.getElementById('tools-container');
    const player = document.getElementById('player-bar');
    if (mode === 'edit') {
        if (tools) tools.classList.add('hidden');
        if (player) player.classList.add('hidden', 'translate-y-32');
    } else {
        if (tools) tools.classList.remove('hidden');
        if (player) player.classList.remove('hidden', 'translate-y-32');
    }

    document.querySelectorAll('#mode-toggle-container button[id^="tab-"]').forEach(b => {
        b.classList.remove('bg-white', 'shadow-sm', 'text-primary-pink');
        b.classList.add('text-gray-500');
    });
    const activeTab = document.getElementById(`tab-${mode}`);
    if (activeTab) {
        activeTab.classList.add('bg-white', 'shadow-sm', 'text-primary-pink');
        activeTab.classList.remove('text-gray-500');
    }

    if (mode === 'text') {
        const editor = document.getElementById('text-editor');
        const hasText = editor && editor.value.trim().length > 0;
        toggleTextEdit(!hasText);
    }
    updateHighlight();
    updateUI();
}

function toggleTwoPage() {
    if (isTwoPage) {
        isTwoPage = false;
        const btn = document.getElementById('btn-two-page');
        if (btn) btn.classList.remove('text-primary-pink', 'bg-pink-50');
        if (pdfDoc) renderPdf(null, true);
    } else {
        const modal = document.getElementById('two-page-options-modal');
        if (modal) modal.classList.remove('hidden');
    }
}

function setTwoPageMode(option) {
    twoPageOption = option;
    isTwoPage = true;
    const btn = document.getElementById('btn-two-page');
    if (btn) btn.classList.add('text-primary-pink', 'bg-pink-50');

    closeTwoPageOptions();
    if (pdfDoc) renderPdf(null, true);

    const notify = document.getElementById('layout-notification');
    if (notify) {
        notify.innerText = (option === 1) ? 'Pairs: (1, 2), (3, 4)...' : 'Pairs: (1), (2, 3), (4, 5)...';
        notify.classList.remove('opacity-0');
        setTimeout(() => notify.classList.add('opacity-0'), 3000);
    }
}

function closeTwoPageOptions() {
    const modal = document.getElementById('two-page-options-modal');
    if (modal) modal.classList.add('hidden');
}

window.handleNativeFile = async (base64Data, fileName) => {
    try {
        const lowerName = (fileName || '').toLowerCase();
        if (lowerName.endsWith('.txt')) {
            const text = atob(base64Data);
            const editor = document.getElementById('text-editor');
            if (editor) editor.value = text;
            try { localStorage.setItem('OMNI_SAVED_TEXT', text); } catch (e) {}
            hideDashboard();
            switchMode('text');
            toggleTextEdit(false);
            return;
        }

        const byteCharacters = atob(base64Data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const blob = new Blob([new Uint8Array(byteNumbers)], { type: 'application/pdf' });
        const file = new File([blob], fileName || 'document.pdf', { type: 'application/pdf' });

        await renderPdf(file);
        hideDashboard();
        switchMode('pdf');
    } catch (err) {
        console.error('Native File Error:', err);
        showToast('Failed to process file from Android.', 3000);
    }
};
