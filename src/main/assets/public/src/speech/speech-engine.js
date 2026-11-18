// ============================================================
// PROFESSIONAL TTS ENGINE — Dual Backend (Native + Web Speech)
// ============================================================

const TTSEngine = {
    _listenersRegistered: false,
    _currentUtterance: null,
    _watchdogTimer: null,
    _fallbackTimer: null,
    _keepaliveTimer: null,
    _sessionId: 0,
    _activeSessionId: null,
    _lastBoundaryAt: 0,
    _startedAt: 0,

    async init() {
        if (window.NativeTTS && window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) {
            ttsBackend = 'native';
            this._registerNativeListeners();
        } else if ('speechSynthesis' in window) {
            ttsBackend = 'web';
            this._initWebVoices();
        } else {
            ttsBackend = null;
            console.warn('No TTS backend available.');
        }
        await this.loadVoices();
    },

    async loadVoices() {
        try {
            if (ttsBackend === 'native') {
                const res = await window.NativeTTS.getVoices();
                availableVoices = (res && res.voices) ? res.voices : [];
            } else if (ttsBackend === 'web') {
                availableVoices = await this._getWebVoicesAsync();
            }
            this._renderVoiceList();
            this._pickDefaultVoice();
        } catch (e) {
            console.warn('loadVoices failed:', e);
            if (ttsBackend === 'native' && 'speechSynthesis' in window) {
                ttsBackend = 'web';
                availableVoices = await this._getWebVoicesAsync();
                this._renderVoiceList();
                this._pickDefaultVoice();
            }
        }
    },

    _getWebVoicesAsync() {
        return new Promise((resolve) => {
            if (!('speechSynthesis' in window)) return resolve([]);
            let v = window.speechSynthesis.getVoices();
            if (v && v.length) {
                webVoicesCache = v;
                return resolve(v.map(this._normalizeWebVoice));
            }
            let resolved = false;
            const finish = (voices) => {
                if (resolved) return;
                resolved = true;
                webVoicesCache = voices || [];
                resolve((voices || []).map(this._normalizeWebVoice));
            };
            window.speechSynthesis.onvoiceschanged = () => {
                finish(window.speechSynthesis.getVoices());
            };
            let tries = 0;
            const poll = setInterval(() => {
                v = window.speechSynthesis.getVoices();
                if ((v && v.length) || tries++ > 20) {
                    clearInterval(poll);
                    finish(v || []);
                }
            }, 100);
        });
    },

    _normalizeWebVoice(v) {
        return { name: v.name, locale: v.lang || 'en-US' };
    },

    _initWebVoices() {
        if ('speechSynthesis' in window) {
            window.speechSynthesis.getVoices();
        }
    },

    _renderVoiceList() {
        const list = document.getElementById('voice-list');
        if (!list) return;
        if (!availableVoices.length) {
            list.innerHTML = `<div class="p-3 text-gray-400 text-xs">No voices loaded yet...</div>`;
            return;
        }
        const indianVoice = availableVoices.find(v => /^en[-_]IN$/i.test(v.locale))
            || availableVoices.find(v => /^hi[-_]IN$/i.test(v.locale));
        const usVoice = availableVoices.find(v => /^en[-_]US$/i.test(v.locale))
            || availableVoices.find(v => /^en[-_]GB$/i.test(v.locale));

        const displayVoices = [];
        if (indianVoice) {
            displayVoices.push({ voice: indianVoice, label: 'Indian English', flag: '🇮🇳', sublabel: indianVoice.locale });
        }
        if (usVoice && usVoice !== indianVoice) {
            displayVoices.push({ voice: usVoice, label: 'US English', flag: '🇺🇸', sublabel: usVoice.locale });
        }
        if (!displayVoices.length) {
            availableVoices.filter(v => /^en/i.test(v.locale)).slice(0, 4).forEach((v) => {
                displayVoices.push({
                    voice: v,
                    label: v.name.length > 22 ? v.name.substring(0, 22) + '…' : v.name,
                    flag: '🌐',
                    sublabel: v.locale
                });
            });
        }
        if (!displayVoices.length) {
            availableVoices.slice(0, 4).forEach((v) => {
                displayVoices.push({
                    voice: v,
                    label: v.name.length > 22 ? v.name.substring(0, 22) + '…' : v.name,
                    flag: '🌐',
                    sublabel: v.locale
                });
            });
        }
        if (!displayVoices.length) {
            list.innerHTML = `<div class="p-3 text-gray-400 text-xs">No voices found on device.</div>`;
            return;
        }
        list.innerHTML = displayVoices.map(item => {
            const isActive = currentVoice && currentVoice.name === item.voice.name;
            const safeName = item.voice.name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
            return `<button class="w-full text-left p-3 text-xs hover:bg-pink-50 rounded-lg flex items-center gap-3 ${isActive ? 'bg-pink-50 border border-pink-200' : ''}"
                onclick="setVoice('${safeName}')">
                <span class="text-lg">${item.flag}</span>
                <div class="flex-grow min-w-0">
                    <div class="font-bold text-gray-800 truncate">${escapeHtml(item.label)}</div>
                    <div class="text-[9px] text-gray-400 truncate">${escapeHtml(item.sublabel)}</div>
                </div>
                ${isActive ? '<i class="fas fa-check text-pink-500 text-xs"></i>' : ''}
            </button>`;
        }).join('');
    },

    _pickDefaultVoice() {
        if (currentVoice || !availableVoices.length) return;
        currentVoice = availableVoices.find(v => /en[-_]IN|Indian/i.test(v.name + ' ' + v.locale))
            || availableVoices.find(v => /en[-_]US|Default/i.test(v.name + ' ' + v.locale))
            || availableVoices[0];
    },

    _registerNativeListeners() {
        if (this._listenersRegistered || !window.NativeTTS) return;
        this._listenersRegistered = true;
        window.NativeTTS.addListener('onBoundary', (data) => {
            if (!this._activeSessionId) return;
            if (data && data.sessionId && String(data.sessionId) !== String(this._activeSessionId)) return;
            this._lastBoundaryAt = performance.now();
            this._stopFallbackTimer();
            this._handleBoundary(data.charIndex);
        });
        window.NativeTTS.addListener('onTTSStateChange', (data) => {
            if (!this._activeSessionId) return;
            if (data && data.sessionId && String(data.sessionId) !== String(this._activeSessionId)) return;
            if (data.event === 'start') {
                this._startedAt = performance.now();
                const sid = this._activeSessionId;
                setTimeout(() => {
                    if (this._activeSessionId === sid && isPlaying && this._lastBoundaryAt < this._startedAt) {
                        this._startFallbackTimer();
                    }
                }, 600);
            } else if (data.event === 'end') {
                this._stopFallbackTimer();
                this._onUtteranceEnd();
            } else if (data.event === 'stop') {
                this._stopFallbackTimer();
            } else if (data.event === 'error') {
                this._stopFallbackTimer();
                this._onUtteranceError();
            }
        });
    },

    speak(text, rate, voiceName) {
        this.cancel();
        if (!text || !text.trim()) return;
        this._sessionId++;
        this._activeSessionId = String(this._sessionId);
        window.lastUpdateIdx = -1;
        this._lastBoundaryAt = 0;
        this._startedAt = performance.now();

        if (ttsBackend === 'native') {
            this._speakNative(text, rate, voiceName);
        } else if (ttsBackend === 'web') {
            this._speakWeb(text, rate, voiceName);
        } else {
            showToast('No speech engine available on this device', 3000);
            isPlaying = false;
            updateUI();
        }
    },

    _speakNative(text, rate, voiceName) {
        const sessionId = this._activeSessionId;
        window.NativeTTS.speak({ text, rate, voiceName, voice: voiceName, sessionId }).catch(err => {
            console.error('Native TTS error:', err);
            const msg = (err && err.message) ? err.message : String(err);
            if (/STUCK|ERROR|initialized/i.test(msg)) {
                window.NativeTTS.reinitialize?.().then(() => {
                    setTimeout(() => {
                        if (String(this._activeSessionId) !== String(sessionId) || !isPlaying) return;
                        window.NativeTTS.speak({ text, rate, voiceName, voice: voiceName, sessionId }).catch(() => {
                            this._fallbackToWeb(text, rate, voiceName);
                        });
                    }, 800);
                }).catch(() => this._fallbackToWeb(text, rate, voiceName));
            } else {
                this._fallbackToWeb(text, rate, voiceName);
            }
        });
    },

    _fallbackToWeb(text, rate, voiceName) {
        if ('speechSynthesis' in window) {
            ttsBackend = 'web';
            this._speakWeb(text, rate, voiceName);
        } else {
            isPlaying = false;
            updateUI();
            showToast('Speech engine unavailable', 3000);
        }
    },

    _speakWeb(text, rate, voiceName) {
        try { window.speechSynthesis.cancel(); } catch (e) {}
        const u = new SpeechSynthesisUtterance(text);
        u.rate = Math.max(0.25, Math.min(3.0, rate || 1));
        u.pitch = 1;
        u.volume = 1;
        if (voiceName && webVoicesCache.length) {
            const match = webVoicesCache.find(v => v.name === voiceName);
            if (match) u.voice = match;
        }
        const sid = this._activeSessionId;
        u.onboundary = (ev) => {
            if (this._activeSessionId !== sid) return;
            if (ev.name === 'word' || ev.charIndex !== undefined) {
                this._lastBoundaryAt = performance.now();
                this._stopFallbackTimer();
                this._handleBoundary(ev.charIndex);
            }
        };
        u.onend = () => {
            if (this._activeSessionId !== sid) return;
            this._onUtteranceEnd();
        };
        u.onerror = (e) => {
            if (this._activeSessionId !== sid) return;
            if (e.error === 'interrupted' || e.error === 'canceled') return;
            console.warn('Web Speech error:', e.error);
            this._onUtteranceError();
        };
        u.onstart = () => {
            if (this._activeSessionId !== sid) return;
            this._startedAt = performance.now();
            setTimeout(() => {
                if (this._activeSessionId === sid && isPlaying && this._lastBoundaryAt < this._startedAt) {
                    this._startFallbackTimer();
                }
            }, 600);
        };
        this._currentUtterance = u;
        window.speechSynthesis.speak(u);
        this._startChromeKeepalive();
    },

    _startChromeKeepalive() {
        this._stopChromeKeepalive();
        if (ttsBackend !== 'web') return;
        this._keepaliveTimer = setInterval(() => {
            if (!isPlaying) {
                this._stopChromeKeepalive();
                return;
            }
            if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
                window.speechSynthesis.pause();
                window.speechSynthesis.resume();
            }
        }, 10000);
    },

    _stopChromeKeepalive() {
        if (this._keepaliveTimer) {
            clearInterval(this._keepaliveTimer);
            this._keepaliveTimer = null;
        }
    },

    _handleBoundary(charIndex) {
        if (charIndex == null || !utteranceWordMap.length) return;
        let lo = 0, hi = utteranceWordMap.length - 1, match = null;
        while (lo <= hi) {
            const mid = (lo + hi) >> 1;
            const entry = utteranceWordMap[mid];
            if (charIndex < entry.start) hi = mid - 1;
            else if (charIndex >= entry.end) lo = mid + 1;
            else { match = entry; break; }
        }
        if (!match) {
            const idx = Math.max(0, Math.min(lo, utteranceWordMap.length - 1));
            for (let i = idx; i >= 0; i--) {
                if (utteranceWordMap[i].start <= charIndex) {
                    match = utteranceWordMap[i];
                    break;
                }
            }
            if (!match) match = utteranceWordMap[0];
        }
        if (match.index <= window.lastUpdateIdx) return;
        window.lastUpdateIdx = match.index;
        this._renderHighlight(match);
    },

    _renderHighlight(match) {
        requestAnimationFrame(() => {
            if (match.type === 'reader' || match.type === 'selection') {
                const mode = match.mode || currentMode;
                if (mode === 'pdf') pdfActiveIndex = match.index;
                else textActiveIndex = match.index;
                updateHighlight(mode);
                if (match.index % 3 === 0) autoScroll(mode);
            } else if (match.type === 'modal') {
                const content = document.getElementById('modal-content');
                if (!content) return;
                const spans = content.querySelectorAll('.ai-word-span');
                spans.forEach(s => s.classList.remove('active'));
                const el = spans[match.index];
                if (el) {
                    el.classList.add('active');
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }
        });
    },

    _startFallbackTimer() {
        this._stopFallbackTimer();
        if (!utteranceWordMap.length) return;
        const startIdx = (currentMode === 'pdf') ? pdfActiveIndex : textActiveIndex;
        let mapPos = utteranceWordMap.findIndex(m => m.index === Math.max(0, startIdx));
        if (mapPos < 0) mapPos = 0;

        const advance = () => {
            if (!isPlaying || mapPos >= utteranceWordMap.length) {
                this._stopFallbackTimer();
                if (isPlaying && mapPos >= utteranceWordMap.length) {
                    this._onUtteranceEnd();
                }
                return;
            }
            const m = utteranceWordMap[mapPos];
            if (m.index > window.lastUpdateIdx) {
                window.lastUpdateIdx = m.index;
                this._renderHighlight(m);
            }
            const dur = this._estimateWordDuration(m);
            mapPos++;
            this._fallbackTimer = setTimeout(advance, dur);
        };
        advance();
    },

    _estimateWordDuration(mapEntry) {
        const word = mapEntry.word || '';
        let base = Math.max(180, Math.min(900, word.length * 70));
        if (/[.!?]$/.test(word)) base += 350;
        else if (/[,;:]$/.test(word)) base += 180;
        return base / Math.max(0.25, speed);
    },

    _stopFallbackTimer() {
        if (this._fallbackTimer) {
            clearTimeout(this._fallbackTimer);
            this._fallbackTimer = null;
        }
    },

    _onUtteranceEnd() {
        this._stopFallbackTimer();
        this._stopChromeKeepalive();
        if (isLooping && isPlaying) {
            lastHighlightedEl = null;
            setTimeout(() => {
                if (!isPlaying) return;
                if (isSelectionReading && activeSelectedText) {
                    speakSelection(activeSelectedText);
                } else {
                    speakFrom(0);
                }
            }, 200);
        } else {
            isPlaying = false;
            isSelectionReading = false;
            lastHighlightedEl = null;
            updateUI();
        }
    },

    _onUtteranceError() {
        this._stopFallbackTimer();
        this._stopChromeKeepalive();
        isPlaying = false;
        isSelectionReading = false;
        updateUI();
    },

    cancel() {
        this._sessionId++;
        this._activeSessionId = null;
        this._stopFallbackTimer();
        this._stopChromeKeepalive();
        try {
            if (ttsBackend === 'native' && window.NativeTTS) {
                window.NativeTTS.stop();
            }
            if ('speechSynthesis' in window) {
                window.speechSynthesis.cancel();
            }
        } catch (e) {}
        this._currentUtterance = null;
    }
};

const synth = {
    getVoices: async () => { await TTSEngine.loadVoices(); return availableVoices; },
    speak: (text, rate, voiceName) => TTSEngine.speak(text, rate, voiceName),
    cancel: () => TTSEngine.cancel()
};

async function loadVoices() {
    return TTSEngine.loadVoices();
}

function speakFrom(startIndex = 0) {
    const mode = currentMode === 'pdf' ? 'pdf' : 'text';
    const words = mode === 'pdf' ? pdfWords : textWords;
    if (!words || !words.length) {
        isPlaying = false;
        updateUI();
        showToast('No readable text found', 2000);
        return;
    }

    const start = Math.max(0, Math.min(startIndex, words.length - 1));
    isSelectionReading = false;
    isPlaying = true;
    window.lastUpdateIdx = -1;

    utteranceWordMap = [];
    const parts = [];
    let pos = 0;

    for (let i = start; i < words.length; i++) {
        const w = words[i];
        if (!w || !w.trim()) continue;
        if (parts.length > 0) {
            parts.push(' ');
            pos += 1;
        }
        utteranceWordMap.push({
            start: pos,
            end: pos + w.length,
            index: i,
            word: w,
            type: 'reader',
            mode
        });
        parts.push(w);
        pos += w.length;
    }

    const textToRead = parts.join('');
    if (!textToRead.trim()) {
        isPlaying = false;
        updateUI();
        showToast('No readable text found', 2000);
        return;
    }

    if (mode === 'pdf') pdfActiveIndex = start;
    else textActiveIndex = start;
    updateHighlight(mode);
    updateUI();

    TTSEngine.speak(textToRead, speed, currentVoice ? currentVoice.name : null);
}

function jumpToWord(index) {
    if (currentMode === 'text' && isTextEditing) return;
    const mode = currentMode === 'pdf' ? 'pdf' : 'text';
    if (mode === 'pdf') pdfActiveIndex = index;
    else textActiveIndex = index;
    isSelectionReading = false;
    activeSelectedText = '';
    selectionWordIndices = [];
    updateHighlight(mode);
    speakFrom(index);
}
