// ============================================================
// PLAYER BAR CONTROLLER & VOICE / SPEED CONTROLS
// ============================================================

function toggleMinimizePlayer(e) {
    if (e && e.target && e.target.closest('button')) return;
    const bar = document.getElementById('player-bar');
    if (!bar) return;
    isPlayerMinimized = !isPlayerMinimized;

    if (isPlayerMinimized) {
        bar.classList.add('minimized');
        if (!bar.style.getPropertyValue('--min-x')) {
            bar.style.setProperty('--min-x', Math.max(12, window.innerWidth - 76) + 'px');
            bar.style.setProperty('--min-y', '24px');
        }
    } else {
        bar.classList.remove('minimized');
    }
}

function initPlayerDrag() {
    const bar = document.getElementById('player-bar');
    if (!bar) return;

    let startY = 0;
    let currentTranslateY = 0;
    let lastY = 0;
    let velocity = 0;
    let hasDragged = false;

    const onStart = (e) => {
        if (e.target && e.target.closest('button') && !isPlayerMinimized) return;
        const point = e.touches ? e.touches[0] : e;
        playerDragStartX = point.clientX;
        playerDragStartY = point.clientY;
        startY = point.clientY;
        lastY = startY;
        velocity = 0;
        currentTranslateY = 0;
        hasDragged = false;
        isPlayerDragging = true;
        bar.style.transition = 'none';

        if (isPlayerMinimized) {
            const rect = bar.getBoundingClientRect();
            playerInitialX = rect.left;
            playerInitialY = window.innerHeight - rect.bottom;
        }
    };

    const onMove = (e) => {
        if (!isPlayerDragging) return;
        const point = e.touches ? e.touches[0] : e;
        const dragDist = Math.hypot(point.clientX - playerDragStartX, point.clientY - playerDragStartY);
        if (dragDist > 12) hasDragged = true;

        if (isPlayerMinimized) {
            if (!hasDragged) return;
            const dx = point.clientX - playerDragStartX;
            const dy = playerDragStartY - point.clientY;
            const newX = Math.max(0, Math.min(window.innerWidth - 52, playerInitialX + dx));
            const newY = Math.max(0, Math.min(window.innerHeight - 52, playerInitialY + dy));
            bar.style.setProperty('--min-x', newX + 'px');
            bar.style.setProperty('--min-y', newY + 'px');
        } else {
            const deltaY = point.clientY - startY;
            velocity = point.clientY - lastY;
            lastY = point.clientY;
            if (deltaY > 0) {
                bar.style.transform = `translateY(${deltaY}px)`;
                currentTranslateY = deltaY;
            }
        }
    };

    const onEnd = () => {
        if (!isPlayerDragging) return;
        isPlayerDragging = false;
        bar.style.transition = 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)';

        if (isPlayerMinimized) {
            if (!hasDragged) toggleMinimizePlayer();
        } else {
            if (hasDragged && (currentTranslateY > 40 || velocity > 5)) {
                toggleMinimizePlayer();
            }
            bar.style.transform = '';
            currentTranslateY = 0;
        }
    };

    bar.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', (e) => {
        if (isPlayerDragging && !isPlayerMinimized) e.preventDefault();
        onMove(e);
    }, { passive: false });
    window.addEventListener('touchend', onEnd);

    bar.addEventListener('mousedown', onStart);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onEnd);
}

function toggleVoicePopup(e) {
    if (e) e.stopPropagation();
    const popup = document.getElementById('voice-popup');
    if (!popup) return;
    popup.classList.toggle('hidden');
    if (!popup.classList.contains('hidden')) loadVoices();
}

document.addEventListener('click', (e) => {
    const popup = document.getElementById('voice-popup');
    const btn = document.getElementById('voice-btn');
    if (popup && !popup.classList.contains('hidden') && !popup.contains(e.target) && (!btn || !btn.contains(e.target))) {
        popup.classList.add('hidden');
    }
});

async function setVoice(name) {
    const wasPlaying = isPlaying;
    const wasSelectionReading = isSelectionReading;
    const previousSelectedText = activeSelectedText;
    const resumeIdx = (currentMode === 'pdf') ? pdfActiveIndex : textActiveIndex;

    TTSEngine._activeSessionId = null;
    isPlaying = false;
    TTSEngine.cancel();

    if ('speechSynthesis' in window) {
        try { window.speechSynthesis.cancel(); } catch (e) {}
        await new Promise(r => setTimeout(r, 50));
        try { window.speechSynthesis.cancel(); } catch (e) {}
    }

    if (!availableVoices.length) await TTSEngine.loadVoices();
    const found = availableVoices.find(v => v.name === name);
    if (!found) {
        showToast('Voice not available', 2000);
        return;
    }
    currentVoice = found;

    if (ttsBackend === 'native' && window.NativeTTS && window.NativeTTS.setVoice) {
        try {
            await window.NativeTTS.setVoice({ voiceName: found.name });
        } catch (e) {
            console.warn('Native setVoice failed:', e);
        }
    }

    TTSEngine._renderVoiceList();
    const isIndian = /^en[-_]IN$|^hi[-_]IN$/i.test(found.locale);
    showToast(`✓ ${isIndian ? 'Indian English 🇮🇳' : 'Voice'} — ${found.locale}`, 1800);
    const popup = document.getElementById('voice-popup');
    if (popup) popup.classList.add('hidden');

    if (wasPlaying) {
        await new Promise(r => setTimeout(r, 250));
        if (wasSelectionReading && previousSelectedText) {
            activeSelectedText = previousSelectedText;
            speakSelection(previousSelectedText);
        } else {
            speakFrom(Math.max(0, resumeIdx));
        }
    }
}

function adjustSpeed(d) {
    const wasPlaying = isPlaying;
    speed = Math.round(Math.min(Math.max(speed + d, 0.25), 3.0) * 100) / 100;
    const speedEl = document.getElementById('speed-text');
    if (speedEl) speedEl.innerText = speed.toFixed(1) + 'x';

    if (wasPlaying) {
        synth.cancel();
        if (isSelectionReading) {
            speakSelection(activeSelectedText);
        } else {
            const idx = (currentMode === 'pdf') ? pdfActiveIndex : textActiveIndex;
            speakFrom(Math.max(0, idx));
        }
    }
}

function togglePlay() {
    if (isPlaying) {
        TTSEngine.cancel();
        isPlaying = false;
        updateUI();
        return;
    }
    if (currentMode === 'text' && isTextEditing) {
        const editor = document.getElementById('text-editor');
        const hasText = editor && editor.value.trim().length > 0;
        if (!hasText) {
            showToast('Please enter some text to read first.', 2500);
            return;
        }
        toggleTextEdit(false);
    }

    const startPlayback = () => {
        isPlaying = true;
        if (activeSelectedText && selectionWordIndices.length > 0) {
            isSelectionReading = true;
            speakSelection(activeSelectedText);
        } else {
            const idx = (currentMode === 'pdf')
                ? Math.max(0, pdfActiveIndex)
                : Math.max(0, textActiveIndex);
            speakFrom(idx);
        }
        updateUI();
    };

    if (!availableVoices.length) {
        TTSEngine.loadVoices().then(startPlayback);
    } else {
        startPlayback();
    }
}

function toggleLoop() {
    isLooping = !isLooping;
    updateUI();
}

function updateUI() {
    const playIcon = document.getElementById('play-icon');
    const loopBtn = document.getElementById('loop-btn');
    if (!playIcon || !loopBtn) return;

    playIcon.className = isPlaying ? 'fas fa-pause text-white' : 'fas fa-play ml-0.5 text-white';

    if (isLooping) {
        loopBtn.style.color = 'var(--primary-pink)';
        loopBtn.classList.add('scale-110');
    } else {
        loopBtn.style.color = '#9ca3af';
        loopBtn.classList.remove('scale-110');
    }
}
