// ============================================================
// SYNCHRONIZED WORD HIGHLIGHTING & TEXT SELECTION
// ============================================================

function handleSelection() {
    if (currentMode === 'text' && isTextEditing) return;
    if (currentMode === 'edit') return;

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;

    const text = sel.toString().trim();
    if (text.length < 2) {
        if (!sel.isCollapsed && text.length === 0) deselectAll();
        return;
    }

    const container = document.getElementById('reader-view');
    if (!container || !container.contains(sel.anchorNode)) return;

    activeSelectedText = text;
    selectionWordIndices = [];
    const prefix = (currentMode === 'pdf') ? 'pdf-word-' : 'text-word-';
    const range = sel.getRangeAt(0);

    document.querySelectorAll(currentMode === 'pdf' ? '.word-span' : '.text-word-span').forEach(span => {
        if (range.intersectsNode(span)) {
            const id = parseInt(span.id.replace(prefix, ''), 10);
            if (!isNaN(id)) selectionWordIndices.push(id);
        }
    });

    if (selectionWordIndices.length > 0) {
        synth.cancel();
        isSelectionReading = true;
        if (currentMode === 'pdf') pdfActiveIndex = selectionWordIndices[0];
        else textActiveIndex = selectionWordIndices[0];
        updateHighlight();
        speakSelection(text);
    }
}

function speakSelection(text) {
    isSelectionReading = true;
    isPlaying = true;
    window.lastUpdateIdx = -1;
    updateUI();

    const words = (currentMode === 'pdf') ? pdfWords : textWords;
    utteranceWordMap = [];
    const parts = [];
    let pos = 0;

    for (let localIdx = 0; localIdx < selectionWordIndices.length; localIdx++) {
        const realIdx = selectionWordIndices[localIdx];
        const w = words[realIdx];
        if (!w || !w.trim()) continue;
        if (parts.length > 0) {
            parts.push(' ');
            pos += 1;
        }
        utteranceWordMap.push({
            start: pos,
            end: pos + w.length,
            index: realIdx,
            word: w,
            type: 'selection',
            mode: currentMode
        });
        parts.push(w);
        pos += w.length;
    }

    const textToRead = parts.join('');
    if (!textToRead.trim()) {
        isPlaying = false;
        isSelectionReading = false;
        updateUI();
        return;
    }
    TTSEngine.speak(textToRead, speed, currentVoice ? currentVoice.name : null);
}

function updateHighlight(modeOverride = currentMode) {
    const mode = modeOverride === 'pdf' ? 'pdf' : 'text';
    const activeIdx = (mode === 'pdf') ? pdfActiveIndex : textActiveIndex;
    if (activeIdx < 0) return;

    const activeWord = document.getElementById(`${mode}-word-${activeIdx}`);
    if (!activeWord || activeWord === lastHighlightedEl) return;

    if (lastHighlightedEl) lastHighlightedEl.classList.remove('active');
    activeWord.classList.add('active');
    lastHighlightedEl = activeWord;

    if (isSelectionReading && selectionWordIndices.length > 0) {
        if (!activeWord.classList.contains('selection-active')) {
            document.querySelectorAll('.selection-active').forEach(el => el.classList.remove('selection-active'));
            selectionWordIndices.forEach(idx => {
                const el = document.getElementById(`${mode}-word-${idx}`);
                if (el) el.classList.add('selection-active');
            });
        }
    }
}

function autoScroll(modeOverride = currentMode) {
    const mode = modeOverride === 'pdf' ? 'pdf' : 'text';
    const idx = (mode === 'pdf') ? pdfActiveIndex : textActiveIndex;
    const active = document.getElementById(`${mode}-word-${idx}`);
    if (!active) return;

    const scrollEl = (mode === 'pdf')
        ? document.getElementById('pdf-scroll-host')
        : document.getElementById('text-reader-display');
    if (!scrollEl) return;

    const wordRect = active.getBoundingClientRect();
    const containerRect = scrollEl.getBoundingClientRect();

    const isVisible = wordRect.top >= containerRect.top + 80
        && wordRect.bottom <= containerRect.bottom - 40;

    if (!isVisible) {
        active.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

function clearHighlights() {
    if (lastHighlightedEl) {
        lastHighlightedEl.classList.remove('active');
        lastHighlightedEl = null;
    }
    document.querySelectorAll('.word-span.active, .text-word-span.active').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.selection-active').forEach(el => el.classList.remove('selection-active'));
}

function deselectAll() {
    synth.cancel();
    isPlaying = false;
    isSelectionReading = false;
    pdfActiveIndex = -1;
    textActiveIndex = -1;
    activeSelectedText = '';
    selectionWordIndices = [];

    if (!document.activeElement || document.activeElement.id !== 'text-editor') {
        if (window.getSelection) {
            const sel = window.getSelection();
            if (sel && sel.empty) sel.empty();
            else if (sel && sel.removeAllRanges) sel.removeAllRanges();
        }
    }

    clearHighlights();
    updateUI();
}
