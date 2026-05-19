
        const DEFAULT_OLLAMA_URL = 'http://192.168.0.101:11434';
        const DEFAULT_OLLAMA_MODEL = 'gemma3:e2b';
        let AI_CONFIG = JSON.parse(localStorage.getItem('AI_CONFIG')) || {
            activeProvider: 'ollama',
            ollamaModel: DEFAULT_OLLAMA_MODEL,
            keys: { gemini: '', openai: '', claude: '', deepseek: '', meta: '', ollama: DEFAULT_OLLAMA_URL }
        };
        if (!AI_CONFIG.keys.ollama
            || AI_CONFIG.keys.ollama === 'http://localhost:11434'
            || AI_CONFIG.keys.ollama.trim() === '') {
            AI_CONFIG.keys.ollama = DEFAULT_OLLAMA_URL;
        }
        if (!AI_CONFIG.ollamaModel || AI_CONFIG.ollamaModel.trim() === '') {
            AI_CONFIG.ollamaModel = DEFAULT_OLLAMA_MODEL;
        }
        const hasAnyOtherKey = ['gemini', 'openai', 'claude', 'deepseek', 'meta']
            .some(p => AI_CONFIG.keys[p] && AI_CONFIG.keys[p].length > 10);
        if (!hasAnyOtherKey) {
            AI_CONFIG.activeProvider = 'ollama';
        }
        localStorage.setItem('AI_CONFIG', JSON.stringify(AI_CONFIG));

        console.log("OmniReader Script Initializing...");
        console.log("Initial window.speechSynthesis: " + (typeof window.speechSynthesis !== 'undefined'));
        console.log("Initial window.SpeechSynthesisUtterance: " + (typeof window.SpeechSynthesisUtterance !== 'undefined'));

        const checkPdfJs = () => {
            if (typeof pdfjsLib === 'undefined') {
                console.log("PDF.js not loaded yet, retrying...");
                if (window.retryCount < 5) {
                    window.retryCount++;
                    setTimeout(checkPdfJs, 500);
                } else {
                    alert("âš  Error: PDF.js library failed to load. Please check your assets folder.");
                }
            } else {
                pdfjsLib.GlobalWorkerOptions.workerSrc = 'assets/pdfjs/pdf.worker.js';
                console.log("PDF.js Loaded Successfully");
            }
        };
        window.retryCount = 0;
        checkPdfJs();

        // Robust TTS Initialization (Switched to Native bridge)
        // ============================================================
// PROFESSIONAL TTS ENGINE — Dual Backend (Native + Web Speech)
// ============================================================
let availableVoices = [];
let webVoicesCache = [];
let ttsBackend = null; // 'native' | 'web'
const TTSEngine = {
    _listenersRegistered: false,
    _currentUtterance: null,
    _watchdogTimer: null,
    _fallbackTimer: null,
    _sessionId: 0,
    _activeSessionId: null,
    _lastBoundaryAt: 0,
    _startedAt: 0,
    async init() {
        if (window.NativeTTS) {
            ttsBackend = 'native';
            this._registerNativeListeners();
        } else if ('speechSynthesis' in window) {
            ttsBackend = 'web';
            this._initWebVoices();
        } else {
            ttsBackend = null;
            console.error('No TTS backend available.');
        }
        await this.loadVoices();
    },
    async loadVoices() {
        try {
            if (ttsBackend === 'native') {
                const res = await window.NativeTTS.getVoices();
                availableVoices = res.voices || [];
            } else if (ttsBackend === 'web') {
                availableVoices = await this._getWebVoicesAsync();
            }
            this._renderVoiceList();
            this._pickDefaultVoice();
        } catch (e) {
            console.error('loadVoices failed:', e);
        }
    },
    _getWebVoicesAsync() {
        return new Promise((resolve) => {
            let v = window.speechSynthesis.getVoices();
            if (v && v.length) {
                webVoicesCache = v;
                return resolve(v.map(this._normalizeWebVoice));
            }
            const handler = () => {
                v = window.speechSynthesis.getVoices();
                webVoicesCache = v;
                window.speechSynthesis.onvoiceschanged = null;
                resolve(v.map(this._normalizeWebVoice));
            };
            window.speechSynthesis.onvoiceschanged = handler;
            // Fallback: poll for 3 seconds
            let tries = 0;
            const poll = setInterval(() => {
                v = window.speechSynthesis.getVoices();
                if ((v && v.length) || tries++ > 30) {
                    clearInterval(poll);
                    webVoicesCache = v || [];
                    resolve((v || []).map(this._normalizeWebVoice));
                }
            }, 100);
        });
    },
    _normalizeWebVoice(v) {
        return { name: v.name, locale: v.lang || 'en-US' };
    },
    _initWebVoices() {
        if ('speechSynthesis' in window) {
            window.speechSynthesis.getVoices(); // trigger load
        }
    },
    _renderVoiceList() {
        const list = document.getElementById('voice-list');
        if (!list) return;
        if (!availableVoices.length) {
            list.innerHTML = `<div class="p-3 text-gray-400 text-xs">Loading voices...</div>`;
            return;
        }
        // STRICT matching — only real en-IN locale voices count as Indian
        const indianVoice = availableVoices.find(v => /^en[-_]IN$/i.test(v.locale))
            || availableVoices.find(v => /^hi[-_]IN$/i.test(v.locale));
        // STRICT US English
        const usVoice = availableVoices.find(v => /^en[-_]US$/i.test(v.locale))
            || availableVoices.find(v => /^en[-_]GB$/i.test(v.locale));
        // Build voice list dynamically
        const displayVoices = [];
        if (indianVoice) {
            displayVoices.push({ voice: indianVoice, label: 'Indian English', flag: '🇮🇳', sublabel: indianVoice.locale });
        }
        if (usVoice && usVoice !== indianVoice) {
            displayVoices.push({ voice: usVoice, label: 'US English', flag: '🇺🇸', sublabel: usVoice.locale });
        }
        // If no Indian voice found, show a warning + offer first 2 English voices
        if (!indianVoice) {
            const allEnglish = availableVoices.filter(v => /^en/i.test(v.locale)).slice(0, 2);
            displayVoices.length = 0;
            allEnglish.forEach((v, i) => {
                displayVoices.push({
                    voice: v,
                    label: v.name.length > 22 ? v.name.substring(0, 22) + '…' : v.name,
                    flag: '🌐',
                    sublabel: v.locale
                });
            });
        }
        if (!displayVoices.length) {
            list.innerHTML = `<div class="p-3 text-gray-400 text-xs">No English voices found on device. Install one in Android Settings → Language → Text-to-Speech.</div>`;
            return;
        }
        list.innerHTML = displayVoices.map(item => {
            const isActive = currentVoice && currentVoice.name === item.voice.name;
            return `<button class="w-full text-left p-3 text-xs hover:bg-pink-50 rounded-lg flex items-center gap-3 ${isActive ? 'bg-pink-50 border border-pink-200' : ''}"
                onclick="setVoice('${item.voice.name.replace(/'/g, "\\'")}')">
                <span class="text-lg">${item.flag}</span>
                <div class="flex-grow min-w-0">
                    <div class="font-bold text-gray-800 truncate">${item.label}</div>
                    <div class="text-[9px] text-gray-400 truncate">${item.sublabel}</div>
                </div>
                ${isActive ? '<i class="fas fa-check text-pink-500 text-xs"></i>' : ''}
            </button>`;
        }).join('');
        // Add a helpful note if no Indian voice
        if (!indianVoice) {
            list.innerHTML += `<div class="mt-2 p-2 text-[9px] text-amber-600 bg-amber-50 rounded-lg leading-tight">
                ⚠️ No Indian English voice installed. Go to <b>Android Settings → System → Languages → Text-to-Speech → Install voice data → English (India)</b>.
            </div>`;
        }
    },
    _pickDefaultVoice() {
        if (currentVoice || !availableVoices.length) return;
        // Force Indian English as default if available
        currentVoice = availableVoices.find(v => /en[-_]IN|Indian/i.test(v.name + ' ' + v.locale))
            || availableVoices.find(v => /en[-_]US|Default/i.test(v.name + ' ' + v.locale))
            || availableVoices[0];
    },
    _registerNativeListeners() {
        if (this._listenersRegistered || !window.NativeTTS) return;
        this._listenersRegistered = true;
        window.NativeTTS.addListener('onBoundary', (data) => {
            // Reject if no active session OR session mismatch
            if (!this._activeSessionId) return;
            if (data && data.sessionId && String(data.sessionId) !== String(this._activeSessionId)) return;
            this._lastBoundaryAt = performance.now();
            this._stopFallbackTimer();
            this._handleBoundary(data.charIndex);
        });
        window.NativeTTS.addListener('onTTSStateChange', (data) => {
            // Same guard: only honor events from the active session
            if (!this._activeSessionId) return;
            if (data && data.sessionId && String(data.sessionId) !== String(this._activeSessionId)) return;
            if (data.event === 'start') {
                this._startedAt = performance.now();
                const sid = this._activeSessionId;
                setTimeout(() => {
                    // Only engage fallback if still on the SAME session
                    if (this._activeSessionId === sid && isPlaying && this._lastBoundaryAt < this._startedAt) {
                        console.log('TTS: no boundary events detected — using time-based fallback');
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
        this.cancel(); // ensure clean slate
        if (!text || !text.trim()) return;
        // Reset per-utterance state
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
        window.NativeTTS.speak({ text, rate, voiceName, sessionId }).catch(err => {
            console.error('Native TTS error:', err);
            const msg = (err && err.message) ? err.message : String(err);
            // Try one repair, then fall back to web speech if available
            if (/STUCK|ERROR|initialized/i.test(msg)) {
                window.NativeTTS.reinitialize?.().then(() => {
                    setTimeout(() => {
                        if (String(this._activeSessionId) !== String(sessionId) || !isPlaying) return;
                        window.NativeTTS.speak({ text, rate, voiceName, sessionId }).catch(() => {
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
            console.log('TTS: falling back to Web Speech API');
            ttsBackend = 'web';
            this._speakWeb(text, rate, voiceName);
        } else {
            isPlaying = false;
            updateUI();
            showToast('Speech engine unavailable', 3000);
        }
    },
    _speakWeb(text, rate, voiceName) {
        try {
            window.speechSynthesis.cancel();
        } catch (e) {}
        const u = new SpeechSynthesisUtterance(text);
        u.rate = Math.max(0.1, Math.min(10, rate || 1));
        u.pitch = 1;
        u.volume = 1;
        if (voiceName && webVoicesCache.length) {
            const match = webVoicesCache.find(v => v.name === voiceName);
            if (match) u.voice = match;
        }
        u.onboundary = (ev) => {
            if (ev.name === 'word' || ev.charIndex !== undefined) {
                this._lastBoundaryAt = performance.now();
                this._stopFallbackTimer();
                this._handleBoundary(ev.charIndex);
            }
        };
        u.onend = () => this._onUtteranceEnd();
        u.onerror = (e) => {
            console.warn('Web Speech error:', e.error);
            this._onUtteranceError();
        };
        u.onstart = () => {
            this._startedAt = performance.now();
            // Chrome on Android often doesn't fire boundary events at all
            setTimeout(() => {
                if (isPlaying && this._lastBoundaryAt < this._startedAt) {
                    this._startFallbackTimer();
                }
            }, 600);
        };
        this._currentUtterance = u;
        window.speechSynthesis.speak(u);
        // Chrome bug: speech pauses after ~15s. Workaround: ping every 10s.
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
        // Binary search for the word range containing charIndex.
        // Inclusive lower, exclusive upper.
        let lo = 0, hi = utteranceWordMap.length - 1, match = null;
        while (lo <= hi) {
            const mid = (lo + hi) >> 1;
            const entry = utteranceWordMap[mid];
            if (charIndex < entry.start) hi = mid - 1;
            else if (charIndex >= entry.end) lo = mid + 1;
            else { match = entry; break; }
        }
        // Fallback: engine reported past a word boundary — pick the last word that started <= charIndex
        if (!match) {
            const idx = Math.max(0, Math.min(lo, utteranceWordMap.length - 1));
            // Walk back to find the actual closest preceding word
            for (let i = idx; i >= 0; i--) {
                if (utteranceWordMap[i].start <= charIndex) {
                    match = utteranceWordMap[i];
                    break;
                }
            }
            if (!match) match = utteranceWordMap[0];
        }
        // Monotonic guard — never go backwards
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
                // Scroll less aggressively — every 3 words is enough
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
        const startIdx = (currentMode === 'pdf') ? pdfActiveIndex : textActiveIndex;
        let i = Math.max(0, startIdx);
        // Walk through utteranceWordMap directly — guaranteed alignment with what's spoken
        if (!utteranceWordMap.length) return;
        // Find starting position in the map
        let mapPos = utteranceWordMap.findIndex(m => m.index === i);
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
            // Per-word duration based on word length + punctuation
            const dur = this._estimateWordDuration(m);
            mapPos++;
            this._fallbackTimer = setTimeout(advance, dur);
        };
        advance();
    },
    _estimateWordDuration(mapEntry) {
        const word = mapEntry.word || '';
        const len = word.length;
        // Base: ~70ms per character at rate 1.0, capped to a sane min/max
        let base = Math.max(180, Math.min(900, len * 70));
        // Punctuation adds pause
        if (/[.!?]$/.test(word)) base += 350;
        else if (/[,;:]$/.test(word)) base += 180;
        // Apply speech rate (inverse — faster rate = shorter duration)
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
// Backwards-compatible shim — keeps all existing call sites working
const synth = {
    getVoices: async () => { await TTSEngine.loadVoices(); return availableVoices; },
    speak: (text, rate, voiceName) => TTSEngine.speak(text, rate, voiceName),
    cancel: () => TTSEngine.cancel()
};
async function loadVoices() { return TTSEngine.loadVoices(); }
// Initialize after DOM is ready (don't block parsing)
setTimeout(() => TTSEngine.init(), 500);

        // Core TTS & Reader State Variables
        let pdfDoc = null, isPlaying = false, speed = 1.0, currentVoice = null, isLooping = false, currentMode = 'pdf';
        let pdfWords = [], textWords = [], pdfActiveIndex = -1, textActiveIndex = -1;
        let isSelectionReading = false, selectionWordIndices = [];
        let activeSelectedText = "";
        let utteranceWordMap = []; // Precision mapping: { start, end, index, type }
        let readerTokenMeta = { pdf: [], text: [], modal: [] };
        let lastHighlightedEl = null;
        let isTextEditing = true;
        let lastPdfFile = null;
        let isTwoPage = false;
        let isSplitView = false;

        // Properly declared globals (were implicit window.* before)
        let isDragging = false;
        let lastPosX = 0;
        let lastPosY = 0;
        let lastEraserX = 0;
        let lastEraserY = 0;

        // ==========================================
        // PLAYER BAR DRAG & MINIMIZE LOGIC
        // ==========================================
        let isPlayerMinimized = false;
        let isPlayerDragging = false;
        let playerDragStartX = 0, playerDragStartY = 0;
        let playerInitialX = 0, playerInitialY = 0;
        let lastPlayerTap = 0;

        function toggleMinimizePlayer(e) {
            if (e && e.target && e.target.closest('button')) return;

            const bar = document.getElementById('player-bar');
            isPlayerMinimized = !isPlayerMinimized;

            if (isPlayerMinimized) {
                bar.classList.add('minimized');
                // Store position if not set
                if (!bar.style.getPropertyValue('--min-x')) {
                    bar.style.setProperty('--min-x', (window.innerWidth - 96) + 'px');
                    bar.style.setProperty('--min-y', '24px');
                }
            } else {
                bar.classList.remove('minimized');
            }
        }

        function initPlayerDrag() {
            const bar = document.getElementById('player-bar');
            let startY = 0;
            let currentTranslateY = 0;
            let lastY = 0;
            let velocity = 0;
            let hasDragged = false;

            const onStart = (e) => {
                const point = e.touches ? e.touches[0] : e;
                playerDragStartX = point.clientX;
                playerDragStartY = point.clientY;
                startY = point.clientY;
                lastY = startY;
                // CRITICAL: reset stale physics from any previous gesture
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

                const dragDist = Math.hypot(
                    point.clientX - playerDragStartX,
                    point.clientY - playerDragStartY
                );
                if (dragDist > 12) hasDragged = true;

                if (isPlayerMinimized) {
                    if (!hasDragged) return; // Don't pan on accidental micro-moves
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

            const onEnd = (e) => {
                if (!isPlayerDragging) return;
                isPlayerDragging = false;
                bar.style.transition = 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)';

                if (isPlayerMinimized) {
                    // ONLY restore if it was a clean tap (no drag movement)
                    if (!hasDragged) {
                        toggleMinimizePlayer();
                    }
                } else {
                    // ONLY minimize if it was an intentional downward drag, never on a tap
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

        // ==========================================
        // AI TOOLS DROPDOWN & API KEY MANAGEMENT
        // ==========================================
        function toggleAITools(e) {
            e.stopPropagation();
            const dropdown = document.getElementById('ai-tools-dropdown');
            if (!dropdown) return;
            const wasHidden = dropdown.classList.contains('hidden');
            dropdown.classList.toggle('hidden');
            updateApiKeyUI();
            if (wasHidden && AI_CONFIG.activeProvider === 'ollama') {
                silentOllamaPing();
            }
        }

        async function silentOllamaPing() {
            const url = (AI_CONFIG.keys.ollama || DEFAULT_OLLAMA_URL).replace(/\/+$/, '');
            const status = document.getElementById('api-status');
            if (!status) return;
            try {
                const controller = new AbortController();
                const t = setTimeout(() => controller.abort(), 3000);
                const res = await fetch(`${url}/api/tags`, { signal: controller.signal });
                clearTimeout(t);
                if (res.ok) {
                    status.textContent = 'Connected';
                    status.className = 'text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-bold';
                    status.classList.remove('hidden');
                } else throw new Error();
            } catch {
                status.textContent = 'Offline';
                status.className = 'text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-bold';
                status.classList.remove('hidden');
            }
        }

        function updateApiKeyUI() {
            const provider = AI_CONFIG.activeProvider;
            const key = AI_CONFIG.keys[provider];
            const label = document.getElementById('provider-label');
            const status = document.getElementById('api-status');
            const input = document.getElementById('api-key-input');
            const select = document.getElementById('provider-select');
            const modelRow = document.getElementById('ollama-model-row');
            const modelInput = document.getElementById('ollama-model-input');
            const testBtn = document.getElementById('ollama-test-btn');
            const helpText = document.getElementById('ollama-help-text');
            select.value = provider;
            if (provider === 'ollama') {
                label.innerText = 'Ollama URL';
                input.type = 'text';
                input.placeholder = DEFAULT_OLLAMA_URL;
                input.value = key || DEFAULT_OLLAMA_URL;
                if (modelRow) modelRow.classList.remove('hidden');
                if (modelInput) modelInput.value = AI_CONFIG.ollamaModel || DEFAULT_OLLAMA_MODEL;
                if (testBtn) testBtn.classList.remove('hidden');
                if (helpText) helpText.classList.remove('hidden');
            } else {
                label.innerText = provider.charAt(0).toUpperCase() + provider.slice(1) + ' Key';
                input.type = 'password';
                input.placeholder = 'Enter API Key...';
                input.value = key || '';
                if (modelRow) modelRow.classList.add('hidden');
                if (testBtn) testBtn.classList.add('hidden');
                if (helpText) helpText.classList.add('hidden');
            }
            if (key && (key.length > 10 || provider === 'ollama')) {
                status.classList.remove('hidden');
            } else {
                status.classList.add('hidden');
            }
        }

        function switchProvider(val) {
            AI_CONFIG.activeProvider = val;
            localStorage.setItem('AI_CONFIG', JSON.stringify(AI_CONFIG));
            updateApiKeyUI();
        }

        function saveCurrentApiKey() {
            const key = document.getElementById('api-key-input').value.trim();
            AI_CONFIG.keys[AI_CONFIG.activeProvider] = key;
            if (AI_CONFIG.activeProvider === 'ollama') {
                const modelInput = document.getElementById('ollama-model-input');
                if (modelInput) {
                    AI_CONFIG.ollamaModel = modelInput.value.trim() || DEFAULT_OLLAMA_MODEL;
                }
            }
            localStorage.setItem('AI_CONFIG', JSON.stringify(AI_CONFIG));
            updateApiKeyUI();
            if (typeof showToast !== 'undefined') showToast(`✓ ${AI_CONFIG.activeProvider.toUpperCase()} config saved!`);
            else alert(`✓ ${AI_CONFIG.activeProvider.toUpperCase()} config saved!`);
        }

        async function testOllamaConnection() {
            const urlInput = document.getElementById('api-key-input');
            const modelInput = document.getElementById('ollama-model-input');
            const url = (urlInput.value.trim() || DEFAULT_OLLAMA_URL).replace(/\/+$/, '');
            const model = (modelInput && modelInput.value.trim()) || DEFAULT_OLLAMA_MODEL;
            if (typeof showToast !== 'undefined') showToast('Testing connection...', 1500);
            try {
                const controller = new AbortController();
                const t = setTimeout(() => controller.abort(), 8000);
                const res = await fetch(`${url}/api/tags`, { signal: controller.signal });
                clearTimeout(t);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data = await res.json();
                const models = (data.models || []).map(m => m.name);
                if (!models.length) {
                    if (typeof showToast !== 'undefined') showToast(`⚠ Connected but no models installed. Run: ollama pull ${model}`, 5000);
                    else alert(`⚠ Connected but no models installed. Run: ollama pull ${model}`);
                    return;
                }
                const hasModel = models.some(m => m.startsWith(model));
                let msg = hasModel ? `✓ Connected. Available: ${models.slice(0, 3).join(', ')}` : `✓ Connected. Model "${model}" not found. Available: ${models.slice(0, 3).join(', ')}`;
                if (typeof showToast !== 'undefined') showToast(msg, 4000);
                else alert(msg);
            } catch (err) {
                let msg = err.name === 'AbortError' ? '✗ Timeout — Ollama not responding' : `✗ ${err.message || 'Connection failed'}`;
                if (typeof showToast !== 'undefined') showToast(msg, 4000);
                else alert(msg);
            }
        }

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            const dropdown = document.getElementById('ai-tools-dropdown');
            const button = e.target.closest('button[onclick*="toggleAITools"]');
            if (!dropdown.contains(e.target) && !button) {
                dropdown.classList.add('hidden');
            }
        });

        // Initialize API UI on load
        window.addEventListener('DOMContentLoaded', () => {
            updateApiKeyUI();
            initPlayerDrag(); // Initialize Mini Player Draggable

            // Load saved text if any
            const savedText = localStorage.getItem('OMNI_SAVED_TEXT');
            if (savedText) {
                document.getElementById('text-editor').value = savedText;
                reRenderTextWithSpans();
            }

            const handleContainerClick = (e) => {
                if (currentMode === 'text' && isTextEditing) return;
                const isWord = e.target.closest('.word-span') || e.target.closest('.text-word-span');
                if (!isWord) deselectAll();
            };

            document.getElementById('pdf-viewport-container').addEventListener('mousedown', handleContainerClick);
            document.getElementById('text-reader-display').addEventListener('mousedown', handleContainerClick);

            // Mobile Selection Support
            document.addEventListener('touchend', (e) => {
                // Never interfere with edit mode or text typing
                if (currentMode === 'edit') return;
                if (currentMode === 'text' && isTextEditing) return;
                // Small delay to let the browser update the selection
                setTimeout(handleSelection, 150);
            });

            // Auto-save typing
            document.getElementById('text-editor').addEventListener('input', (e) => {
                localStorage.setItem('OMNI_SAVED_TEXT', e.target.value);
            });

            // Handle Resize for PDF scaling
            window.addEventListener('resize', () => {
                if (currentMode === 'pdf' && pdfDoc) {
                    const firstPage = content.querySelector('.pdf-page-wrapper');
                    if (firstPage) {
                        const viewWidth = view.clientWidth;
                        const pageWidth = firstPage.clientWidth;
                        scale = (viewWidth - 40) / pageWidth;
                        currentX = (viewWidth - (pageWidth * scale)) / 2;
                        currentY = 20;
                        updateTransform(true);
                    }
                }
            });

            // ==========================================
            // ANDROID BACK BUTTON HANDLER (Capacitor)
            // ==========================================
            const CapApp = (window.CapacitorApp) ||
                (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App);
            if (CapApp) {
                try {
                    CapApp.addListener('backButton', ({ canGoBack }) => {
                        const dashboard = document.getElementById('dashboard-view');
                        const isOnDashboard = !dashboard.classList.contains('opacity-0') &&
                            dashboard.style.display !== 'none';

                        if (!isOnDashboard) {
                            // We are in the reader/editor â€” go back to dashboard
                            // If keyboard is up (text editing), close it first without navigating
                            if (currentMode === 'text' && isTextEditing) {
                                toggleTextEdit(false);
                            } else if (document.getElementById('editor-container') &&
                                !document.getElementById('editor-container').classList.contains('hidden')) {
                                // In PDF editor â€” exit editor back to reader
                                document.getElementById('editor-container').classList.add('hidden');
                                document.getElementById('editor-container').style.display = 'none';
                                document.getElementById('reader-view').classList.remove('opacity-0', 'pointer-events-none');
                            } else {
                                showDashboard();
                            }
                        } else {
                            // We are on the dashboard â€” exit the app
                            CapApp.exitApp();
                        }
                    });
                    console.log('Back button handler registered.');
                } catch (err) {
                    console.warn('Back button registration failed:', err);
                }
            }
        });

        function toggleTextEdit(editing) {
            isTextEditing = editing;
            const reader = document.getElementById('text-reader-display');
            const editBtn = document.getElementById('edit-text-btn');
            const readBtn = document.getElementById('read-text-btn');

            if (editing) {
                synth.cancel(); isPlaying = false; updateUI();

                // Clear spans and show plain text for clean editing
                const editorValue = document.getElementById('text-editor').value;
                reader.innerText = editorValue;

                reader.contentEditable = 'true'; // Enable keyboard for editing
                reader.focus();
                editBtn.classList.add('hidden');
                readBtn.classList.remove('hidden');
            } else {
                reader.contentEditable = 'false'; // Disable keyboard in reading mode
                reader.blur(); // Dismiss keyboard immediately
                editBtn.classList.remove('hidden');
                readBtn.classList.add('hidden');

                // CRITICAL: Process text into tappable spans after editing is finished
                reRenderTextWithSpans();
            }

            // Sync Word Count
            const text = reader.innerText;
            const wordsCount = text.split(/\s+/).filter(w => w.trim()).length;
            document.getElementById('word-count-badge').innerText = `${wordsCount} Words`;
        }

        function onTextContentInput(el) {
            const text = el.innerText;
            document.getElementById('text-editor').value = text;
            localStorage.setItem('OMNI_SAVED_TEXT', text);

            const wordsCount = text.split(/\s+/).filter(w => w.trim()).length;
            document.getElementById('word-count-badge').innerText = `${wordsCount} Words`;
        }

        function deselectAll() {
            synth.cancel();
            isPlaying = false;
            isSelectionReading = false;
            pdfActiveIndex = -1;
            textActiveIndex = -1;
            activeSelectedText = "";
            selectionWordIndices = [];

            // Prevent clearing selection if typing in the text editor
            if (document.activeElement.id !== 'text-editor') {
                if (window.getSelection) {
                    if (window.getSelection().empty) window.getSelection().empty();
                    else if (window.getSelection().removeAllRanges) window.getSelection().removeAllRanges();
                }
            }

            clearHighlights();
            updateUI();
        }

        // ==========================================
        // VOICE & SPEED AUTO-RESTART
        // ==========================================
        function toggleVoicePopup(e) {
            e.stopPropagation();
            const popup = document.getElementById('voice-popup');
            popup.classList.toggle('hidden');
            if (!popup.classList.contains('hidden')) loadVoices();
        }

        async function setVoice(name) {
            const wasPlaying = isPlaying;
            const wasSelectionReading = isSelectionReading;
            const previousSelectedText = activeSelectedText;
            const resumeIdx = (currentMode === 'pdf') ? pdfActiveIndex : textActiveIndex;

            // HARD STOP — clear all state
            TTSEngine._loopIntent = false;
            TTSEngine._loopRestartFn = null;
            TTSEngine._chunks = [];
            TTSEngine._chunkIndex = 0;
            TTSEngine._activeSessionId = null;
            isPlaying = false;
            TTSEngine.cancel();

            // Force-stop Web Speech twice (Chrome quirk)
            if ('speechSynthesis' in window) {
                try { window.speechSynthesis.cancel(); } catch(e) {}
                await new Promise(r => setTimeout(r, 50));
                try { window.speechSynthesis.cancel(); } catch(e) {}
            }

            if (!availableVoices.length) await TTSEngine.loadVoices();
            const found = availableVoices.find(v => v.name === name);
            if (!found) {
                showToast('Voice not available', 2000);
                return;
            }
            currentVoice = found;

            // Re-cache matching Web Speech voice object
            if (typeof ttsBackend !== 'undefined' && ttsBackend === 'web' && typeof webVoicesCache !== 'undefined' && webVoicesCache.length) {
                const webMatch = webVoicesCache.find(v => v.name === found.name);
                if (!webMatch) console.warn('Voice not found in webVoicesCache:', found.name);
            }

            // Verify with native bridge
            if (typeof ttsBackend !== 'undefined' && ttsBackend === 'native' && window.NativeTTS && window.NativeTTS.setVoice) {
                try {
                    await window.NativeTTS.setVoice({ voiceName: found.name });
                } catch (e) {
                    console.warn('Native setVoice failed:', e);
                }
            }

            TTSEngine._renderVoiceList();
            const isIndian = /^en[-_]IN$|^hi[-_]IN$/i.test(found.locale);
            showToast(`✓ ${isIndian ? 'Indian English 🇮🇳' : 'US English 🇺🇸'} — ${found.locale}`, 1800);
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
            speed = Math.min(Math.max(speed + d, 0.25), 3.0);
            document.getElementById('speed-text').innerText = speed.toFixed(1) + "x";

            if (wasPlaying) {
                synth.cancel(); // Cancel previous utterance to prevent audio overlap
                if (isSelectionReading) {
                    speakSelection(activeSelectedText);
                } else {
                    const idx = (currentMode === 'pdf') ? pdfActiveIndex : textActiveIndex;
                    speakFrom(Math.max(0, idx));
                }
            }
        }

        // ==========================================
        // PDF ZOOM ENGINE (Width-based, no Y-transform)
        // Single-finger scroll = native. Pinch = scale container width.
        // ==========================================
        const view = document.getElementById('pdf-viewport-container');
        const scrollHost = document.getElementById('pdf-scroll-host');
        const content = document.getElementById('pdf-render-container');
        let scale = 1;
        let lastTouchDist = 0;

        function applyPdfScale() {
            // Scale = multiplier on top of perfect-fit (scale 1 = 100% viewport width = perfect fit)
            // We change the container's width percentage; pages inside use width:100% so they fill it
            const pct = Math.round(100 * scale);
            content.style.width = pct + '%';

            const label = document.getElementById('pdf-zoom-level');
            if (label) label.innerText = Math.round(scale * 100) + "%";
        }

        // Legacy compat shims (called elsewhere in code)
        function updateTransform(isSnap) { applyPdfScale(); }
        function getBounds() { return { minX: 0, minY: 0, maxX: 0, maxY: 0 }; }
        function applyRubberBand(v, mn, mx) { return Math.max(mn, Math.min(mx, v)); }
        let currentX = 0, currentY = 0; // kept for compat, unused

        function adjustPdfZoom(multiplier) {
            scale = Math.min(Math.max(scale * multiplier, 0.4), 5);
            applyPdfScale();
        }

        function resetPdfZoom() {
            scale = 1;
            applyPdfScale();
            scrollHost.scrollTo({ top: 0, behavior: 'smooth' });
        }

        // Pinch-to-zoom only — single finger uses native scroll
        let pinchCenter = { x: 0, y: 0 };

        view.addEventListener('wheel', (e) => {
            e.preventDefault();
            if (e.ctrlKey) {
                const delta = -e.deltaY * 0.01;
                const newScale = Math.min(Math.max(scale + delta * scale, 0.4), 5);
                if (newScale !== scale) {
                    const factor = newScale / scale;
                    scale = newScale;
                    
                    const rect = scrollHost.getBoundingClientRect();
                    const cx = e.clientX - rect.left;
                    const cy = e.clientY - rect.top;
                    
                    const contentX = scrollHost.scrollLeft + cx;
                    const contentY = scrollHost.scrollTop + cy;
                    
                    applyPdfScale();
                    
                    // Force synchronous layout so scrollLeft/scrollTop bounds are updated
                    scrollHost.scrollWidth;
                    
                    scrollHost.scrollLeft = (contentX * factor) - cx;
                    scrollHost.scrollTop = (contentY * factor) - cy;
                }
            } else {
                scrollHost.scrollBy({ left: e.deltaX, top: e.deltaY, behavior: 'auto' });
            }
        }, { passive: false });

        view.ontouchstart = (e) => {
            if (e.touches.length === 2) {
                const dx = e.touches[0].clientX - e.touches[1].clientX;
                const dy = e.touches[0].clientY - e.touches[1].clientY;
                lastTouchDist = Math.sqrt(dx * dx + dy * dy);

                const rect = scrollHost.getBoundingClientRect();
                pinchCenter.x = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
                pinchCenter.y = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;
            }
        };

        view.ontouchmove = (e) => {
            if (e.touches.length === 2) {
                e.preventDefault();
                const dx = e.touches[0].clientX - e.touches[1].clientX;
                const dy = e.touches[0].clientY - e.touches[1].clientY;
                const dist = Math.sqrt(dx * dx + dy * dy);
                
                const newScale = Math.min(Math.max(scale * (dist / lastTouchDist), 0.4), 5);
                
                if (newScale !== scale) {
                    const factor = newScale / scale;
                    scale = newScale;
                    
                    const contentX = scrollHost.scrollLeft + pinchCenter.x;
                    const contentY = scrollHost.scrollTop + pinchCenter.y;
                    
                    applyPdfScale();
                    
                    // Force synchronous layout so scrollLeft/scrollTop bounds are updated
                    scrollHost.scrollWidth;
                    
                    scrollHost.scrollLeft = (contentX * factor) - pinchCenter.x;
                    scrollHost.scrollTop = (contentY * factor) - pinchCenter.y;
                }
                
                lastTouchDist = dist;
            }
        };

        view.ontouchend = () => { };

        // ==========================================
        // FAST SCROLLER COMPONENT
        // ==========================================
        (function initFastScroller() {
            const scroller = document.getElementById('fast-scroller');
            const handle = document.getElementById('fast-scroller-handle');
            const indicator = document.getElementById('fast-scroller-indicator');
            let isDraggingHandle = false;
            let lastPage = -1;
            let hideTimer = null;

            function showScroller() {
                scroller.classList.add('visible');
                clearTimeout(hideTimer);
                hideTimer = setTimeout(() => scroller.classList.remove('visible'), 2000);
            }

            function getPageAtScrollPos(scrollTop, totalScrollHeight, numPages) {
                if (!numPages || totalScrollHeight <= 0) return 1;
                const ratio = scrollTop / totalScrollHeight;
                return Math.min(Math.max(Math.ceil(ratio * numPages), 1), numPages);
            }

            function updateHandlePosition(scrollTop, maxScroll, containerH) {
                const ratio = maxScroll > 0 ? scrollTop / maxScroll : 0;
                const trackH = containerH - 56; // 56 = handle height + indicator
                const topPos = Math.max(0, Math.min(ratio * trackH, trackH));
                handle.style.top = topPos + 'px';
            }

            function updateIndicator(page, total) {
                if (page !== lastPage) {
                    indicator.textContent = `${page} / ${total}`;
                    // Haptic tick on page change
                    if (lastPage !== -1 && window.navigator?.vibrate) {
                        window.navigator.vibrate(8);
                    }
                    lastPage = page;
                }
            }

            // Sync on native scroll
            scrollHost.addEventListener('scroll', () => {
                if (isDraggingHandle) return; // Don't fight the drag
                if (!pdfDoc) return;
                const scrollTop = scrollHost.scrollTop;
                const maxScroll = scrollHost.scrollHeight - scrollHost.clientHeight;
                const containerH = view.clientHeight;

                updateHandlePosition(scrollTop, maxScroll, containerH);
                updateIndicator(
                    getPageAtScrollPos(scrollTop, maxScroll, pdfDoc.numPages),
                    pdfDoc.numPages
                );
                showScroller();
            }, { passive: true });

            // Drag logic
            function onDragStart(e) {
                isDraggingHandle = true;
                handle.style.transition = 'none';
                e.stopPropagation();
                e.preventDefault();
            }

            function onDragMove(e) {
                if (!isDraggingHandle || !pdfDoc) return;
                e.preventDefault();
                const clientY = e.touches ? e.touches[0].clientY : e.clientY;
                const rect = view.getBoundingClientRect();
                const relativeY = clientY - rect.top;
                const containerH = view.clientHeight;
                const trackH = containerH - 56;

                const ratio = Math.max(0, Math.min((relativeY - 28) / trackH, 1)); // 28 = half grip
                const maxScroll = scrollHost.scrollHeight - scrollHost.clientHeight;
                scrollHost.scrollTop = ratio * maxScroll;

                updateHandlePosition(scrollHost.scrollTop, maxScroll, containerH);
                updateIndicator(
                    getPageAtScrollPos(scrollHost.scrollTop, maxScroll, pdfDoc.numPages),
                    pdfDoc.numPages
                );
                showScroller();
            }

            function onDragEnd() {
                isDraggingHandle = false;
                handle.style.transition = '';
            }

            handle.addEventListener('mousedown', onDragStart);
            handle.addEventListener('touchstart', onDragStart, { passive: false });
            document.addEventListener('mousemove', onDragMove);
            document.addEventListener('touchmove', onDragMove, { passive: false });
            document.addEventListener('mouseup', onDragEnd);
            document.addEventListener('touchend', onDragEnd);
        })();



        // ==========================================
        // PDF & ENGINE LOGIC
        // ==========================================


        // ==========================================
        // SELECTION & WORD HANDLING
        // ==========================================

        function handleSelection() {
            if (currentMode === 'text' && isTextEditing) return;

            const sel = window.getSelection();
            if (!sel || sel.rangeCount === 0) return;

            const text = sel.toString().trim();
            // Reduce sensitivity: require at least 5 meaningful characters
            if (text.length < 2) {
                // Only deselect if it was an empty or tiny selection
                if (!sel.isCollapsed && text.length === 0) deselectAll();
                return;
            }

            const container = document.getElementById('reader-view');
            if (!container.contains(sel.anchorNode)) return;

            activeSelectedText = text;
            selectionWordIndices = [];
            const prefix = (currentMode === 'pdf') ? 'pdf-word-' : 'text-word-';
            const range = sel.getRangeAt(0);

            document.querySelectorAll(currentMode === 'pdf' ? '.word-span' : '.text-word-span').forEach(span => {
                if (range.intersectsNode(span)) {
                    const id = parseInt(span.id.replace(prefix, ''));
                    if (!isNaN(id)) selectionWordIndices.push(id);
                }
            });

            if (selectionWordIndices.length > 0) {
                synth.cancel();
                isSelectionReading = true;
                // Immediate visual feedback: highlight the first word of selection
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
            // FIX PAGE-JUMP: Only scroll if the word is NOT already visible.
            // Using block:'center' every word causes aggressive, page-shifting jumps.
            const mode = modeOverride === 'pdf' ? 'pdf' : 'text';
            const idx = (mode === 'pdf') ? pdfActiveIndex : textActiveIndex;
            const active = document.getElementById(`${mode}-word-${idx}`);
            if (!active) return;

            // Find the correct scroll container for each mode
            const scrollEl = (mode === 'pdf')
                ? document.getElementById('pdf-scroll-host')
                : document.getElementById('text-reader-display');
            if (!scrollEl) return;

            const wordRect = active.getBoundingClientRect();
            const containerRect = scrollEl.getBoundingClientRect();

            // 80px top buffer for the toolbar, 40px bottom buffer
            const isVisible = wordRect.top >= containerRect.top + 80
                && wordRect.bottom <= containerRect.bottom - 40;

            if (!isVisible) {
                // block:'nearest' adjusts by the minimum amount needed — no jarring overshoots
                active.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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
        const hasText = document.getElementById('text-editor').value.trim().length > 0;
        if (!hasText) {
            showToast('Please enter some text to read first.', 2500);
            return;
        }
        toggleTextEdit(false);
    }
    // Ensure voices are loaded before first speak (mobile Chrome edge case)
    if (!availableVoices.length) {
        TTSEngine.loadVoices().then(() => startPlayback());
    } else {
        startPlayback();
    }
    function startPlayback() {
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

            playIcon.className = isPlaying ? "fas fa-pause text-pink-500" : "fas fa-play ml-1 text-gray-700";

            if (isLooping) {
                loopBtn.style.color = "var(--primary-pink)";
                loopBtn.classList.add('scale-110');
            } else {
                loopBtn.style.color = "#4B5563"; // gray-600
                loopBtn.classList.remove('scale-110');
                loopBtn.style.textShadow = "none";
            }
        }



        function onTextChange() {
            const display = document.getElementById('text-reader-display');
            textWords = display.innerText.split(/(\s+)/).filter(w => w.length > 0);
            document.getElementById('word-count-badge').innerText = `${textWords.filter(w => w.trim()).length} Words`;
        }

        function reRenderTextWithSpans() {
            const editor = document.getElementById('text-editor');
            const reader = document.getElementById('text-reader-display');
            const words = editor.value.split(/(\s+)/);
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
        }

        function showDashboard() {
            // Permanent Removal: Stop speech and clear all document data
            synth.cancel();
            isPlaying = false;
            updateUI();

            // Clear written text and autosave
            document.getElementById('text-editor').value = "";
            localStorage.removeItem('OMNI_SAVED_TEXT');

            // Hide Header Controls and Back Button

            document.getElementById('mode-toggle-container').classList.add('hidden');
            document.getElementById('tools-container').classList.add('hidden');

            pdfWords = [];
            textWords = [];
            readerTokenMeta.pdf = [];
            readerTokenMeta.text = [];
            pdfActiveIndex = -1;
            textActiveIndex = -1;
            pdfDoc = null;
            isSelectionReading = false;
            activeSelectedText = "";
            selectionWordIndices = [];

            // Clear UI
            document.getElementById('pdf-render-container').innerHTML = "";
            document.getElementById('text-reader-display').innerHTML = "";
            document.getElementById('word-count-badge').innerText = "0 Words";
            document.getElementById('file-upload').value = ""; // Clear file selector

            // Reset Layout & Navigation
            const dashboard = document.getElementById('dashboard-view');
            dashboard.classList.remove('opacity-0', 'pointer-events-none');
            dashboard.style.display = 'flex';

            document.getElementById('reader-view').classList.add('opacity-0', 'pointer-events-none');
            document.getElementById('player-bar').classList.add('translate-y-32');

            // Clear Editor State
            if (fabricCanvas) {
                fabricCanvas.clear();
                fabricCanvas.dispose();
                fabricCanvas = null;
            }
            editorHistory = [];
            redoStack = [];
            const canvasWrapper = document.getElementById('canvas-wrapper');
            if (canvasWrapper) canvasWrapper.innerHTML = '<canvas id="editor-canvas"></canvas>';

            // Ensure Editor UI is hidden and Main Header is ready
            document.getElementById('editor-container').classList.add('hidden');
            document.getElementById('editor-container').style.display = 'none';
            document.querySelector('header').classList.remove('hidden');

            scale = 1; currentX = 0; currentY = 0; updateTransform();
            currentMode = 'pdf';
        }

        function showTextView() {
            const dashboard = document.getElementById('dashboard-view');
            dashboard.classList.add('opacity-0', 'pointer-events-none');
            setTimeout(() => { if (dashboard.classList.contains('opacity-0')) dashboard.style.display = 'none'; }, 500);

            document.getElementById('reader-view').classList.remove('opacity-0', 'pointer-events-none');
            document.getElementById('player-bar').classList.remove('translate-y-32');

            // Show Header Controls and Back Button

            document.getElementById('mode-toggle-container').classList.remove('hidden');
            document.getElementById('tools-container').classList.remove('hidden');

            switchMode('text');
        }

        // Global function for Android to inject file data (Bypasses Sandbox limits)
        window.handleNativeFile = async (base64Data, fileName) => {
            try {
                const byteCharacters = atob(base64Data);
                const byteNumbers = new Array(byteCharacters.length);
                for (let i = 0; i < byteCharacters.length; i++) {
                    byteNumbers[i] = byteCharacters.charCodeAt(i);
                }
                const byteArray = new Uint8Array(byteNumbers);
                const blob = new Blob([byteArray], { type: 'application/pdf' });
                const file = new File([blob], fileName, { type: 'application/pdf' });

                renderPdf(file);

                const dashboard = document.getElementById('dashboard-view');
                dashboard.classList.add('opacity-0', 'pointer-events-none');
                setTimeout(() => { if (dashboard.classList.contains('opacity-0')) dashboard.style.display = 'none'; }, 500);

                document.getElementById('reader-view').classList.remove('opacity-0', 'pointer-events-none');
                document.getElementById('player-bar').classList.remove('translate-y-32');

                document.getElementById('mode-toggle-container').classList.remove('hidden');
                document.getElementById('tools-container').classList.remove('hidden');

                switchMode('pdf');
            } catch (err) {
                console.error("Native File Error:", err);
                alert("Failed to process file from Android.");
            }
        };

        document.getElementById('file-upload').onchange = (e) => {
            const file = e.target.files[0];
            if (file) {
                renderPdf(file);
                const dashboard = document.getElementById('dashboard-view');
                dashboard.classList.add('opacity-0', 'pointer-events-none');
                setTimeout(() => { if (dashboard.classList.contains('opacity-0')) dashboard.style.display = 'none'; }, 500);

                document.getElementById('reader-view').classList.remove('opacity-0', 'pointer-events-none');
                document.getElementById('player-bar').classList.remove('translate-y-32');

                // Show Header Controls and Back Button

                document.getElementById('mode-toggle-container').classList.remove('hidden');
                document.getElementById('tools-container').classList.remove('hidden');

                switchMode('pdf');
            }
        };

        function extractJSON(str) {
            try {
                const first = str.indexOf('{');
                const last = str.lastIndexOf('}');
                if (first !== -1 && last !== -1 && last > first) {
                    return JSON.parse(str.substring(first, last + 1));
                }
                const firstArr = str.indexOf('[');
                const lastArr = str.lastIndexOf(']');
                if (firstArr !== -1 && lastArr !== -1 && lastArr > firstArr) {
                    return JSON.parse(str.substring(firstArr, lastArr + 1));
                }
            } catch (e) {
                console.warn("extractJSON failed:", e);
            }
            return null;
        }

        async function processAI(action) {
            synth.cancel(); isPlaying = false; updateUI();
            if (document.getElementById('ai-tools-dropdown')) {
                document.getElementById('ai-tools-dropdown').classList.add('hidden');
            }
            const provider = AI_CONFIG.activeProvider;
            const key = AI_CONFIG.keys[provider];
            let text = activeSelectedText;
            if (!text) text = (currentMode === 'pdf') ? pdfWords.join(" ") : document.getElementById('text-reader-display').innerText;
            if (provider !== 'ollama' && (!key || key.length < 10)) {
                if (typeof showToast !== 'undefined') return showToast(`Add your ${provider.toUpperCase()} key first`);
                else return alert(`Add your ${provider.toUpperCase()} key first`);
            }
            if (provider === 'ollama' && !key) {
                AI_CONFIG.keys.ollama = DEFAULT_OLLAMA_URL;
                localStorage.setItem('AI_CONFIG', JSON.stringify(AI_CONFIG));
            }
            if (!text.trim()) {
                if (typeof showToast !== 'undefined') return showToast("No content to analyze");
                else return alert("No content to analyze");
            }
            const modal = document.getElementById('ai-modal');
            const content = document.getElementById('modal-content');
            const title = document.getElementById('modal-title');
            modal.classList.remove('hidden');
            content.innerText = `Consulting ${provider.toUpperCase()}${provider === 'ollama' ? ' (' + (AI_CONFIG.ollamaModel || DEFAULT_OLLAMA_MODEL) + ')' : ''}...`;
            title.innerText = action.charAt(0).toUpperCase() + action.slice(1) + " (AI)";
            const prompts = {
                summary: "Summarize the following text clearly and concisely:",
                explain: "Explain the concepts in the following text in simple terms:",
                simplify: "Simplify this text so a 5th grader can understand:",
                quiz: "Generate 3 multiple choice questions based on this text. Return ONLY a JSON array of objects with 'question', 'options' (array of 4), and 'answer' (the correct string) fields.",
                cards: "Generate 3 flashcards based on this text. Return ONLY a JSON array of objects with 'front' and 'back' fields.",
                lecture: "Give a brief lecture-style explanation of this text:",
                ask: "Answer the following question about this text:"
            };
            const prompt = prompts[action] || "Answer the following question about this text:";
            try {
                let url = "", body = {}, headers = { 'Content-Type': 'application/json' };
                if (provider === 'gemini') {
                    url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${key}`;
                    body = { contents: [{ parts: [{ text: prompt + "\n\n" + text }] }] };
                } else if (provider === 'openai' || provider === 'meta' || provider === 'deepseek') {
                    url = provider === 'openai' ? "https://api.openai.com/v1/chat/completions"
                        : provider === 'deepseek' ? "https://api.deepseek.com/chat/completions"
                            : "https://api.groq.com/openai/v1/chat/completions";
                    headers['Authorization'] = `Bearer ${key}`;
                    body = {
                        model: provider === 'openai' ? "gpt-4o-mini" : provider === 'deepseek' ? "deepseek-chat" : "llama-3.1-70b-versatile",
                        messages: [{ role: "user", content: prompt + "\n\n" + text }]
                    };
                } else if (provider === 'claude') {
                    url = "https://api.anthropic.com/v1/messages";
                    headers['x-api-key'] = key;
                    headers['anthropic-version'] = '2023-06-01';
                    body = { model: "claude-3-5-sonnet-20240620", max_tokens: 1024, messages: [{ role: "user", content: prompt + "\n\n" + text }] };
                } else if (provider === 'ollama') {
                    const baseUrl = (key || DEFAULT_OLLAMA_URL).replace(/\/+$/, '');
                    url = `${baseUrl}/api/generate`;
                    body = { model: AI_CONFIG.ollamaModel || DEFAULT_OLLAMA_MODEL, prompt: prompt + "\n\n" + text, stream: false };
                }
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), provider === 'ollama' ? 120000 : 60000);
                const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal });
                clearTimeout(timeoutId);
                if (!response.ok) {
                    const errText = await response.text();
                    throw new Error(`HTTP ${response.status}: ${errText.substring(0, 200)}`);
                }
                const data = await response.json();
                if (data.error) throw new Error(data.error.message || data.error || "API Error");
                let resText = "";
                if (provider === 'gemini') resText = data.candidates[0].content.parts[0].text;
                else if (provider === 'openai' || provider === 'meta' || provider === 'deepseek') resText = data.choices[0].message.content;
                else if (provider === 'claude') resText = data.content[0].text;
                else if (provider === 'ollama') resText = data.response;

                if (action === 'quiz' || action === 'cards') {
                    const jsonData = extractJSON(resText);
                    if (jsonData) {
                        if (action === 'quiz' && Array.isArray(jsonData)) {
                            resText = jsonData.map((q, i) => `<b>${i + 1}. ${q.question}</b><br>` +
                                (q.options ? q.options.map(o => `• ${o}`).join('<br>') : "") +
                                `<br><i style="color:var(--primary-color)">Answer: ${q.answer}</i>`).join('<br><br>');
                        } else if (action === 'cards' && Array.isArray(jsonData)) {
                            resText = jsonData.map((c, i) => `<div style="border:1px solid #ccc; padding:10px; margin:5px; border-radius:8px"><b>Front:</b> ${c.front}<br><hr><b>Back:</b> ${c.back}</div>`).join('');
                        }
                        content.innerHTML = resText;
                        return;
                    }
                }

                let globalIdx = 0;
                content.innerHTML = resText.split(/(\s+)/).map(word => {
                    if (!word.trim()) return word;
                    return `<span id="ai-word-${globalIdx++}" class="ai-word-span">${word}</span>`;
                }).join("");
            } catch (err) {
                let msg = err.message || String(err);
                if (err.name === 'AbortError') msg = 'Request timed out. Check that Ollama is running on your PC and reachable.';
                else if (provider === 'ollama' && /Failed to fetch|NetworkError|ERR_/i.test(msg)) {
                    msg = `Cannot reach Ollama at ${AI_CONFIG.keys.ollama}.\n\nChecklist:\n1. Ollama is running on your PC\n2. Phone is on the same Wi-Fi\n3. PC has OLLAMA_HOST=0.0.0.0:11434 set\n4. Firewall allows port 11434`;
                }
                content.innerText = `Error with ${provider.toUpperCase()}: ${msg}`;
            }
        }

        function closeModal() {
            synth.cancel(); // Stop AI narration if closing
            document.getElementById('ai-modal').classList.add('hidden');
        }

        async function copyModalText(e) {
            const text = document.getElementById('modal-content').innerText;
            try {
                await navigator.clipboard.writeText(text);
                const btn = e.currentTarget;
                const oldContent = btn.innerHTML;
                btn.innerHTML = '<i class="fas fa-check"></i> Copied!';
                setTimeout(() => btn.innerHTML = oldContent, 2000);
            } catch (err) { alert("Failed to copy text."); }
        }

        function speakModalText() {
            console.log("speakModalText Native called");
            synth.cancel();
            const content = document.getElementById('modal-content');
            const text = content.innerText;

            isPlaying = true;
            updateUI();

            synth.speak(text, speed, currentVoice ? currentVoice.name : null);
        }


        let _editInitTimer = null; // BUG-E5: Debounce timer for edit mode init

        function switchMode(mode) {
            synth.cancel();
            isPlaying = false;
            isSelectionReading = false;
            activeSelectedText = "";
            selectionWordIndices = [];

            // BUG-E5 FIX: Cancel any pending edit init from a previous rapid switch
            if (_editInitTimer) {
                clearTimeout(_editInitTimer);
                _editInitTimer = null;
            }

            // BUG-E2 FIX: Prevent opening a blank editor when no PDF is loaded
            if (mode === 'edit' && !pdfDoc) {
                showToast('Please open a PDF file first before using the editor.', 3000);
                return; // Stay in current mode
            }

            currentMode = mode;

            // Clear visual selection
            if (window.getSelection) {
                if (window.getSelection().empty) window.getSelection().empty();
                else if (window.getSelection().removeAllRanges) window.getSelection().removeAllRanges();
            }

            const pdfContainer = document.getElementById('pdf-viewport-container');
            const textContainer = document.getElementById('text-container');
            const editorContainer = document.getElementById('editor-container');

            // Toggle Main Containers
            pdfContainer.classList.add('hidden');
            textContainer.classList.add('hidden');
            editorContainer.classList.add('hidden');

            const mainHeader = document.querySelector('header');

            if (mode === 'pdf') {
                pdfContainer.classList.remove('hidden');
                document.getElementById('pdf-view-controls').classList.remove('hidden');
                mainHeader.classList.remove('hidden');
                editorContainer.classList.add('hidden');
                editorContainer.style.display = 'none';

                // Re-validate position (in case header changed layout)
                setTimeout(() => {
                    const bounds = getBounds();
                    currentX = Math.max(bounds.minX, Math.min(bounds.maxX, currentX));
                    currentY = Math.max(bounds.minY, Math.min(bounds.maxY, currentY));
                    updateTransform();
                }, 50);
            } else if (mode === 'text') {
                textContainer.classList.remove('hidden');
                document.getElementById('pdf-view-controls').classList.add('hidden');
                mainHeader.classList.remove('hidden');
                editorContainer.classList.add('hidden');
                editorContainer.style.display = 'none';
            } else if (mode === 'edit') {
                editorContainer.classList.remove('hidden');
                editorContainer.style.display = 'flex';
                document.getElementById('pdf-view-controls').classList.add('hidden');
                
                // Fix 2: Force the browser to recalculate layout immediately so dimensions aren't 0
                void editorContainer.offsetHeight;

                // Keep the header visible so the mode tabs (PDF/Text/Edit) remain accessible
                // Only hide the player and tools, not the whole header
                // BUG-E5 FIX: Use debounced timer to prevent concurrent inits
                _editInitTimer = setTimeout(() => {
                    _editInitTimer = null;
                    initEditor();
                    syncPdfToEditor();
                }, 100); // Increased slightly to give older phones time to paint the UI
            }

            // Sync Word Count Badge
            const badge = document.getElementById('word-count-badge');
            if (mode === 'edit') badge.parentElement.classList.add('hidden');
            else {
                badge.parentElement.classList.remove('hidden');
                const wordsCount = (mode === 'pdf') ? (pdfWords.length) : textWords.filter(w => w.trim()).length;
                badge.innerText = `${wordsCount} Words`;
            }

            // Toggle Tools & Player Bar Interaction
            const tools = document.getElementById('tools-container');
            const player = document.getElementById('player-bar');

            if (mode === 'edit') {
                tools.classList.add('hidden');
                player.classList.add('hidden', 'translate-y-32');
            } else {
                tools.classList.remove('hidden');
                player.classList.remove('hidden', 'translate-y-32');
            }

            // Style the active tab
            document.querySelectorAll('#mode-toggle-container button').forEach(b => {
                b.classList.remove('bg-white', 'shadow-sm', 'text-primary-pink');
                b.classList.add('text-gray-400');
            });
            const activeTab = document.getElementById(`tab-${mode}`);
            if (activeTab) {
                activeTab.classList.add('bg-white', 'shadow-sm', 'text-primary-pink');
                activeTab.classList.remove('text-gray-400');
            }

            if (mode === 'text') {
                const editor = document.getElementById('text-editor');
                const hasText = editor.value.trim().length > 0;
                toggleTextEdit(!hasText);
            }
            updateHighlight();
        }

        // ==========================================
        // EDITOR MODE LOGIC (Fabric.js & OCR)
        // ==========================================
        // ==========================================
        // EDITOR & VIEW MODE LOGIC
        // ==========================================
        let fabricCanvas = null;
        let editorTool = 'select';
        let editorHistory = [];
        let redoStack = [];

        // Shape Drawing State
        let activeShapeType = null;
        let isDrawingShape = false;
        let drawingObject = null;
        let shapeStartPoint = null;

        let twoPageOption = 1;

        function toggleTwoPage() {
            if (isTwoPage) {
                // Return to normal
                isTwoPage = false;
                const btn = document.getElementById('btn-two-page');
                btn.classList.remove('text-primary-pink', 'bg-pink-50');
                if (pdfDoc) renderPdf(null, true);
            } else {
                // Show choice modal
                document.getElementById('two-page-options-modal').classList.remove('hidden');
            }
        }

        function setTwoPageMode(option) {
            twoPageOption = option;
            isTwoPage = true;

            const btn = document.getElementById('btn-two-page');
            btn.classList.add('text-primary-pink', 'bg-pink-50');

            closeTwoPageOptions();
            if (pdfDoc) renderPdf(null, true);

            // Show layout notification
            const notify = document.getElementById('layout-notification');
            notify.innerText = (option === 1) ? "Pairs: (1, 2), (3, 4)..." : "Pairs: (1), (2, 3), (4, 5)...";
            notify.classList.remove('opacity-0');
            setTimeout(() => notify.classList.add('opacity-0'), 3000);
        }

        function closeTwoPageOptions() {
            document.getElementById('two-page-options-modal').classList.add('hidden');
        }

        function toggleSplitView(silent = false) {
            isSplitView = !isSplitView;
            const btn = document.getElementById('btn-split-view');
            const panel = document.getElementById('split-ocr-panel');

            btn.classList.toggle('text-primary-pink', isSplitView);
            btn.classList.toggle('bg-pink-50', isSplitView);
            panel.classList.toggle('hidden', !isSplitView);
            panel.classList.toggle('flex', isSplitView);

            // Trigger OCR Prompt when opening split view ONLY IF not silent
            if (isSplitView && !silent) {
                promptOCRChoice();
            }
        }
        // C-3: Removed duplicate hexToRgba — canonical version is below at EDITOR CONFIG section

        let _editorResizeObserver = null;

        function initEditor() {
            // BUG-E3 FIX: Validate canvas health. If the Fabric canvas was partially
            // initialized but the underlying DOM element is gone (e.g., after an OOM crash
            // or DOM re-render), dispose the stale reference and allow re-creation.
            if (fabricCanvas) {
                try {
                    // Quick health check: verify the canvas element is still in the DOM
                    const el = fabricCanvas.getElement();
                    if (el && el.parentNode && document.contains(el)) {
                        return; // Canvas is healthy, skip re-init
                    }
                    // Canvas element is orphaned/missing — dispose and re-create
                    console.warn('BUG-E3: Fabric canvas is corrupted (DOM orphaned). Disposing...');
                    fabricCanvas.dispose();
                    fabricCanvas = null;
                } catch (e) {
                    console.warn('BUG-E3: Fabric canvas health check failed:', e.message);
                    try { fabricCanvas.dispose(); } catch (ex) { /* ignore */ }
                    fabricCanvas = null;
                }
            }

            // High-Resolution Quality Canvas
            fabricCanvas = new fabric.Canvas('editor-canvas', {
                renderOnAddRemove: false,
                stateful: false,
                objectCaching: true,
                imageSmoothingEnabled: true, // Quality: Keep text sharp
                preserveObjectStacking: true,
                allowTouchScrolling: false,
                skipOffscreen: true,
                enableRetinaCanvas: true // Quality: Essential for high-DPI screens
            });

            // Auto-resize canvas when workspace changes (e.g., orientation change or flex reflow)
            const workspace = document.getElementById('editor-workspace');
            if (workspace) {
                if (_editorResizeObserver) _editorResizeObserver.disconnect();
                _editorResizeObserver = new ResizeObserver(() => {
                    if (fabricCanvas && currentMode === 'edit') {
                        if (workspace.clientWidth > 0 && workspace.clientHeight > 0) {
                            fabricCanvas.setDimensions({
                                width: workspace.clientWidth,
                                height: workspace.clientHeight
                            });
                            fabricCanvas.requestRenderAll();
                        }
                    }
                });
                _editorResizeObserver.observe(workspace);
            }
            // History tracking (Undo/Redo)
            fabricCanvas.on('object:added', (e) => {
                if (!isDrawingShape) saveHistory();
            });
            fabricCanvas.on('object:modified', saveHistory);
            // object:removed is intentionally not tracked here to prevent redundant undo state pollution when erasing multiple things at once.

            // SELECTION EVENTS for Context Menu
            fabricCanvas.on('selection:created', onObjectSelected);
            fabricCanvas.on('selection:updated', onObjectSelected);
            fabricCanvas.on('selection:cleared', onSelectionCleared);

            // ==========================================
            // EDIT MODE FAST SCROLLER (identical to PDF mode)
            // ==========================================
            (function initEditFastScroller() {
                const scroller = document.getElementById('edit-fast-scroller');
                const handle = document.getElementById('edit-fast-scroller-handle');
                const indicator = document.getElementById('edit-fast-scroller-indicator');
                let isDraggingHandle = false;
                let lastPage = -1;
                let hideTimer = null;
                let dragStartClientY = 0;
                let dragStartVptY = 0;

                function showEditScroller() {
                    scroller.classList.add('visible');
                    clearTimeout(hideTimer);
                    hideTimer = setTimeout(() => scroller.classList.remove('visible'), 2000);
                }

                function getEditScrollInfo() {
                    if (!fabricCanvas || !fabricCanvas.docHeight) return null;
                    const vpt = fabricCanvas.viewportTransform;
                    const zoom = fabricCanvas.getZoom();
                    const totalDocH = fabricCanvas.docHeight * zoom;
                    const viewH = fabricCanvas.getHeight();
                    const scrolled = Math.max(0, -vpt[5]);
                    const maxScroll = Math.max(0, totalDocH - viewH);
                    return { totalDocH, viewH, scrolled, maxScroll };
                }

                function updateEditFastScroller() {
                    // Only allow fast scroller in 'select' mode to prevent accidental scrolling while drawing/shaping
                    if (editorTool !== 'select' && editorTool !== 'crop') {
                        scroller.classList.remove('visible');
                        return;
                    }

                    const info = getEditScrollInfo();
                    if (!info || info.maxScroll <= 0) { scroller.classList.remove('visible'); return; }

                    const { totalDocH, viewH, scrolled, maxScroll } = info;
                    const containerH = viewH;
                    const trackH = containerH - 56;

                    // Thumb position
                    const scrollRatio = scrolled / maxScroll;
                    const topPos = Math.max(0, Math.min(scrollRatio * trackH, trackH));
                    handle.style.top = topPos + 'px';

                    // Page indicator: estimate page from scroll ratio + docHeight
                    let pageNum = 1;
                    if (pdfDoc) {
                        pageNum = Math.max(1, Math.min(Math.ceil(scrollRatio * pdfDoc.numPages), pdfDoc.numPages));
                    }
                    const total = pdfDoc ? pdfDoc.numPages : 1;
                    if (pageNum !== lastPage) {
                        indicator.textContent = `${pageNum} / ${total}`;
                        if (lastPage !== -1 && window.navigator?.vibrate) window.navigator.vibrate(8);
                        lastPage = pageNum;
                    }
                    showEditScroller();
                }

                // Hook into Fabric render loop
                fabricCanvas.on('after:render', () => {
                    if (!isDraggingHandle) updateEditFastScroller();
                });

                // --- Drag Handlers ---
                function onEditDragStart(e) {
                    isDraggingHandle = true;
                    handle.style.transition = 'none';
                    dragStartClientY = e.touches ? e.touches[0].clientY : e.clientY;
                    dragStartVptY = fabricCanvas.viewportTransform[5];
                    e.stopPropagation();
                    e.preventDefault();
                }

                function onEditDragMove(e) {
                    if (!isDraggingHandle) return;
                    e.preventDefault();
                    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
                    const info = getEditScrollInfo();
                    if (!info) return;

                    const editorContainerEl = document.getElementById('editor-container');
                    const rect = editorContainerEl.getBoundingClientRect();
                    const relativeY = clientY - rect.top;
                    const containerH = info.viewH;
                    const trackH = containerH - 56;

                    const ratio = Math.max(0, Math.min((relativeY - 28) / trackH, 1));
                    const newVptY = -(ratio * info.maxScroll);

                    fabricCanvas.viewportTransform[5] = newVptY;
                    fabricCanvas.requestRenderAll();
                    updateEditFastScroller();
                }

                function onEditDragEnd() {
                    isDraggingHandle = false;
                    handle.style.transition = '';
                }

                handle.addEventListener('mousedown', onEditDragStart);
                handle.addEventListener('touchstart', onEditDragStart, { passive: false });
                document.addEventListener('mousemove', onEditDragMove);
                document.addEventListener('touchmove', onEditDragMove, { passive: false });
                document.addEventListener('mouseup', onEditDragEnd);
                document.addEventListener('touchend', onEditDragEnd);
            })();


            // ==========================================
            // EDIT MODE: SINGLE-FINGER TOUCH PAN
            // ==========================================
            (function initEditTouchPan() {
                const canvasEl = fabricCanvas.upperCanvasEl;
                let touchStartX = 0, touchStartY = 0;
                let panActive = false;
                // Track if a Fabric object was under the finger at touchstart
                let touchStartedOnObject = false;

                canvasEl.addEventListener('touchstart', (e) => {
                    if (e.touches.length !== 1) return;
                    touchStartX = e.touches[0].clientX;
                    touchStartY = e.touches[0].clientY;
                    panActive = false;

                    // Check if the touch landed on a selectable Fabric object
                    const rect = canvasEl.getBoundingClientRect();
                    const pt = new fabric.Point(
                        (e.touches[0].clientX - rect.left) / fabricCanvas.getZoom(),
                        (e.touches[0].clientY - rect.top) / fabricCanvas.getZoom()
                    );
                    const hitObj = fabricCanvas.findTarget(e.touches[0], false);
                    touchStartedOnObject = !!(hitObj && hitObj.selectable && !hitObj.isPdfBackground);
                }, { passive: true });

                canvasEl.addEventListener('touchmove', (e) => {
                    if (e.touches.length !== 1) return;
                    if (editorTool !== 'select' || activeShapeType) return;
                    // Yield to Fabric if the user started the drag on a shape
                    if (touchStartedOnObject || fabricCanvas._isCurrentlyMoving) return;

                    const dx = e.touches[0].clientX - touchStartX;
                    const dy = e.touches[0].clientY - touchStartY;

                    if (!panActive && Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
                    panActive = true;
                    e.preventDefault();

                    const vpt = fabricCanvas.viewportTransform;
                    const bounds = fabricCanvas.getBounds();

                    vpt[4] += dx;
                    vpt[5] += dy;
                    vpt[4] = Math.max(bounds.minX, Math.min(bounds.maxX, vpt[4]));
                    vpt[5] = Math.max(bounds.minY, Math.min(bounds.maxY, vpt[5]));

                    fabricCanvas.requestRenderAll();
                    touchStartX = e.touches[0].clientX;
                    touchStartY = e.touches[0].clientY;
                }, { passive: false });

                canvasEl.addEventListener('touchend', () => {
                    panActive = false;
                    touchStartedOnObject = false;
                }, { passive: true });
            })();

            // Anti-Browser Zoom Hack: Strictly prevent browser-level zooming/scrolling
            fabricCanvas.upperCanvasEl.addEventListener('wheel', (e) => {
                if (e.ctrlKey || Math.abs(e.deltaX) > 0 || Math.abs(e.deltaY) > 0) {
                    e.preventDefault();
                }
            }, { passive: false });

            // Boundary Helper (Matches PDF Mode)
            fabricCanvas.getBounds = function () {
                const vWidth = fabricCanvas.getWidth();
                const vHeight = fabricCanvas.getHeight();
                const zoom = fabricCanvas.getZoom();
                const cWidth = (fabricCanvas.docWidth || 0) * zoom;
                const cHeight = (fabricCanvas.docHeight || 0) * zoom;

                let minX, maxX, minY, maxY;

                if (cWidth <= vWidth) {
                    minX = maxX = (vWidth - cWidth) / 2;
                } else {
                    minX = vWidth - cWidth - 20;
                    maxX = 20;
                }

                if (cHeight <= vHeight) {
                    minY = maxY = (vHeight - cHeight) / 2;
                } else {
                    minY = vHeight - cHeight - 40;
                    maxY = 20;
                }

                return { minX, minY, maxX, maxY };
            };

            // Global Performance Defaults & Style Overrides
            fabric.Object.prototype.objectCaching = true;
            fabric.Object.prototype.noScaleCache = false;
            // Modern Handle Styles (Circle instead of Square)
            fabric.Object.prototype.transparentCorners = true;
            fabric.Object.prototype.cornerColor = 'rgba(255,255,255,0.01)'; // Hide default handle background
            fabric.Object.prototype.cornerStrokeColor = '#3b82f6';
            fabric.Object.prototype.borderColor = '#3b82f6';
            fabric.Object.prototype.cornerSize = 10;
            fabric.Object.prototype.padding = 6;
            fabric.Object.prototype.cornerStyle = 'circle';
            fabric.Object.prototype.borderDashArray = [5, 5];

            // Add Custom Rotation Icon (mtr: Modify Top Rotation)
            const rotateIcon = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%233b82f6' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8'/%3E%3Cpolyline points='21 3 21 8 16 8'/%3E%3C/svg%3E";
            const rotateImg = new Image();
            rotateImg.src = rotateIcon;

            fabric.Object.prototype.controls.mtr.render = function (ctx, left, top, styleOverride, fabricObject) {
                const size = 20; // Explicit icon size
                ctx.save();
                ctx.translate(left, top);
                ctx.rotate(fabric.util.degreesToRadians(fabricObject.angle));
                ctx.drawImage(rotateImg, -size / 2, -size / 2, size, size);
                ctx.restore();
            };
            fabric.Object.prototype.controls.mtr.withConnection = true;
            fabric.Object.prototype.controls.mtr.offsetY = -25;
            fabric.Object.prototype.controls.mtr.cursorStyle = 'grab';

            // ==========================================
            // MOUSE ZOOM & PAN (Responsive & Immediate)
            // ==========================================
            fabricCanvas.on('mouse:wheel', function (opt) {
                const delta = opt.e.deltaY;
                const vpt = fabricCanvas.viewportTransform;

                if (opt.e.ctrlKey) {
                    const zoomDelta = -delta * 0.009;
                    let zoom = fabricCanvas.getZoom();
                    zoom = zoom * (1 + zoomDelta);

                    if (zoom > 2.5) zoom = 2.5;
                    if (zoom < 0.8) zoom = 0.8;

                    const zoomPoint = { x: opt.e.offsetX, y: opt.e.offsetY };
                    fabricCanvas.zoomToPoint(zoomPoint, zoom);
                    fabricCanvas.requestRenderAll();
                } else {
                    vpt[4] -= opt.e.deltaX;
                    vpt[5] -= delta;
                }

                // Clamp Immediately
                const bounds = fabricCanvas.getBounds();
                vpt[4] = Math.max(bounds.minX, Math.min(bounds.maxX, vpt[4]));
                vpt[5] = Math.max(bounds.minY, Math.min(bounds.maxY, vpt[5]));

                fabricCanvas.requestRenderAll();
                opt.e.preventDefault();
                opt.e.stopPropagation();
            });

            // ==========================================
            // SHAPE DRAWING ENGINE (Drag-to-Create)
            // ==========================================

            // 1. Mouse Down: Start Drawing
            fabricCanvas.on('mouse:down', function (opt) {
                // --- Multi-Finger Protection ---
                if (opt.e && opt.e.touches && opt.e.touches.length > 1) {
                    return; // Ignore start if multi-touch
                }
                const evt = opt.e;

                // --- Double-Tap Detection ---
                const now = Date.now();
                lastPlayerTap = now;

                // If Shape Mode is Active
                if (activeShapeType) {
                    isDrawingShape = true;
                    shapeStartPoint = fabricCanvas.getPointer(evt);

                    // Create the "Ghost" Shape with Outline only (No Fill)
                    const fill = 'transparent';
                    const stroke = currentShapeColor;
                    const strokeWidth = currentShapeStrokeWidth;

                    if (activeShapeType === 'rect') {
                        drawingObject = new fabric.Rect({
                            left: shapeStartPoint.x,
                            top: shapeStartPoint.y,
                            originX: 'left',
                            originY: 'top',
                            width: 0,
                            height: 0,
                            fill: fill,
                            stroke: stroke,
                            strokeWidth: strokeWidth,
                            selectable: false // Lock while drawing
                        });
                    } else if (activeShapeType === 'circle') {
                        drawingObject = new fabric.Circle({
                            left: shapeStartPoint.x,
                            top: shapeStartPoint.y,
                            originX: 'left',
                            originY: 'top',
                            radius: 0,
                            fill: fill,
                            stroke: stroke,
                            strokeWidth: strokeWidth,
                            selectable: false
                        });
                    } else if (activeShapeType === 'line' || activeShapeType === 'arrow') {
                        drawingObject = new fabric.Line([shapeStartPoint.x, shapeStartPoint.y, shapeStartPoint.x, shapeStartPoint.y], {
                            fill: fill,
                            stroke: stroke,
                            strokeWidth: currentShapeStrokeWidth,
                            selectable: false,
                            originX: 'center',
                            originY: 'center'
                        });

                        // For arrow, we might use a Path, but for ghosting a line is easier initially
                        if (activeShapeType === 'arrow') {
                            // We will replace this with a proper arrow path on mouse up or sophisticated update on move
                            // For MVP ghosting, line is fine
                        }
                    }

                    if (drawingObject) {
                        fabricCanvas.add(drawingObject);
                    }
                }
                // Regular Pan Logic â€” only activate AFTER actual movement (prevents tap-disappear bug)
                else if (evt.altKey || evt.button === 1) {
                    // Store pointer; pan only kicks in if mouse/touch actually moves (see mouse:move)
                    isDragging = false; // Don't set true yet â€” wait for movement
                    lastPosX = evt.clientX;
                    lastPosY = evt.clientY;
                    fabricCanvas._panPending = true; // Flag: ready to pan if moved
                    fabricCanvas.selection = false;
                }
            });

            // 2. Mouse Move: Resize Drawing
            fabricCanvas.on('mouse:move', function (opt) {
                if (isDrawingShape && drawingObject) {
                    const pointer = fabricCanvas.getPointer(opt.e);

                    if (activeShapeType === 'rect') {
                        let w = Math.abs(pointer.x - shapeStartPoint.x);
                        let h = Math.abs(pointer.y - shapeStartPoint.y);

                        if (opt.e.shiftKey) { w = h = Math.max(w, h); } // Lock Aspect Ratio

                        // Handle drawing backwards
                        if (pointer.x < shapeStartPoint.x) drawingObject.set({ originX: 'right' });
                        else drawingObject.set({ originX: 'left' });

                        if (pointer.y < shapeStartPoint.y) drawingObject.set({ originY: 'bottom' });
                        else drawingObject.set({ originY: 'top' });

                        drawingObject.set({ width: w, height: h });

                    } else if (activeShapeType === 'circle') {
                        let dx = Math.abs(pointer.x - shapeStartPoint.x);
                        let dy = Math.abs(pointer.y - shapeStartPoint.y);
                        let radius = Math.sqrt(dx * dx + dy * dy) / 2; // Radius based on distance

                        if (opt.e.shiftKey) { radius = Math.max(dx, dy) / 2; }

                        drawingObject.set({ radius: radius });
                        // Re-center logic for circle drag could be improved, but top-left anchoring is standard for simple tools
                        // Or we can center it:
                        drawingObject.set({
                            left: (shapeStartPoint.x + pointer.x) / 2,
                            top: (shapeStartPoint.y + pointer.y) / 2,
                            originX: 'center',
                            originY: 'center'
                        });

                    } else if (activeShapeType === 'line') {
                        drawingObject.set({ x2: pointer.x, y2: pointer.y });
                    } else if (activeShapeType === 'arrow') {
                        // Dynamic Arrow Rendering
                        // Remove old line if we are drawing complex path
                        fabricCanvas.remove(drawingObject);

                        const headLength = 20;
                        const angle = Math.atan2(pointer.y - shapeStartPoint.y, pointer.x - shapeStartPoint.x);

                        // Arrow Head coordinates
                        const x2 = pointer.x - headLength * Math.cos(angle - Math.PI / 6);
                        const y2 = pointer.y - headLength * Math.sin(angle - Math.PI / 6);
                        const x3 = pointer.x - headLength * Math.cos(angle + Math.PI / 6);
                        const y3 = pointer.y - headLength * Math.sin(angle + Math.PI / 6);

                        const pathStr = `M ${shapeStartPoint.x} ${shapeStartPoint.y} L ${pointer.x} ${pointer.y} M ${pointer.x} ${pointer.y} L ${x2} ${y2} M ${pointer.x} ${pointer.y} L ${x3} ${y3}`;

                        drawingObject = new fabric.Path(pathStr, {
                            fill: 'transparent',
                            stroke: currentShapeColor,
                            strokeWidth: currentShapeStrokeWidth,
                            strokeLineCap: 'round',
                            selectable: false
                        });
                        fabricCanvas.add(drawingObject);
                    }

                    fabricCanvas.requestRenderAll();
                }
                else if (isDragging || fabricCanvas._panPending) {
                    const e = opt.e;
                    const dx = e.clientX - lastPosX;
                    const dy = e.clientY - lastPosY;

                    // Only activate panning after 4px movement (prevents blank-on-tap)
                    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
                        isDragging = true;
                        fabricCanvas._panPending = false;

                        const vpt = fabricCanvas.viewportTransform;
                        const bounds = fabricCanvas.getBounds();

                        vpt[4] += dx;
                        vpt[5] += dy;

                        // Clamp
                        vpt[4] = Math.max(bounds.minX, Math.min(bounds.maxX, vpt[4]));
                        vpt[5] = Math.max(bounds.minY, Math.min(bounds.maxY, vpt[5]));

                        fabricCanvas.requestRenderAll();
                    }
                    lastPosX = e.clientX;
                    lastPosY = e.clientY;
                }
            });

            // 3. Mouse Up: Finalize
            fabricCanvas.on('mouse:up', function (opt) {
                if (isDrawingShape) {
                    isDrawingShape = false;
                    if (drawingObject) {
                        drawingObject.setCoords();
                        drawingObject.selectable = true;
                        drawingObject.evented = true;
                        drawingObject.lockMovementX = false;
                        drawingObject.lockMovementY = false;
                        drawingObject.hasControls = true;
                        drawingObject.hasBorders = true;

                        // Switch to select mode so the new shape can immediately be moved
                        activeShapeType = null;
                        editorTool = 'select';
                        fabricCanvas.selection = true;
                        fabricCanvas.defaultCursor = 'default';
                        fabricCanvas.hoverCursor = 'move';
                        // Re-enable all objects as selectable
                        fabricCanvas.forEachObject(o => {
                            if (!o.isPdfBackground && !o.isEraserCursor && o.name !== 'crop-overlay') {
                                o.selectable = true;
                                o.evented = true;
                            }
                        });
                        document.querySelectorAll('#editor-toolbar button[id^="tool-"]').forEach(b => {
                            b.classList.remove('text-white', 'bg-white/10');
                            b.classList.add('text-gray-400');
                        });

                        // Select the newly drawn object so user can immediately reposition it
                        fabricCanvas.setActiveObject(drawingObject);

                        saveHistory();
                    }
                    drawingObject = null;
                } else if (isDragging || fabricCanvas._panPending) {
                    if (isDragging) fabricCanvas.setViewportTransform(fabricCanvas.viewportTransform);
                    isDragging = false;
                    fabricCanvas._panPending = false;
                    fabricCanvas.selection = true;
                    fabricCanvas.requestRenderAll();
                }
            });

            // Track object-moving state so touch-pan can yield
            fabricCanvas.on('object:moving', () => { fabricCanvas._isCurrentlyMoving = true; });
            fabricCanvas.on('mouse:up', () => { fabricCanvas._isCurrentlyMoving = false; });

            // ... (Touch gesture logic stays same) ...

            // 2. TOUCH GESTURES (Mobile Zoom & Slide) - OPTIMIZED
            const canvasEl = fabricCanvas.upperCanvasEl;
            let touchStartDist = 0;
            let touchStartPoint = { x: 0, y: 0 };
            let isGesturing = false;
            let wasDrawing = false;
            let ticking = false; // For RequestAnimationFrame throttling

            // Touch Start: Initialize Gesture
            canvasEl.addEventListener('touchstart', function (e) {
                if (e.touches.length === 2) {
                    e.preventDefault(); // Stop browser zoom
                    isGesturing = true;

                    // Temporarily disable drawing/erasing if active
                    if (fabricCanvas.isDrawingMode) {
                        wasDrawing = true;
                        fabricCanvas.isDrawingMode = false;
                    }
                    isEraserActive = false;
                    
                    if (eraserCursorObject) {
                        eraserCursorObject.set({ visible: false });
                        fabricCanvas.requestRenderAll();
                    }
                    
                    if (isDrawingShape) {
                        isDrawingShape = false;
                        if (drawingObject) {
                            fabricCanvas.remove(drawingObject);
                            drawingObject = null;
                            fabricCanvas.requestRenderAll();
                        }
                    }

                    const t1 = e.touches[0];
                    const t2 = e.touches[1];

                    // Initial Distance for Zoom
                    touchStartDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);

                    // Initial Center for Pan
                    touchStartPoint = {
                        x: (t1.clientX + t2.clientX) / 2,
                        y: (t1.clientY + t2.clientY) / 2
                    };
                }
            }, { passive: false });

            // Touch Move: Apply Zoom & Slide (Throttled)
            canvasEl.addEventListener('touchmove', function (e) {
                if (e.touches.length === 1) {
                    e.preventDefault(); // Absolutely block native 1-finger scroll
                } else if (e.touches.length === 2 && isGesturing) {
                    e.preventDefault();

                    if (!ticking) {
                        window.requestAnimationFrame(() => {
                            performGesture(e);
                            ticking = false;
                        });
                        ticking = true;
                    }
                }
            }, { passive: false });

            function performGesture(e) {
                if (e.touches.length < 2) return;

                const t1 = e.touches[0];
                const t2 = e.touches[1];
                const rect = canvasEl.getBoundingClientRect();
                const currentDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
                const curX = (t1.clientX + t2.clientX) / 2;
                const curY = (t1.clientY + t2.clientY) / 2;

                const vpt = fabricCanvas.viewportTransform;
                const bounds = fabricCanvas.getBounds();

                // A. ZOOM Logic (Pinch)
                if (touchStartDist > 0 && Math.abs(currentDist - touchStartDist) > 1) {
                    const deltaScale = currentDist / touchStartDist;
                    const zoomPoint = new fabric.Point(curX - rect.left, curY - rect.top);
                    fabricCanvas.zoomToPoint(zoomPoint, Math.min(Math.max(fabricCanvas.getZoom() * deltaScale, 0.8), 2.5));
                }

                // B. SLIDE Logic (Pan with Rubber Band)
                const dx = curX - touchStartPoint.x;
                const dy = curY - touchStartPoint.y;

                vpt[4] = applyRubberBand(vpt[4] + dx, bounds.minX, bounds.maxX);
                vpt[5] = applyRubberBand(vpt[5] + dy, bounds.minY, bounds.maxY);

                fabricCanvas.requestRenderAll();

                touchStartDist = currentDist;
                touchStartPoint = { x: curX, y: curY };
            }

            // Touch End: Snap back to bounds
            canvasEl.addEventListener('touchend', function (e) {
                if (e.touches.length < 2) {
                    isGesturing = false;
                    const vpt = fabricCanvas.viewportTransform;
                    const bounds = fabricCanvas.getBounds();

                    // Snap back logic
                    vpt[4] = Math.max(bounds.minX, Math.min(bounds.maxX, vpt[4]));
                    vpt[5] = Math.max(bounds.minY, Math.min(bounds.maxY, vpt[5]));
                    fabricCanvas.requestRenderAll();

                    if (wasDrawing) {
                        fabricCanvas.isDrawingMode = true;
                        wasDrawing = false;
                    }
                }
            });
        }

        let isSyncing = false;
        let isRestoringHistory = false; // CRITICAL: Prevents loadFromJSON from triggering saveHistory
        let lastSyncedPdf = null;

        function saveHistory() {
            if (isSyncing || isRestoringHistory) return;
            // Serialize ONLY annotation objects (backgrounds excluded via excludeFromExport)
            const annots = fabricCanvas.getObjects().filter(o =>
                !o.isPdfBackground && !o.isEraserCursor && o.name !== 'crop-overlay'
            );
            const state = JSON.stringify(annots.map(o => o.toObject()));
            if (editorHistory.length > 0 && editorHistory[editorHistory.length - 1] === state) return;
            editorHistory.push(state);
            redoStack = [];
        }

        // Core restore: removes ONLY annotations and re-creates from snapshot.
        // PDF background images are NEVER touched â€” they cannot disappear.
        function _restoreAnnotations(stateJson) {
            isRestoringHistory = true;

            // 1. Remove ONLY annotation objects (keep backgrounds, cursors, overlays)
            const toRemove = fabricCanvas.getObjects().filter(o =>
                !o.isPdfBackground && !o.isEraserCursor && o.name !== 'crop-overlay' &&
                !(o.type === 'image' && o.lockMovementX && o.lockMovementY && o.lockScalingX)
            );
            toRemove.forEach(o => fabricCanvas.remove(o));

            // 2. Re-create annotation objects from saved JSON
            const objectsData = JSON.parse(stateJson);
            if (!objectsData || objectsData.length === 0) {
                fabricCanvas.requestRenderAll();
                isRestoringHistory = false;
                return;
            }

            fabric.util.enlivenObjects(objectsData, (enlivened) => {
                enlivened.forEach(obj => fabricCanvas.add(obj));
                fabricCanvas.requestRenderAll();
                isRestoringHistory = false;
            });
        }

        function undoEditor() {
            if (isRestoringHistory) return; // Prevent rapid-click overlap
            if (editorHistory.length <= 1) return;
            const current = editorHistory.pop();
            redoStack.push(current);
            _restoreAnnotations(editorHistory[editorHistory.length - 1]);
        }

        function redoEditor() {
            if (isRestoringHistory) return; // Prevent rapid-click overlap
            if (redoStack.length === 0) return;
            const target = redoStack.pop();
            editorHistory.push(target);
            _restoreAnnotations(target);
        }

        async function syncPdfToEditor() {
            if (!pdfDoc || isSyncing) {
                if (!pdfDoc) {
                    showToast('No PDF loaded. Cannot open editor.');
                    switchMode('pdf');
                }
                return;
            }
            if (!fabricCanvas) initEditor();
            if (!fabricCanvas) {
                showToast('Editor failed to initialize. Please try again.');
                return;
            }

            // Fix: Prevent wiping annotations if returning to the same PDF
            if (lastSyncedPdf === pdfDoc) {
                const workspace = document.getElementById('editor-workspace');
                if (workspace && fabricCanvas) {
                    fabricCanvas.setDimensions({
                        width: workspace.clientWidth || window.innerWidth,
                        height: workspace.clientHeight || window.innerHeight
                    });
                }
                fabricCanvas.requestRenderAll();
                return;
            }

            isSyncing = true;

            const workspace = document.getElementById('editor-workspace');
            if (!workspace) { isSyncing = false; return; }

            // Wait for flex layout to apply if width is 0
            if (workspace.clientWidth === 0) {
                await new Promise(r => setTimeout(r, 150));
            }

            // 1. Dynamic Resolution Scaling (Fixes Mobile Not Opening / OOM)
            // Desktop: 3.5x (Crystal Clear), Mobile: 2.0x (Sharp & Memory Safe)
            const qualityMultiplier = (window.innerWidth < 1024) ? 2.0 : 3.5;
            console.log(`CrystalSync: Using ${qualityMultiplier}x multiplier for current device.`);

            // Force initial dimensions immediately so the canvas is never 0x0
            fabricCanvas.setDimensions({
                width: workspace.clientWidth || window.innerWidth,
                height: workspace.clientHeight || window.innerHeight
            });

            fabricCanvas.clear();
            fabricCanvas.backgroundColor = '#1e1e1e';

            // Reset stacks to fresh state for the new PDF
            editorHistory = [];
            redoStack = [];

            let totalHeight = 0;
            let maxWidth = 0;
            let pagesLoaded = 0;

            try {
                // Determine scale once
                const firstPage = await pdfDoc.getPage(1);
                const baseViewport = firstPage.getViewport({ scale: 1.0 });
                const containerWidth = Math.max(workspace.clientWidth, 320); // 100% width
                const fitScale = containerWidth / baseViewport.width;

                // 2. Sequential "Smart-Loading" (Prevents Blank Screen/Crash)
                for (let i = 1; i <= pdfDoc.numPages; i++) {
                    const page = await pdfDoc.getPage(i);
                    const highResViewport = page.getViewport({ scale: fitScale * qualityMultiplier });

                    const tempCanvas = document.createElement('canvas');
                    tempCanvas.width = highResViewport.width;
                    tempCanvas.height = highResViewport.height;
                    const ctx = tempCanvas.getContext('2d'); // Removed alpha: false to prevent WebView hardware bugs

                    // Fill with white before rendering the PDF,
                    // otherwise black text renders on a transparent background and becomes invisible if saved to JPEG.
                    ctx.fillStyle = "#ffffff";
                    ctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);

                    await page.render({ canvasContext: ctx, viewport: highResViewport }).promise;

                    // Fix 1B: Convert canvas to JPEG string to prevent mobile browsers from clearing the memory
                    const pageDataUrl = tempCanvas.toDataURL('image/jpeg', 0.90);

                    // Fix 1C: Load the image safely into Fabric using an async Promise with timeout and null check
                    const img = await new Promise((resolve, reject) => {
                        const timeout = setTimeout(() => {
                            reject(new Error("Image decoding timed out. Device memory limit exceeded."));
                        }, 5000); // 5 seconds max per page
                        
                        fabric.Image.fromURL(pageDataUrl, function(fabricImg) {
                            clearTimeout(timeout);
                            if (!fabricImg) {
                                reject(new Error("Failed to decode PDF page into image memory."));
                            } else {
                                resolve(fabricImg);
                            }
                        });
                    });

                    img.set({
                        left: 0,
                        top: totalHeight,
                        selectable: false,
                        evented: true, // CRITICAL: Must be true so taps register a target
                        scaleX: 1 / qualityMultiplier,
                        scaleY: 1 / qualityMultiplier,
                        objectCaching: true,
                        hasBorders: false,
                        hasControls: false,
                        lockMovementX: true,
                        lockMovementY: true,
                        lockRotation: true,
                        lockScalingX: true,
                        lockScalingY: true,
                        isPdfBackground: true,
                        excludeFromExport: true,
                        hoverCursor: 'default'
                    });

                    fabricCanvas.add(img);
                    fabricCanvas.sendToBack(img);
                    // Fabric.js requires the underlying `canvas` to persist for rendering.
                    // DO NOT zero out the width/height here; it causes blank pages in edit mode.

                    const pageHeight = highResViewport.height / qualityMultiplier;
                    totalHeight += pageHeight + 40; // 40px Gap between pages
                    maxWidth = Math.max(maxWidth, (highResViewport.width / qualityMultiplier));
                    pagesLoaded++;

                    // Small pause every 2 pages on mobile to clear garbage collection
                    if (window.innerWidth < 768 && i % 2 === 0) {
                        await new Promise(r => setTimeout(r, 100));
                        fabricCanvas.requestRenderAll();
                    }
                }

                // 3. Robust Viewport Lock (Fixes Disappearing on Tap)
                fabricCanvas.docWidth = maxWidth;
                fabricCanvas.docHeight = totalHeight;

                // Fix 3: Ensure canvas covers workspace with a safe window fallback
                fabricCanvas.setDimensions({
                    width: workspace.clientWidth || window.innerWidth,
                    height: workspace.clientHeight || window.innerHeight
                });

                // Center the document properly
                fabricCanvas.setViewportTransform([1, 0, 0, 1, 0, 0]); // Reset
                const zoom = fabricCanvas.getZoom();
                const offsetX = Math.max((fabricCanvas.width - (maxWidth * zoom)) / 2, 0);

                fabricCanvas.viewportTransform[4] = offsetX;
                fabricCanvas.viewportTransform[5] = 0;

                fabricCanvas.calcOffset();
                fabricCanvas.requestRenderAll();
                
                lastSyncedPdf = pdfDoc; // Mark this PDF as successfully synced

            } catch (err) {
                console.error("CrystalSync Error:", err);
                if (pagesLoaded === 0) {
                    // No pages loaded at all — this is a critical failure
                    alert("Critical Error loading Editor: " + (err.message || 'Unknown error. Device memory might be full.'));
                } else {
                    // Partial load — some pages rendered successfully
                    showToast(`Loaded ${pagesLoaded}/${pdfDoc.numPages} pages. Some pages may be missing.`);
                    // Still set dimensions for partial content
                    if (fabricCanvas && maxWidth > 0) {
                        fabricCanvas.docWidth = maxWidth;
                        fabricCanvas.docHeight = totalHeight;
                        fabricCanvas.setDimensions({
                            width: workspace.clientWidth,
                            height: workspace.clientHeight
                        });
                        fabricCanvas.requestRenderAll();
                    }
                }
            } finally {
                isSyncing = false;
                // CRITICAL BASELINE: Store empty annotations array as floor state.
                // Undo can never go below this. Backgrounds are NEVER stored in history.
                editorHistory = [JSON.stringify([])]; // Empty annotations = clean PDF state
                redoStack = [];
                isRestoringHistory = false;
            }
        }

        // C-2: Removed stub saveEditorChanges — real implementation is below

        function runOCRAtSplit() {
            promptOCRChoice();
        }

        let selectedPages = [];
        let ocrAborted = false;

        function promptOCRChoice() {
            if (!pdfDoc && currentMode !== 'edit') {
                return alert("Please upload a PDF first.");
            }
            document.getElementById('ocr-choice-modal').classList.remove('hidden');
        }

        function closeOCRChoice() {
            document.getElementById('ocr-choice-modal').classList.add('hidden');
        }

        async function showPageSelector() {
            closeOCRChoice();
            const picker = document.getElementById('ocr-page-picker');
            const grid = document.getElementById('page-picker-grid');
            picker.classList.remove('hidden');

            selectedPages = [];
            updatePageSelectionUI();

            if (!pdfDoc) {
                grid.innerHTML = '<div class="col-span-full text-center text-gray-400 py-20 font-bold">No multi-page document found.</div>';
                return;
            }

            grid.innerHTML = "";
            for (let i = 1; i <= pdfDoc.numPages; i++) {
                const item = document.createElement('div');
                item.className = "group relative flex flex-col items-center gap-3 cursor-pointer select-none";

                // Optimized Long Press Support
                let pressTimer;
                let wasPreviewed = false;

                const startPress = (e) => {
                    wasPreviewed = false;
                    clearTimeout(pressTimer);
                    pressTimer = setTimeout(() => {
                        wasPreviewed = true;
                        showPagePreview(i);
                    }, 600);
                };

                const cancelPress = () => {
                    clearTimeout(pressTimer);
                };

                item.addEventListener('mousedown', startPress);
                item.addEventListener('touchstart', (e) => {
                    startPress(e);
                });

                item.addEventListener('mouseup', () => {
                    cancelPress();
                    if (wasPreviewed) {
                        closePagePreview();
                    }
                });
                item.addEventListener('touchend', () => {
                    cancelPress();
                    if (wasPreviewed) {
                        closePagePreview();
                    }
                });
                item.addEventListener('mouseleave', cancelPress);

                item.onclick = (e) => {
                    if (!wasPreviewed) {
                        togglePageSelection(i);
                    }
                };

                item.innerHTML = `
<div id="page-thumb-${i}" class="w-full aspect-[3/4] bg-white border-2 border-gray-100 rounded-3xl flex items-center justify-center overflow-hidden relative shadow-sm transition-all group-hover:border-indigo-400 group-hover:shadow-lg">
<canvas id="thumb-canvas-${i}" class="w-full h-full object-cover"></canvas>
<div class="absolute inset-0 bg-black/0 group-active:bg-black/5 transition-colors"></div>
<div class="absolute top-3 right-3 w-6 h-6 rounded-full bg-white border border-gray-200 flex items-center justify-center transition-all opacity-0 scale-50 check-icon shadow-sm">
<i class="fas fa-check text-indigo-600 text-[10px]"></i>
</div>
</div>
<span class="text-[10px] font-black uppercase tracking-widest text-gray-400 group-hover:text-indigo-600 transition-colors">Page ${i}</span>
`;
                grid.appendChild(item);
            }

            // Parallel Thumbnail Rendering
            const renderPromises = [];
            for (let i = 1; i <= pdfDoc.numPages; i++) {
                renderPromises.push((async () => {
                    const page = await pdfDoc.getPage(i);
                    const canvas = document.getElementById(`thumb-canvas-${i}`);
                    if (canvas) {
                        const viewport = page.getViewport({ scale: 0.3 });
                        canvas.width = viewport.width;
                        canvas.height = viewport.height;
                        await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
                    }
                })());
            }
            await Promise.all(renderPromises);
        }

        async function showPagePreview(pageNum) {
            const modal = document.getElementById('ocr-page-preview-modal');
            const img = document.getElementById('page-preview-img');
            const label = document.getElementById('preview-page-label');

            label.innerText = `Page ${pageNum}`;
            modal.classList.remove('hidden');

            // High Quality Render for Preview
            const page = await pdfDoc.getPage(pageNum);
            const viewport = page.getViewport({ scale: 1.5 });
            const canvas = document.createElement('canvas');
            canvas.width = viewport.width; canvas.height = viewport.height;
            await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;

            img.src = canvas.toDataURL();
        }

        function closePagePreview() {
            document.getElementById('ocr-page-preview-modal').classList.add('hidden');
        }

        function togglePageSelection(page) {
            const idx = selectedPages.indexOf(page);
            if (idx === -1) selectedPages.push(page);
            else selectedPages.splice(idx, 1);
            updatePageSelectionUI();
        }

        function updatePageSelectionUI() {
            document.querySelectorAll('[id^="page-thumb-"]').forEach(el => {
                el.classList.remove('border-indigo-600', 'bg-indigo-50/50', 'ring-4', 'ring-indigo-100');
                el.querySelector('.check-icon').classList.add('opacity-0', 'scale-50');
            });

            selectedPages.forEach(page => {
                const el = document.getElementById(`page-thumb-${page}`);
                if (el) {
                    el.classList.add('border-indigo-600', 'bg-indigo-50/50', 'ring-4', 'ring-indigo-100');
                    el.querySelector('.check-icon').classList.remove('opacity-0', 'scale-50');
                }
            });

            document.getElementById('selected-page-count').innerText = selectedPages.length;
            document.getElementById('start-ocr-btn').disabled = selectedPages.length === 0;
        }

        function selectAllPages() {
            if (!pdfDoc) return;
            if (selectedPages.length === pdfDoc.numPages) {
                selectedPages = [];
            } else {
                selectedPages = [];
                for (let i = 1; i <= pdfDoc.numPages; i++) selectedPages.push(i);
            }
            updatePageSelectionUI();
        }

        function closePagePicker() {
            document.getElementById('ocr-page-picker').classList.add('hidden');
        }

        function startFullOCR() {
            closeOCRChoice();
            // Prioritize Full PDF OCR if document is available
            if (pdfDoc) {
                const pages = [];
                for (let i = 1; i <= pdfDoc.numPages; i++) pages.push(i);
                performOCR(pages);
            } else if (currentMode === 'edit') {
                // Fallback to Editor Canvas if no PDF is loaded
                performOCR([null]);
            }
        }

        function startSelectedOCR() {
            closePagePicker();
            performOCR(selectedPages);
        }

        function cancelOCR() {
            ocrAborted = true;
            hideOCRLoading();
        }

        function showOCRLoading(text = "Initializing...") {
            const toolbarStatus = document.getElementById('ocr-status-container');
            if (toolbarStatus) {
                toolbarStatus.classList.remove('opacity-0', 'pointer-events-none');
            }
            updateOCRProgress(0);
        }

        function hideOCRLoading() {
            const toolbarStatus = document.getElementById('ocr-status-container');
            if (toolbarStatus) {
                toolbarStatus.classList.add('opacity-0', 'pointer-events-none');
            }

            const overlay = document.getElementById('ocr-loading-overlay');
            if (overlay) {
                overlay.classList.add('opacity-0');
                setTimeout(() => {
                    overlay.classList.add('hidden');
                    overlay.classList.remove('flex', 'opacity-0');
                }, 300);
            }
        }

        function updateOCRProgress(percent) {
            // Update Toolbar Indicator
            const tbCircle = document.getElementById('ocr-toolbar-progress-circle');
            const tbText = document.getElementById('ocr-toolbar-perc');
            if (tbCircle) {
                const radius = 40;
                const circumference = 2 * Math.PI * radius;
                const offset = circumference - (percent / 100 * circumference);
                tbCircle.style.strokeDashoffset = offset;
            }
            if (tbText) tbText.innerText = `${Math.round(percent)}%`;

            // Keep support for legacy/other indicators if they exist
            const circle = document.getElementById('ocr-progress-circle');
            const percText = document.getElementById('ocr-percentage');
            if (circle) {
                const radius = 40;
                const circumference = 2 * Math.PI * radius;
                const offset = circumference - (percent / 100 * circumference);
                circle.style.strokeDashoffset = offset;
            }
            if (percText) percText.innerText = `${Math.round(percent)}%`;
        }

        async function performOCR(pages) {
            ocrAborted = false;
            showOCRLoading("Preparing Pages...");
            let combinedText = "";

            try {
                for (let i = 0; i < pages.length; i++) {
                    if (ocrAborted) break;
                    const pageNum = pages[i];
                    const displayNum = pageNum || "Edit Canvas";

                    let source;
                    if (pageNum === null) {
                        source = fabricCanvas.toDataURL({ format: 'png', multiplier: 2 });
                    } else {
                        const page = await pdfDoc.getPage(pageNum);
                        const viewport = page.getViewport({ scale: 2.0 });
                        const canvas = document.createElement('canvas');
                        canvas.width = viewport.width; canvas.height = viewport.height;
                        await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
                        source = canvas;
                    }

                    const result = await Tesseract.recognize(source, 'eng', {
                        workerPath: 'assets/tesseract/worker.min.js',
                        corePath: 'assets/tesseract/tesseract-core.wasm.js',
                        logger: m => {
                            if (m.status === 'recognizing text') {
                                const p = Math.round(m.progress * 100);
                                const overallP = ((i * 100) + p) / pages.length;
                                updateOCRProgress(overallP);
                                document.getElementById('ocr-progress-text').innerText = `Reconstructing Layout: Page ${i + 1}/${pages.length}`;
                            }
                        }
                    });

                    // Construct Positional HTML for this page
                    const pageLayout = document.createElement('div');
                    pageLayout.className = "ocr-page-layout mb-10 relative bg-white shadow-sm border border-gray-100 rounded-lg overflow-hidden";

                    // Determine dimensions based on source
                    let sW, sH;
                    if (source instanceof HTMLCanvasElement) {
                        sW = source.width / 2; sH = source.height / 2; // Scale back to 1.0 for UI display
                    } else {
                        sW = 800; sH = 1100; // Fallback
                    }

                    pageLayout.style.width = `${sW}px`;
                    pageLayout.style.height = `${sH}px`;
                    pageLayout.style.margin = "0 auto 2rem auto";

                    const pageLabel = document.createElement('div');
                    pageLabel.className = "absolute top-2 left-2 px-3 py-1 bg-black/5 rounded font-black text-[9px] uppercase tracking-widest text-gray-400 z-10 pointer-events-none";
                    pageLabel.innerText = `OCR Page ${displayNum}`;
                    pageLayout.appendChild(pageLabel);

                    result.data.words.forEach(word => {
                        const span = document.createElement('span');
                        span.innerText = word.text;
                        span.className = "absolute whitespace-nowrap leading-none transition-colors hover:bg-indigo-50 hover:text-indigo-600 cursor-default";

                        // Map 2.0x source scale to 1.0x UI scale
                        const box = word.bbox;
                        const scale = 0.5;
                        const l = box.x0 * scale;
                        const t = box.y0 * scale;
                        const w = (box.x1 - box.x0) * scale;
                        const h = (box.y1 - box.y0) * scale;

                        span.style.left = `${l}px`;
                        span.style.top = `${t}px`;
                        span.style.width = `${w}px`;
                        span.style.height = `${h}px`;
                        span.style.fontSize = `${h * 0.9}px`; // Adjust font size to box height
                        span.style.fontFamily = "Outfit, sans-serif";

                        pageLayout.appendChild(span);
                    });

                    combinedText += pageLayout.outerHTML;
                }

                if (!ocrAborted) {
                    const ocrDisplay = document.getElementById('ocr-content');
                    ocrDisplay.innerHTML = ""; // Clear
                    ocrDisplay.classList.remove('font-mono', 'whitespace-pre-wrap');
                    ocrDisplay.style.padding = "40px 20px";

                    const splitDisplay = document.getElementById('split-ocr-content');
                    splitDisplay.innerHTML = ""; // Clear
                    splitDisplay.classList.remove('font-mono', 'whitespace-pre-wrap', 'p-8');
                    splitDisplay.style.padding = "0px";

                    // Re-inject for both containers
                    const containers = [ocrDisplay];
                    if (isSplitView) containers.push(splitDisplay);

                    containers.forEach(container => {
                        container.innerHTML = combinedText;

                        // Handle Scaling for each page in the container
                        const panelW = container.clientWidth;
                        const layouts = container.querySelectorAll('.ocr-page-layout');
                        layouts.forEach(l => {
                            const nativeW = parseFloat(l.style.width);
                            const scale = (panelW - 60) / nativeW; // 30px padding each side

                            l.style.transform = `scale(${scale})`;
                            l.style.transformOrigin = "top center";
                            // Adjust margin to handle scaled height overlap
                            const nativeH = parseFloat(l.style.height);
                            l.style.marginBottom = `${(nativeH * (scale - 1)) + 40}px`;
                        });
                    });

                    if (!isSplitView) {
                        document.getElementById('ocr-result-panel').classList.remove('translate-y-full');
                    }
                }
            } catch (err) {
                console.error("OCR Error:", err);
                alert("OCR Failed: " + err.message);
            } finally {
                hideOCRLoading();
            }
        }

        function runOCR() {
            promptOCRChoice();
        }

        function copySplitOCRText(e) {
            const text = document.getElementById('split-ocr-content').innerText;
            if (!text || text.includes("Scan a page")) return;
            navigator.clipboard.writeText(text);

            // Show feedback — L-6: use passed event parameter, not implicit global
            const btn = e ? e.currentTarget : null;
            if (btn) {
                const icon = btn.querySelector('i');
                if (icon) {
                    icon.className = 'fas fa-check text-green-500';
                    setTimeout(() => icon.className = 'fas fa-copy text-sm', 1500);
                }
            }
        }

        function openFullOCRModal() {
            const text = document.getElementById('split-ocr-content').innerText;
            if (text) {
                document.getElementById('ocr-content').innerText = text;
                document.getElementById('ocr-result-panel').classList.remove('translate-y-full');

                // Remove Split View immediately when maximizing as requested
                if (isSplitView) {
                    toggleSplitView();
                }
            }
        }


        function closeOCRPanel() {
            document.getElementById('ocr-result-panel').classList.add('translate-y-full');
        }

        function copyOCRText() {
            const content = document.getElementById('ocr-content');
            const text = content.innerText || content.textContent;

            if (!text || text.trim().length === 0) return;

            navigator.clipboard.writeText(text).then(() => {
                // Determine which button triggered this
                const btn = document.getElementById('btn-floating-copy');
                const originalContent = btn.innerHTML;

                btn.innerHTML = '<i class="fas fa-check"></i><span>Copied!</span>';
                btn.classList.add('bg-emerald-500');
                btn.classList.remove('bg-indigo-600');

                setTimeout(() => {
                    btn.innerHTML = originalContent;
                    btn.classList.remove('bg-emerald-500');
                    btn.classList.add('bg-indigo-600');
                }, 2000);
            }).catch(err => {
                console.error('Failed to copy text: ', err);
            });
        }

        function activateOCRResultSplitView() {
            const text = document.getElementById('ocr-content').innerText;
            if (text) {
                document.getElementById('split-ocr-content').innerText = text;
            }

            // Hide the full panel and restore Split View as requested (Silently)
            closeOCRPanel();
            if (!isSplitView) {
                toggleSplitView(true);
            }

            // Ensure we are in PDF mode to see the split view
            if (currentMode !== 'pdf') {
                switchMode('pdf');
            }
        }



        // ===================================
        // DOWNLOAD: Full PDF with Annotations
        // ===================================
        async function downloadEditedPDF() {
            if (!pdfDoc && !fabricCanvas) {
                showToast('Nothing to download.');
                return;
            }

            try {
                showToast('Preparing PDF download...');

                // Check if jsPDF is available (for true PDF output)
                const hasJsPDF = typeof window.jspdf !== 'undefined' || typeof window.jsPDF !== 'undefined';
                const jsPDFClass = (typeof window.jspdf !== 'undefined') ? window.jspdf.jsPDF : window.jsPDF;

                let base64Data, fileName, mimeType;

                if (pdfDoc && hasJsPDF) {
                    // True multi-page PDF export with annotations
                    const qualityMultiplier = (window.innerWidth < 1024) ? 2.0 : 3.5;
                    const workspace = document.getElementById('editor-workspace');
                    const containerWidth = Math.max(workspace ? workspace.clientWidth - 40 : 320, 320);

                    const firstPage = await pdfDoc.getPage(1);
                    const baseVp = firstPage.getViewport({ scale: 1.0 });
                    const fitScale = containerWidth / baseVp.width;
                    const pageWidthPt = baseVp.width;
                    const pageHeightPt = baseVp.height;

                    const pdf = new jsPDFClass({
                        orientation: pageWidthPt > pageHeightPt ? 'landscape' : 'portrait',
                        unit: 'pt',
                        format: [pageWidthPt, pageHeightPt]
                    });

                    for (let i = 1; i <= pdfDoc.numPages; i++) {
                        if (i > 1) pdf.addPage([pageWidthPt, pageHeightPt]);

                        const page = await pdfDoc.getPage(i);
                        const viewport = page.getViewport({ scale: fitScale * qualityMultiplier });

                        // Render the base PDF page
                        const pageCanvas = document.createElement('canvas');
                        pageCanvas.width = viewport.width;
                        pageCanvas.height = viewport.height;
                        const pageCtx = pageCanvas.getContext('2d', { alpha: false });
                        pageCtx.fillStyle = "#ffffff";
                        pageCtx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
                        await page.render({ canvasContext: pageCtx, viewport }).promise;

                        // Now composite annotations from the Fabric canvas for this page
                        const pageTopInFabric = (i - 1) * (pageHeightPt / qualityMultiplier * fitScale * qualityMultiplier + 40 * qualityMultiplier);
                        const ctx = pageCanvas.getContext('2d');

                        // Get all non-background annotation objects for this page's y-range
                        const pageHeightFabric = (baseVp.height * fitScale);
                        const pageTopFabric = (i - 1) * (pageHeightFabric + 40);
                        const pageBottomFabric = pageTopFabric + pageHeightFabric;

                        const annotObjects = fabricCanvas.getObjects().filter(o => {
                            if (o.isPdfBackground || o.isEraserCursor || o.name === 'crop-overlay') return false;
                            if (o.type === 'image' && o.lockMovementX) return false;
                            const objTop = o.top || 0;
                            return objTop >= pageTopFabric - 50 && objTop <= pageBottomFabric + 50;
                        });

                        if (annotObjects.length > 0) {
                            // Create a temporary canvas for annotations
                            const annotCanvas = document.createElement('canvas');
                            annotCanvas.width = viewport.width;
                            annotCanvas.height = viewport.height;
                            const annotCtx = annotCanvas.getContext('2d');
                            annotCtx.scale(qualityMultiplier, qualityMultiplier);
                            annotCtx.translate(-0, -pageTopFabric);
                            // Draw each annotation
                            // FIX BUG-10: drawObject() is a Fabric v6 private API and does NOT exist
                            // in Fabric v5. Use toDataURL on a per-object temp canvas instead.
                            annotObjects.forEach(obj => {
                                try {
                                    // Isolate each object into its own small canvas, then draw onto annotCanvas
                                    const objBound = obj.getBoundingRect(true, true);
                                    const tmpC = document.createElement('canvas');
                                    tmpC.width = Math.max(1, Math.ceil(objBound.width + 4));
                                    tmpC.height = Math.max(1, Math.ceil(objBound.height + 4));
                                    const tmpCtx = tmpC.getContext('2d');
                                    // Clone onto temp canvas centred
                                    const clonedCanvas = new fabric.StaticCanvas(null, {
                                        width: tmpC.width, height: tmpC.height
                                    });
                                    const clonedObj = fabric.util.object.clone(obj);
                                    clonedObj.set({
                                        left: tmpC.width / 2,
                                        top: tmpC.height / 2,
                                        originX: 'center',
                                        originY: 'center'
                                    });
                                    clonedCanvas.add(clonedObj);
                                    clonedCanvas.renderAll();
                                    // Draw the mini canvas onto the annotation canvas at the correct position
                                    const dstX = objBound.left - pageTopFabric * (qualityMultiplier / qualityMultiplier);
                                    const dstY = objBound.top - pageTopFabric;
                                    annotCtx.drawImage(clonedCanvas.getElement(), dstX - 2, dstY - 2);
                                    clonedCanvas.dispose();
                                } catch (e) { console.warn('Annotation render skip:', e.message); }
                            });
                            // Composite annotations on top of page canvas
                            ctx.drawImage(annotCanvas, 0, 0);
                        }

                        const pageDataUrl = pageCanvas.toDataURL('image/jpeg', 0.95);
                        pdf.addImage(pageDataUrl, 'JPEG', 0, 0, pageWidthPt, pageHeightPt);
                    }

                    fileName = `OmniReader_${new Date().getTime()}.pdf`;
                    base64Data = pdf.output('datauristring').split(',')[1];
                    mimeType = 'application/pdf';

                } else {
                    // Fallback: Export the whole Fabric canvas as high-quality PNG
                    const dataUrl = fabricCanvas.toDataURL({ format: 'png', multiplier: 3.5 });
                    base64Data = dataUrl.split(',')[1];
                    fileName = `OmniReader_${new Date().getTime()}.png`;
                    mimeType = 'image/png';
                }

                // Save to device storage
                if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Filesystem) {
                    const Filesystem = window.Capacitor.Plugins.Filesystem;
                    await Filesystem.writeFile({
                        path: `Download/${fileName}`,
                        data: base64Data,
                        directory: 'EXTERNAL_STORAGE',
                        recursive: true
                    });
                    showToast(`âœ… Saved to Downloads: ${fileName}`);
                } else {
                    // Browser fallback
                    const link = document.createElement('a');
                    link.download = fileName;
                    link.href = `data:${mimeType};base64,${base64Data}`;
                    link.click();
                }
            } catch (e) {
                console.error('Download error:', e);
                showToast('Download failed: ' + e.message);
            }
        }



        // C-1: Removed duplicate handleNativeFile — canonical version is above at L3124

        // ==========================================
        // ADVANCED EDITOR LOGIC
        // ==========================================
        const PEN_COLORS = [
            '#000000', '#ffffff', '#7f7f7f', '#c3c3c3', '#880015', '#ed1c24',
            '#ff7f27', '#fff200', '#22b14c', '#00a2e8', '#3f48cc', '#a349a4',
            '#ef4444', '#f97316', '#f59e0b', '#84cc16', '#22c55e', '#10b981',
            '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1', '#8b5cf6', '#d946ef', '#f43f5e'
        ];
        const HIGHLIGHTER_COLORS = [
            '#ffff00', '#00ff00', '#00ffff', '#ff00ff', '#ffffff', '#c0c0c0',
            '#fef08a', '#bbf7d0', '#bfdbfe', '#fbcfe8', '#fed7aa', '#e9d5ff'
        ];

        let currentPenColor = '#ed1c24'; // Classic Red default
        let currentPenSize = 3;
        let currentHighlighterColor = '#ffff00'; // Classic yellow default
        let currentHighlighterSize = 25;
        let currentEraserSize = 30; // Default eraser size
        let isEraserActive = false;
        let cropRect = null;

        let currentShapeColor = '#3b82f6'; // Default Shape Color
        let currentShapeStrokeWidth = 3;

        // Initialize Colors — compact circles
        function initColorGrids() {
            const penGrid = document.getElementById('pen-colors-grid');
            penGrid.innerHTML = PEN_COLORS.map(c => `
<button onclick="updatePenColor('${c}')" class="w-7 h-7 rounded-full border-2 border-white/10 hover:scale-110 active:scale-95 transition-transform focus:outline-none focus:ring-2 focus:ring-white shadow-md" style="background-color: ${c}"></button>
`).join('');

            const hGrid = document.getElementById('highlighter-colors-grid');
            hGrid.innerHTML = HIGHLIGHTER_COLORS.map(c => `
<button onclick="updateHighlighterColor('${c}')" class="w-7 h-7 rounded-full border-2 border-white/10 hover:scale-110 active:scale-95 transition-transform focus:outline-none focus:ring-2 focus:ring-white shadow-md" style="background-color: ${c}"></button>
`).join('');
        }

        // --- Tool Settings Panel System ---
        let _activeToolPanel = null; // tracks which panel is open: 'draw', 'highlighter', 'eraser', or null

        function closeToolSettingsPanel() {
            const panel = document.getElementById('tool-settings-panel');
            if (panel) panel.classList.add('hidden');
            document.querySelectorAll('#tool-settings-panel > div[id^=panel-]').forEach(el => el.classList.add('hidden'));
            _activeToolPanel = null;
        }

        // Legacy compat: closeAllDropdowns still used by some code paths
        function closeAllDropdowns() {
            closeToolSettingsPanel();
        }

        function toggleToolPanel(tool) {
            const panel = document.getElementById('tool-settings-panel');
            const subPanel = document.getElementById(`panel-${tool}`);
            if (!panel || !subPanel) return;

            if (_activeToolPanel === tool) {
                // Already open for this tool — close it
                closeToolSettingsPanel();
                return;
            }

            // Hide all sub-panels, then show the target one
            document.querySelectorAll('#tool-settings-panel > div[id^=panel-]').forEach(el => el.classList.add('hidden'));
            subPanel.classList.remove('hidden');
            panel.classList.remove('hidden');
            _activeToolPanel = tool;

            // Also activate the tool for drawing
            setEditorTool(tool);
        }

        // Close panel when tapping on the workspace canvas area
        document.addEventListener('click', (e) => {
            if (_activeToolPanel && !e.target.closest('#editor-toolbar')) {
                closeToolSettingsPanel();
            }
        });

        // 1. Activate Tool (Main Button) — for tools without panels (shapes, etc.)
        function activateTool(tool) {
            closeToolSettingsPanel();

            // Toggle logic: if clicking the active tool, deselect it (go to select mode)
            if (editorTool === tool) {
                setEditorTool('select');
            } else {
                setEditorTool(tool);
            }
        }

        // 2. Toggle Dropdown — legacy wrapper, now calls toggleToolPanel
        function toggleDropdown(tool) {
            toggleToolPanel(tool);
        }

        function updatePenColor(color) {
            currentPenColor = color;
            if (fabricCanvas.freeDrawingBrush) fabricCanvas.freeDrawingBrush.color = color;
            document.getElementById('pen-preview').style.backgroundColor = color;
            // Update Icon Color
            document.querySelector('#tool-draw i.fa-pencil-alt').style.color = color;
            // Panel stays open so user can adjust size too
        }

        function updatePenSize(size) {
            currentPenSize = parseInt(size);
            if (fabricCanvas.freeDrawingBrush) fabricCanvas.freeDrawingBrush.width = currentPenSize;
            document.getElementById('pen-size-label').innerText = size + "px";
            document.getElementById('pen-preview').style.height = size + "px";
        }

        function updateHighlighterColor(color) {
            currentHighlighterColor = color;
            if (fabricCanvas.freeDrawingBrush) fabricCanvas.freeDrawingBrush.color = hexToRgba(color, 0.5);
            document.getElementById('highlighter-preview').style.backgroundColor = hexToRgba(color, 0.5);
            document.querySelector('#tool-highlighter i.fa-highlighter').style.color = color;
            // Panel stays open so user can adjust size too
        }

        function updateHighlighterSize(size) {
            currentHighlighterSize = parseInt(size);
            if (fabricCanvas.freeDrawingBrush) fabricCanvas.freeDrawingBrush.width = currentHighlighterSize;
            document.getElementById('highlighter-size-label').innerText = size + "px";
            document.getElementById('highlighter-preview').style.height = size + "px";
        }

        function setEditorTool(tool) {
            editorTool = tool;

            // Disable shape mode when switching tools
            activeShapeType = null;
            isDrawingShape = false;
            if (tool !== 'shapes') {
                const shapePanel = document.getElementById('shape-settings-panel');
                if (shapePanel) shapePanel.classList.add('hidden');
            }

            // 1. Reset UI (Clear all highlights)
            document.querySelectorAll('#editor-toolbar button[id^="tool-"]').forEach(b => {
                b.classList.remove('text-white', 'bg-white/10');
                b.classList.add('text-gray-400');
            });

            // 2. Highlight Active Tool
            const toolId = tool === 'draw' ? 'draw' : tool === 'highlighter' ? 'highlighter' : tool === 'shapes' ? 'shapes' : tool === 'eraser' ? 'eraser' : 'select';

            if (toolId !== 'select') {
                const activeBtn = document.getElementById(`tool-${toolId}`);
                if (activeBtn) {
                    activeBtn.classList.remove('text-gray-400');
                    activeBtn.classList.add('text-white', 'bg-white/10');
                }
            }

            // 3. Clean up tool states â€” CRITICAL: always fully reset drawing mode
            disableEraserLogic();
            fabricCanvas.isDrawingMode = false;

            // Fix: Selection rectangle only allowed in 'select' or 'crop' tools
            fabricCanvas.selection = (tool === 'select' || tool === 'crop');

            fabricCanvas.defaultCursor = 'default';
            fabricCanvas.hoverCursor = (tool === 'select') ? 'move' : 'default';

            // Fix: The upper-canvas should NOT bleed touch events out (prevents page scrolling when dragging shapes)
            if (fabricCanvas.upperCanvasEl) {
                fabricCanvas.upperCanvasEl.style.touchAction = 'none';
            }

            // 4. Initialize New Tool Logic
            if (tool === 'eraser') {
                enableEraserLogic();
            } else if (tool === 'draw') {
                fabricCanvas.isDrawingMode = true;
                fabricCanvas.freeDrawingBrush = new fabric.PencilBrush(fabricCanvas);
                fabricCanvas.freeDrawingBrush.width = currentPenSize;
                fabricCanvas.freeDrawingBrush.color = currentPenColor;
                fabricCanvas.freeDrawingBrush.decimate = 3;
                if (fabricCanvas.upperCanvasEl) fabricCanvas.upperCanvasEl.style.touchAction = 'none';
            } else if (tool === 'highlighter') {
                fabricCanvas.isDrawingMode = true;
                fabricCanvas.freeDrawingBrush = new fabric.PencilBrush(fabricCanvas);
                fabricCanvas.freeDrawingBrush.width = currentHighlighterSize;
                fabricCanvas.freeDrawingBrush.color = hexToRgba(currentHighlighterColor, 0.5);
                fabricCanvas.freeDrawingBrush.decimate = 5;
                if (fabricCanvas.upperCanvasEl) fabricCanvas.upperCanvasEl.style.touchAction = 'none';
            } else if (tool === 'shapes') {
                // Show Shape Settings Panel immediately
                showBottomPanel('shape-settings-panel');
                if (!document.getElementById('shape-color-picker').hasChildNodes()) {
                    initShapePanel();
                }
                // Default to rectangle if none selected
                if (!activeShapeType) selectShapeTool('rect');
            }

            updateCursor(tool);
            fabricCanvas.requestRenderAll();
        }

        function updateCursor(tool) {
            let cursor = 'default';
            if (tool === 'draw') {
                const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='white' stroke='black' stroke-width='1'><path d='M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z'></path></svg>`;
                cursor = `url("data:image/svg+xml;base64,${btoa(svg)}") 2 22, auto`;
            } else if (tool === 'highlighter') {
                const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='rgba(255,255,0,0.8)' stroke='black' stroke-width='1'><path d='M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z'></path></svg>`;
                cursor = `url("data:image/svg+xml;base64,${btoa(svg)}") 2 22, auto`;
            } else if (tool === 'eraser') {
                cursor = 'none'; // We use a custom circle
            } else if (tool === 'shapes') {
                cursor = 'default';
            }

            fabricCanvas.defaultCursor = cursor;
            fabricCanvas.freeDrawingCursor = cursor;
            if (tool !== 'select') fabricCanvas.hoverCursor = cursor;
        }

        // ========================
        // ROBUST SWEEP ERASER
        // ========================
        let eraserCursorObject = null;

        function enableEraserLogic() {
            // H-4: Make idempotent — clean up any existing eraser state first
            disableEraserLogic();

            fabricCanvas.isDrawingMode = false;
            fabricCanvas.selection = false;
            fabricCanvas.forEachObject(o => o.selectable = false);

            // Create Visual Cursor â€” initialized off-screen so it doesn't flash at 0,0
            eraserCursorObject = new fabric.Circle({
                radius: currentEraserSize / 2,
                fill: 'rgba(255,255,255,0.15)',
                stroke: 'rgba(0,0,0,0.5)',
                strokeWidth: 2,
                originX: 'center',
                originY: 'center',
                left: -500, // Start off-screen
                top: -500,
                selectable: false,
                evented: false,
                excludeFromExport: true,
                isEraserCursor: true,
                opacity: 0.85
            });
            fabricCanvas.add(eraserCursorObject);

            fabricCanvas.on('mouse:down', startErasing);
            fabricCanvas.on('mouse:move', onEraserMove);
            fabricCanvas.on('mouse:up', stopErasing);
            fabricCanvas.on('touch:down', startErasingTouch);
            fabricCanvas.on('touch:move', onEraserTouchMove);
            fabricCanvas.on('touch:up', stopErasing);
            fabricCanvas.on('mouse:out', () => { if (eraserCursorObject) eraserCursorObject.set({ left: -500, top: -500 }); fabricCanvas.requestRenderAll(); });
        }

        function disableEraserLogic() {
            fabricCanvas.off('mouse:down', startErasing);
            fabricCanvas.off('mouse:move', onEraserMove);
            fabricCanvas.off('mouse:up', stopErasing);
            fabricCanvas.off('touch:down', startErasingTouch);
            fabricCanvas.off('touch:move', onEraserTouchMove);
            fabricCanvas.off('touch:up', stopErasing);

            if (eraserCursorObject) {
                fabricCanvas.remove(eraserCursorObject);
                eraserCursorObject = null;
            }

            // Restore interactivity ONLY for valid objects (not background)
            fabricCanvas.forEachObject(o => {
                if (!o.isPdfBackground && o.name !== 'crop-overlay' && !o.isEraserCursor) {
                    o.selectable = true;
                }
            });
        }

        function startErasing(opt) {
            if (opt.e && opt.e.touches && opt.e.touches.length > 1) return;
            isEraserActive = true;
            const pointer = fabricCanvas.getPointer(opt.e);
            lastEraserX = pointer.x;
            lastEraserY = pointer.y;
            if (eraserCursorObject) {
                // originX/Y is 'center', so left/top IS the center point.
                // Do NOT subtract radius â€” that shifts the cursor away from touch.
                eraserCursorObject.set({
                    left: pointer.x,
                    top: pointer.y,
                    visible: true,
                    stroke: '#fbbf24',
                    fill: '#fef08a'
                });
                eraserCursorObject.setCoords();
            }
            eraseObjects(opt);
        }

        function onEraserMove(opt) {
            // Use getPointer to correctly map screen coords â†’ canvas coords (with zoom/pan)
            const pointer = fabricCanvas.getPointer(opt.e);
            if (eraserCursorObject) {
                eraserCursorObject.set({ left: pointer.x, top: pointer.y, visible: true });
                eraserCursorObject.setCoords();
            }
            if (isEraserActive) eraseObjects(opt);
            fabricCanvas.requestRenderAll();
        }

        // Mobile touch drag support for eraser with smooth interpolation
        function onEraserTouchDrag(opt) {
            if (!opt.e || !opt.e.touches) return;
            const pointer = fabricCanvas.getPointer(opt.e.touches[0]);
            if (eraserCursorObject) {
                eraserCursorObject.set({ left: pointer.x, top: pointer.y, visible: true });
                eraserCursorObject.setCoords();
            }
            if (isEraserActive) eraseObjects(opt);
            fabricCanvas.requestRenderAll();
        }

        // Touch events support functions
        function startErasingTouch(opt) {
            isEraserActive = true;
            if (!opt.e || !opt.e.touches) return;
            const pointer = fabricCanvas.getPointer(opt.e.touches[0]);
            lastEraserX = pointer.x;
            lastEraserY = pointer.y;
            if (eraserCursorObject) {
                eraserCursorObject.set({
                    left: pointer.x,
                    top: pointer.y,
                    visible: true,
                    stroke: '#fbbf24',
                    fill: '#fef08a'
                });
                eraserCursorObject.setCoords();
            }
            eraseObjects(opt);
        }

        function onEraserTouchMove(opt) {
            if (!opt.e || !opt.e.touches || opt.e.touches.length > 1) return;
            const pointer = fabricCanvas.getPointer(opt.e.touches[0]);
            if (eraserCursorObject) {
                eraserCursorObject.set({ left: pointer.x, top: pointer.y, visible: true });
                eraserCursorObject.setCoords();
            }
            if (isEraserActive) {
                // Interpolate between last position and current for smooth erasing
                eraseObjectsInterpolated(lastEraserX, lastEraserY, pointer.x, pointer.y);
                lastEraserX = pointer.x;
                lastEraserY = pointer.y;
            }
            fabricCanvas.requestRenderAll();
        }

        function stopErasing() {
            if (isEraserActive) {
                isEraserActive = false;
                if (eraserCursorObject) {
                    eraserCursorObject.set('stroke', 'rgba(0,0,0,0.5)'); // Back to dark outline
                    eraserCursorObject.set('fill', 'rgba(255,255,255,0.15)'); // Back to transparent fill
                }
                fabricCanvas.requestRenderAll();
                saveHistory();
            }
        }

        function eraseObjects(opt) {
            if (!eraserCursorObject) return;

            const pointer = fabricCanvas.getPointer(opt.e);
            if (!pointer) return;

            const eraserX = pointer.x;
            const eraserY = pointer.y;
            const eraserRadius = eraserCursorObject.radius || (currentEraserSize / 2);

            // Add a 25% spatial broad-phase buffer to catch fast strokes
            const buffer = eraserRadius * 0.25;
            const eraserBox = {
                l: eraserX - eraserRadius - buffer,
                r: eraserX + eraserRadius + buffer,
                t: eraserY - eraserRadius - buffer,
                b: eraserY + eraserRadius + buffer
            };

            // FIX BUG-06: Never mutate getObjects() array while iterating it.
            // Collect objects to erase first, then remove in a second pass.
            const objects = fabricCanvas.getObjects().slice(); // snapshot copy
            let hasChanges = false;
            const toErase = [];

            for (let i = 0; i < objects.length; i++) {
                const obj = objects[i];
                if (!obj || !obj.visible || obj.isPdfBackground || obj.isEraserCursor || obj.name === 'crop-overlay') continue;

                // 1. FAST BROAD-PHASE CHECK using bounding box
                const bound = obj.getBoundingRect(true, true);
                if (bound.left > eraserBox.r || (bound.left + bound.width) < eraserBox.l ||
                    bound.top > eraserBox.b || (bound.top + bound.height) < eraserBox.t) {
                    continue;
                }

                // 2. PRECISE CIRCLE-RECT INTERSECTION (improved collision detection)
                const closestX = Math.max(bound.left, Math.min(eraserX, bound.left + bound.width));
                const closestY = Math.max(bound.top, Math.min(eraserY, bound.top + bound.height));
                const distSq = (eraserX - closestX) ** 2 + (eraserY - closestY) ** 2;

                if (distSq <= (eraserRadius * eraserRadius)) toErase.push(obj);
            }

            toErase.forEach(obj => { fabricCanvas.remove(obj); hasChanges = true; });

            if (hasChanges) {
                fabricCanvas.requestRenderAll();
            }
        }

        // Enhanced eraser with interpolation for smooth strokes on fast movements
        function eraseObjectsInterpolated(x0, y0, x1, y1) {
            if (!eraserCursorObject) return;

            const eraserRadius = eraserCursorObject.radius || (currentEraserSize / 2);
            const distance = Math.sqrt((x1 - x0) ** 2 + (y1 - y0) ** 2);

            // Number of interpolation steps based on distance
            const steps = Math.max(1, Math.ceil(distance / (eraserRadius * 0.5)));
            const objects = fabricCanvas.getObjects();
            let hasChanges = false;

            for (let step = 0; step <= steps; step++) {
                const t = steps === 0 ? 0 : step / steps;
                const eraserX = x0 + (x1 - x0) * t;
                const eraserY = y0 + (y1 - y0) * t;

                // Buffer for catching objects
                const buffer = eraserRadius * 0.25;
                const eraserBox = {
                    l: eraserX - eraserRadius - buffer,
                    r: eraserX + eraserRadius + buffer,
                    t: eraserY - eraserRadius - buffer,
                    b: eraserY + eraserRadius + buffer
                };

                // FIX BUG-06: Never mutate the array while iterating it.
                // Collect all objects to erase first, then remove in a second pass.
                const toErase = [];
                for (let i = 0; i < objects.length; i++) {
                    const obj = objects[i];
                    if (!obj || !obj.visible || obj.isPdfBackground || obj.isEraserCursor || obj.name === 'crop-overlay') continue;

                    const bound = obj.getBoundingRect(true, true);
                    if (bound.left > eraserBox.r || (bound.left + bound.width) < eraserBox.l ||
                        bound.top > eraserBox.b || (bound.top + bound.height) < eraserBox.t) {
                        continue;
                    }

                    const closestX = Math.max(bound.left, Math.min(eraserX, bound.left + bound.width));
                    const closestY = Math.max(bound.top, Math.min(eraserY, bound.top + bound.height));
                    const distSq = (eraserX - closestX) ** 2 + (eraserY - closestY) ** 2;

                    if (distSq <= (eraserRadius * eraserRadius)) toErase.push(obj);
                }
                toErase.forEach(obj => { fabricCanvas.remove(obj); hasChanges = true; });
            }

            if (hasChanges) {
                fabricCanvas.requestRenderAll();
            }
        }

        function updateEraserSize(size) {
            currentEraserSize = parseInt(size);
            document.getElementById('eraser-size-label').innerText = size + "px";

            const preview = document.getElementById('eraser-preview-circle');
            if (preview) {
                preview.style.width = size + "px";
                preview.style.height = size + "px";
            }

            if (eraserCursorObject) {
                eraserCursorObject.set('radius', currentEraserSize / 2);
                eraserCursorObject.setCoords(); // Update hit box immediately
                fabricCanvas.requestRenderAll();
            }
        }

        function showBottomPanel(id) {
            const el = document.getElementById(id);
            if (!el) return;
            el.classList.remove('hidden');
            setTimeout(() => el.classList.remove('panel-slide-out'), 10);
        }

        function cancelEraser() {
            setEditorTool('select');
        }

        function applyEraser() {
            setEditorTool('select');
        }

        // ========================
        // EDITOR CONFIG
        // ========================
        window.addEventListener('DOMContentLoaded', () => {
            initColorGrids();
            initShapePanel(); // Pre-init shape colors
            document.querySelector('#tool-draw i.fa-pencil-alt').style.color = currentPenColor;
            document.querySelector('#tool-highlighter i.fa-highlighter').style.color = currentHighlighterColor;
        });

        // Helper: HEX to RGBA
        function hexToRgba(hex, alpha) {
            const r = parseInt(hex.slice(1, 3), 16);
            const g = parseInt(hex.slice(3, 5), 16);
            const b = parseInt(hex.slice(5, 7), 16);
            return `rgba(${r}, ${g}, ${b}, ${alpha})`;
        }

        // Helper: Select Shape Tool (Modified)
        function selectShapeTool(type) {
            // Already in shapes tool? Just update type
            if (editorTool !== 'shapes') {
                setEditorTool('shapes');
            }
            activeShapeType = type;

            // Highlight the active shape button in the bottom panel
            document.querySelectorAll('[id^="shape-btn-"]').forEach(btn => {
                btn.classList.remove('bg-white/20', 'text-white', 'border-white/20');
                btn.classList.add('text-gray-400');
            });
            const activeBtn = document.getElementById(`shape-btn-${type}`);
            if (activeBtn) {
                activeBtn.classList.remove('text-gray-400');
                activeBtn.classList.add('bg-white/20', 'text-white', 'border-white/20');
            }

            // Configure Canvas for Drawing — disable selection/movement while drawing
            fabricCanvas.selection = false;
            fabricCanvas.defaultCursor = 'crosshair';
            fabricCanvas.hoverCursor = 'crosshair';
            fabricCanvas.forEachObject(o => {
                o.selectable = false;
                o.evented = false;
            });

            closeAllDropdowns();
        }

        // ==========================================
        // SHAPE SETTINGS PANEL LOGIC
        // ==========================================
        const SHAPE_COLORS = [
            '#ef4444', '#f97316', '#f59e0b', '#84cc16', '#22c55e', '#10b981',
            '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1', '#8b5cf6', '#d946ef',
            '#f43f5e', '#ffffff', '#9ca3af', '#000000', 'transparent'
        ];

        function initShapePanel() {
            const container = document.getElementById('shape-color-picker');
            if (!container) return;

            // Add more colors to make it more comprehensive
            const ALL_PANEL_COLORS = [...new Set([...SHAPE_COLORS, ...PEN_COLORS])];

            container.innerHTML = ALL_PANEL_COLORS.map(color => `
<button onclick="setShapeColor('${color}')"
class="w-8 h-8 rounded-full border border-white/10 hover:border-white hover:scale-110 transition-all shadow-sm flex-shrink-0 focus:outline-none focus:ring-1 focus:ring-white/50"
style="background-color: ${color === 'transparent' ?
                    'transparent' : color};
background-image: ${color === 'transparent' ? 'url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAIklEQVQIW2NkQAKrVq36zwjjgzhhYWGMYAEYB8RmROaABADeOQ8CXl/xfgAAAABJRU5ErkJggg==)' : 'none'};
background-size: ${color === 'transparent' ? '6px' : 'auto'};"
title="${color}">
${color === 'transparent' ? '<i class="fas fa-ban text-red-500 text-[10px] drop-shadow-md"></i>' : ''}
</button>
`).join('');
        }

        function onObjectSelected(e) {
            // Only show panel for shapes/lines/images, not the crop overlay or eraser cursor
            const obj = e.selected ? e.selected[0] : e.target;

            if (!obj) return;
            if (obj.name === 'crop-overlay' || obj.isEraserCursor || obj.isPdfBackground) {
                hideShapePanel();
                return;
            }

            // Only show if we are in 'select' mode or 'shapes' mode
            if (editorTool === 'eraser' || editorTool === 'draw' || editorTool === 'highlighter') {
                return;
            }

            // Show Panel
            const panel = document.getElementById('shape-settings-panel');
            panel.classList.remove('hidden');
            setTimeout(() => panel.classList.remove('panel-slide-out'), 10);

            // Initialize palette if empty
            if (!document.getElementById('shape-color-picker').hasChildNodes()) {
                initShapePanel();
            }

            // Sync slider with current object stroke width
            const currentStroke = obj.strokeWidth || 3;
            const slider = document.querySelector('#shape-size-popover input');
            if (slider) {
                slider.value = currentStroke;
                document.getElementById('stroke-val-display').innerText = currentStroke + 'px';
            }
        }

        function onSelectionCleared() {
            hideShapePanel();
        }

        function hideShapePanel() {
            const panel = document.getElementById('shape-settings-panel');
            panel.classList.add('panel-slide-out');
            document.getElementById('shape-size-popover').classList.add('hidden'); // Close popover
            setTimeout(() => panel.classList.add('hidden'), 300);
        }

        function setShapeColor(color) {
            currentShapeColor = color; // Update global for new shapes
            const activeObj = fabricCanvas.getActiveObject();

            if (!activeObj) return;

            // Apply to Stroke for all shapes (Rect, Circle, Line, Path)
            if (color === 'transparent') {
                activeObj.set({ stroke: 'transparent', fill: 'transparent' });
            } else {
                activeObj.set({ stroke: color, fill: 'transparent' });
            }

            fabricCanvas.requestRenderAll();
            saveHistory();
        }

        function toggleShapeSizeSlider() {
            const popover = document.getElementById('shape-size-popover');
            popover.classList.toggle('hidden');
        }

        function updateShapeStroke(val) {
            const width = parseInt(val);
            currentShapeStrokeWidth = width; // Update global for new shapes
            document.getElementById('stroke-val-display').innerText = width + 'px';

            const activeObj = fabricCanvas.getActiveObject();
            if (activeObj) {
                activeObj.set('strokeWidth', width);
                fabricCanvas.requestRenderAll();
                saveHistory();
            }
        }

        function deleteSelectedShape() {
            const activeObj = fabricCanvas.getActiveObject();
            if (activeObj) {
                fabricCanvas.remove(activeObj);
                fabricCanvas.discardActiveObject();
                fabricCanvas.requestRenderAll();
                saveHistory();
                hideShapePanel();
            }
        }

        function rotateSelectedShape(angle) {
            const activeObj = fabricCanvas.getActiveObject();
            if (activeObj) {
                const currentAngle = activeObj.angle || 0;
                activeObj.rotate(currentAngle + angle);
                fabricCanvas.requestRenderAll();
                saveHistory();
            }
        }

        function bringToFront() {
            const activeObj = fabricCanvas.getActiveObject();
            if (activeObj) {
                activeObj.bringToFront();
                saveHistory();
            }
        }

        function sendToBack() {
            const activeObj = fabricCanvas.getActiveObject();
            if (activeObj) {
                // Don't send behind the background image if possible, but fabric handles z-index simply
                activeObj.sendToBack();
                // Ensure PDF background stays at very bottom if needed
                fabricCanvas.getObjects().forEach(o => {
                    if (o.isPdfBackground) o.sendToBack();
                });
                saveHistory();
            }
        }

        // ==========================================
        // IMAGE CROP TOOL
        // ==========================================
        let cropperInstance = null;
        let cropScaleX = 1;
        let cropScaleY = 1;
        let activeCropObject = null;
        let isCropSelecting = false;

        function showToast(message, duration = 3000) {
            const container = document.getElementById('toast-container');
            const text = document.getElementById('toast-text');
            text.innerText = message;
            container.style.opacity = '1';
            setTimeout(() => {
                container.style.opacity = '0';
            }, duration);
        }

        function openCropTool() {
            if (!fabricCanvas) {
                alert('No canvas available. Please start the editor first.');
                return;
            }

            // 1. Check if user ALREADY has an image selected (Shortcut)
            const activeObj = fabricCanvas.getActiveObject();
            if (activeObj && activeObj.type === 'image') {
                startCropping(activeObj);
                return;
            }

            // 2. Enter "Select Image to Crop" Mode
            isCropSelecting = true;

            // Visual feedback
            fabricCanvas.defaultCursor = 'crosshair';
            fabricCanvas.hoverCursor = 'crosshair';
            fabricCanvas.forEachObject(o => {
                if (o.type === 'image') {
                    o.hoverCursor = 'crosshair';
                }
            });
            fabricCanvas.requestRenderAll();

            showToast("Tap an image or page to crop it", 4000);

            // Add one-time click listener
            fabricCanvas.on('mouse:down', handleCropSelection);
        }

        function handleCropSelection(opt) {
            if (opt.e && opt.e.touches && opt.e.touches.length > 1) return;
            if (!isCropSelecting) return;

            const pointer = fabricCanvas.getPointer(opt.e);
            let target = null;

            // Strategy A: Check standard target property
            if (opt.target && opt.target.type === 'image') {
                target = opt.target;
            } else {
                // Strategy B: Manual hit test (for locked PDF backgrounds)
                // Iterate in reverse to find the top-most visual match
                const objects = fabricCanvas.getObjects().slice().reverse();
                for (let obj of objects) {
                    if (obj.type === 'image' && obj.visible && obj.containsPoint(pointer)) {
                        target = obj;
                        break;
                    }
                }
            }

            if (target) {
                startCropping(target);
            } else {
                // Clicked empty space
                showToast("No image found there. Try tapping a page.");
                return; // Keep selection mode active
            }

            // Exit selection mode
            isCropSelecting = false;
            fabricCanvas.defaultCursor = 'default';
            fabricCanvas.hoverCursor = 'move';
            fabricCanvas.off('mouse:down', handleCropSelection);

            // Reset cursor styles on objects
            fabricCanvas.forEachObject(o => {
                o.hoverCursor = null; // Revert to default
            });
            fabricCanvas.requestRenderAll();
        }

        function startCropping(imageObj) {
            activeCropObject = imageObj;

            // Use high-quality export (multiplier 4) for crystal clear source
            const imageUrl = imageObj.toDataURL({ format: 'png', multiplier: 4 });

            // Set up Modal
            const cropImage = document.getElementById('crop-image');
            cropImage.src = imageUrl;
            document.getElementById('crop-modal').classList.remove('hidden');

            // Initialize Cropper
            cropImage.onload = function () {
                if (cropperInstance) cropperInstance.destroy();

                cropperInstance = new Cropper(cropImage, {
                    aspectRatio: NaN,
                    viewMode: 1, // Restrict crop box to within image
                    dragMode: 'move', // Allow panning the image with one finger
                    autoCropArea: 0.8,
                    restore: false,
                    guides: true,
                    center: true,
                    highlight: true,
                    cropBoxMovable: false, // LOCK the blue line/box; only handles can move it
                    cropBoxResizable: true, // Allow 8 handles to resize/transform
                    toggleDragModeOnDblclick: false,
                    background: false,
                    zoomable: true,
                    scalable: true,
                    zoomOnTouch: true, // Native pinch zoom
                    zoomOnWheel: false, // CRITICAL: Disable default wheel zoom to handle manually
                    wheelZoomRatio: 0.1,
                    ready: function () {
                        // Custom Wheel Handler for Scrolling vs Zooming
                        const container = this.cropper.container;
                        container.addEventListener('wheel', (e) => {
                            e.preventDefault();
                            if (e.ctrlKey) {
                                // Sensitivity: -delta * 0.009
                                const zoomDelta = -e.deltaY * 0.009;
                                cropperInstance.zoom(zoomDelta);
                            } else {
                                const speed = 0.8;
                                cropperInstance.move(-e.deltaX * speed, -e.deltaY * speed);
                            }
                        }, { passive: false });
                    }
                });

                // Reset controls
                cropScaleX = 1;
                cropScaleY = 1;
                initRotationRuler();
            };
        }

        let isRotatingRuler = false;
        let rotateStartX = 0;
        let currentRotation = 0;
        // FIX BUG-15: module-level refs so closeCropModal can remove them
        let _rulerMoveHandler = null;
        let _rulerEndHandler = null;

        function initRotationRuler() {
            const scale = document.getElementById('ruler-scale');
            if (!scale) return;

            // Generate Marks for -45 to +45 range (90 marks total)
            let html = '';
            for (let i = -45; i <= 45; i++) {
                const isMajor = i % 5 === 0;
                html += `<div class="ruler-mark ${isMajor ? 'large' : ''}" data-deg="${i}"></div>`;
            }
            scale.innerHTML = html;

            const ruler = document.getElementById('rotation-ruler');
            ruler.onmousedown = ruler.ontouchstart = (e) => {
                isRotatingRuler = true;
                rotateStartX = (e.type === 'touchstart' ? e.touches[0].clientX : e.clientX);
                ruler.style.cursor = 'grabbing';
                scale.style.transition = 'none';
            };

            // FIX BUG-15: Store handler refs at module level so closeCropModal can remove them.
            // Without removal, every crop modal open stacks another listener on window.
            _rulerMoveHandler = (e) => {
                if (!isRotatingRuler || !cropperInstance) return;
                const clientX = (e.type === 'touchmove' ? e.touches[0].clientX : e.clientX);
                const deltaX = clientX - rotateStartX;

                const degChange = deltaX / 4;
                const newDeg = Math.max(-45, Math.min(45, currentRotation + degChange));

                cropperInstance.rotateTo(newDeg);
                updateRulerUI(newDeg);
            };

            _rulerEndHandler = () => {
                if (!isRotatingRuler) return;
                isRotatingRuler = false;
                ruler.style.cursor = 'grab';
                const data = cropperInstance.getData();
                currentRotation = data.rotate;
                scale.style.transition = 'transform 0.1s ease-out';
            };

            window.addEventListener('mousemove', _rulerMoveHandler);
            window.addEventListener('touchmove', _rulerMoveHandler, { passive: true });
            window.addEventListener('mouseup', _rulerEndHandler);
            window.addEventListener('touchend', _rulerEndHandler);

            updateRulerUI(0);
        }

        let lastHapticDeg = 0;
        function updateRulerUI(deg) {
            const scale = document.getElementById('ruler-scale');
            const display = document.getElementById('tilt-val');
            if (!scale || !display) return;

            // Offset calculation: (1.5px bar + 12px gap) = 13.5px per degree
            const step = 13.5;
            // Alignment Fix: Center the 0 mark (at index 45) by subtracting 45 from the degree
            const offset = -(deg + 45) * step;
            scale.style.transform = `translateX(${offset}px)`;

            const rounded = Math.round(deg);
            display.innerText = rounded + 'Â°';

            // Haptic Feedback on every 1-degree tick
            if (rounded !== lastHapticDeg) {
                if (window.navigator && window.navigator.vibrate) {
                    window.navigator.vibrate(5);
                }
                lastHapticDeg = rounded;
            }

            // Highlight display when non-zero
            const badgeParent = display.parentElement;
            if (Math.abs(rounded) > 0) {
                badgeParent.classList.add('border-white/40', 'bg-white/10');
                badgeParent.classList.remove('bg-[#222]');
            } else {
                badgeParent.classList.remove('border-white/40', 'bg-white/10');
                badgeParent.classList.add('bg-[#222]');
            }
        }

        function updateRulerPos(deg) {
            currentRotation = deg;
            updateRulerUI(deg);
        }

        function closeCropModal() {
            document.getElementById('crop-modal').classList.add('hidden');
            if (cropperInstance) {
                cropperInstance.destroy();
                cropperInstance = null;
            }
            document.getElementById('crop-image').src = '';
            activeCropObject = null; // Clear reference

            // FIX BUG-15: Remove ruler handlers every time modal closes to prevent stacking
            if (_rulerMoveHandler) {
                window.removeEventListener('mousemove', _rulerMoveHandler);
                window.removeEventListener('touchmove', _rulerMoveHandler);
                _rulerMoveHandler = null;
            }
            if (_rulerEndHandler) {
                window.removeEventListener('mouseup', _rulerEndHandler);
                window.removeEventListener('touchend', _rulerEndHandler);
                _rulerEndHandler = null;
            }
        }

        function setCropRatio(ratio, btn) {
            if (!cropperInstance) return;

            // Handle "Original" specially: calculating ratio from existing image
            if (ratio === 0) {
                const data = cropperInstance.getImageData();
                ratio = data.naturalWidth / data.naturalHeight;
            }

            // Update UI Active State
            document.querySelectorAll('.ratio-btn').forEach(b => {
                b.classList.remove('active', 'bg-white/20', 'text-white', 'border-white/30');
                b.classList.add('bg-white/5', 'text-gray-400', 'border-white/10');
            });

            if (btn) {
                btn.classList.add('active', 'bg-white/20', 'text-white', 'border-white/30');
                btn.classList.remove('bg-white/5', 'text-gray-400', 'border-white/10');
            }

            cropperInstance.setAspectRatio(ratio);
        }

        function setAspectRatio(ratio, e) {
            if (!cropperInstance) return;

            // Update active state on buttons — L-7: use parameter instead of implicit global
            document.querySelectorAll('.aspect-btn').forEach(btn => {
                btn.classList.remove('active');
            });
            const target = e ? e.target : null;
            if (target) target.classList.add('active');

            cropperInstance.setAspectRatio(ratio);
        }

        function rotateCrop(degrees) {
            if (!cropperInstance) return;
            cropperInstance.rotate(degrees);
            // Sync ruler after fixed rotation
            const data = cropperInstance.getData();
            updateRulerPos(data.rotate);
        }

        function flipCrop(direction) {
            if (!cropperInstance) return;

            if (direction === 'horizontal') {
                cropScaleX = cropScaleX === 1 ? -1 : 1;
                cropperInstance.scaleX(cropScaleX);
            } else if (direction === 'vertical') {
                cropScaleY = cropScaleY === 1 ? -1 : 1;
                cropperInstance.scaleY(cropScaleY);
            }
        }

        function resetCrop() {
            if (!cropperInstance) return;
            cropperInstance.reset();
            cropScaleX = 1;
            cropScaleY = 1;

            // Reset aspect ratio to free
            document.querySelectorAll('.aspect-btn').forEach(btn => {
                btn.classList.remove('active');
            });
            document.querySelectorAll('.aspect-btn')[0].classList.add('active');
        }

        function applyCrop() {
            if (!cropperInstance || !fabricCanvas || !activeCropObject) return;

            try {
                // Get the cropped result
                const croppedCanvas = cropperInstance.getCroppedCanvas({
                    maxWidth: 4096, maxHeight: 4096,
                    imageSmoothingEnabled: true, imageSmoothingQuality: 'high'
                });

                if (!croppedCanvas) throw new Error('Failed to generate cropped image');

                const croppedDataUrl = croppedCanvas.toDataURL('image/png', 1.0);

                // Create new Fabric image to replace the old one
                fabric.Image.fromURL(croppedDataUrl, function (img) {

                    // FIX BUG-12: scaleX/scaleY of original must NOT be blindly re-applied.
                    // Background images have scaleX = displayWidth / naturalWidth which is
                    // calculated for the ORIGINAL image dimensions. The cropped image has
                    // different natural dimensions so reusing the raw scale factors distorts it.
                    // Instead: compute the desired DISPLAY size from the original and scale-to-fit.
                    const displayW = activeCropObject.width * activeCropObject.scaleX;
                    const displayH = activeCropObject.height * activeCropObject.scaleY;

                    img.set({
                        left: activeCropObject.left,
                        top: activeCropObject.top,
                        // Critical: Preserve locking state for background pages
                        selectable: activeCropObject.selectable,
                        evented: activeCropObject.evented,
                        isPdfBackground: activeCropObject.isPdfBackground,
                        objectCaching: activeCropObject.objectCaching
                    });

                    // Scale new image so it fills exactly the same display area as the old one
                    img.scaleToWidth(displayW);
                    // Only override height scale if aspect ratio differs significantly from crop
                    const croppedAR = img.width / img.height;
                    const origAR = displayW / displayH;
                    if (Math.abs(croppedAR - origAR) > 0.05) {
                        img.scaleToHeight(displayH);
                    }

                    // Replace in canvas
                    const index = fabricCanvas.getObjects().indexOf(activeCropObject);
                    if (index > -1) {
                        fabricCanvas.insertAt(img, index);
                        fabricCanvas.remove(activeCropObject);
                    } else {
                        fabricCanvas.add(img);
                    }

                    fabricCanvas.requestRenderAll();
                    saveHistory();
                    closeCropModal();
                    showToast("Crop applied successfully!");

                }, { crossOrigin: 'anonymous' });

            } catch (error) {
                console.error('Crop error:', error);
                alert('Failed to apply crop: ' + error.message);
            }
        }

        // --- Bottom OCR Panel Resizing Logic ---
        (function initOCRResizing() {
            const panel = document.getElementById('ocr-result-panel');
            const handle = document.getElementById('ocr-resize-handle');
            let isResizing = false;

            if (!handle || !panel) return;

            handle.addEventListener('mousedown', (e) => {
                isResizing = true;
                panel.style.transition = 'none'; // Disable transition for fluid dragging
                document.body.style.cursor = 'ns-resize';
                document.body.classList.add('select-none');
            });

            window.addEventListener('mousemove', (e) => {
                if (!isResizing) return;

                // Calculate new height based on viewport
                const vh = window.innerHeight;
                const newHeight = vh - e.clientY;

                // Constrain height between 10% and 100% of screen (Full maximize)
                const minHeight = vh * 0.1;
                const maxHeight = vh; // Allow full top

                if (newHeight >= minHeight && newHeight <= maxHeight) {
                    panel.style.height = `${newHeight}px`;
                }
            });

            window.addEventListener('mouseup', () => {
                if (isResizing) {
                    isResizing = false;
                    panel.style.transition = 'transform 0.3s ease'; // Re-enable for show/hide
                    document.body.style.cursor = 'default';
                    document.body.classList.remove('select-none');
                }
            });
        })();

    
