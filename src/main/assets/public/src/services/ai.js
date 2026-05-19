        // AI TOOLS
        // ============================================================
        function toggleAITools(e) {
            e.stopPropagation();
            const dropdown = document.getElementById('ai-tools-dropdown');
            const wasHidden = dropdown.classList.contains('hidden');
            dropdown.classList.toggle('hidden');
            updateApiKeyUI();
            // Auto-ping Ollama silently when dropdown opens (only for ollama provider)
            if (wasHidden && AI_CONFIG.activeProvider === 'ollama') {
                silentOllamaPing();
            }
        }

        let localDownloadedModels = [];

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

                    const data = await res.json();
                    localDownloadedModels = (data.models || []).map(m => m.name);
                    updateLocalModelsList(localDownloadedModels);
                } else throw new Error();
            } catch {
                status.textContent = 'Offline';
                status.className = 'text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-bold';
                status.classList.remove('hidden');

                localDownloadedModels = [];
                updateLocalModelsList([]);
            }
        }

        function updateLocalModelsList(models) {
            const select = document.getElementById('ollama-model-select');
            if (!select) return;

            // Clean up any dynamic groups/options previously added
            const optgroups = select.querySelectorAll('optgroup[label*="Installed"]');
            optgroups.forEach(g => g.remove());

            if (models && models.length > 0) {
                const group = document.createElement('optgroup');
                group.setAttribute('label', '📥 Installed Local Models');

                // Exclude presets that are already options to prevent duplicates
                const presetValues = ['gemma3:4b', 'gemma3:1b', 'llama3.2:3b'];
                models.forEach(modelName => {
                    const cleanName = modelName.replace(/:latest$/, '');
                    if (!presetValues.includes(cleanName)) {
                        const opt = document.createElement('option');
                        opt.value = modelName;
                        opt.textContent = `📥 ${modelName}`;
                        group.appendChild(opt);
                    }
                });

                if (group.children.length > 0) {
                    const customOpt = select.querySelector('option[value="custom"]');
                    select.insertBefore(group, customOpt);
                }
            }

            // Select correct option
            const currentModel = AI_CONFIG.ollamaModel || DEFAULT_OLLAMA_MODEL;
            const hasOption = Array.from(select.options).some(o => o.value === currentModel);
            if (hasOption) {
                select.value = currentModel;
                document.getElementById('ollama-custom-model-container').classList.add('hidden');
            } else {
                select.value = 'custom';
                document.getElementById('ollama-custom-model-container').classList.remove('hidden');
                const modelInput = document.getElementById('ollama-model-input');
                if (modelInput) modelInput.value = currentModel;
            }

            updateModelSpecUI(currentModel);
        }

        function onModelSelectChanged(val) {
            const customContainer = document.getElementById('ollama-custom-model-container');
            const modelInput = document.getElementById('ollama-model-input');
            if (val === 'custom') {
                customContainer.classList.remove('hidden');
                if (modelInput) modelInput.value = AI_CONFIG.ollamaModel || DEFAULT_OLLAMA_MODEL;
            } else {
                customContainer.classList.add('hidden');
                if (modelInput) modelInput.value = val;
            }
            updateModelSpecUI(val === 'custom' ? (modelInput ? modelInput.value.trim() : '') : val);
        }

        function updateModelSpecUI(model) {
            const cleanModel = (model || '').trim().toLowerCase();
            const specTitle = document.getElementById('model-spec-title');
            const specDesc = document.getElementById('model-spec-desc');
            const badge = document.getElementById('model-pulled-badge');
            const pullHelper = document.getElementById('model-pull-helper');
            const pullCode = document.getElementById('model-pull-code');

            if (!specTitle || !specDesc || !badge) return;

            // 1. Update Specs based on selected model
            if (cleanModel.startsWith('gemma3:4b')) {
                specTitle.textContent = 'Gemma 3 (4B)';
                specDesc.textContent = 'Highly recommended local reasoning. Google\'s premier mobile/desktop hybrid model with excellent structured formatting and quiz generation support.';
            } else if (cleanModel.startsWith('gemma3:1b')) {
                specTitle.textContent = 'Gemma 3 (1B)';
                specDesc.textContent = 'Ultra-lightweight and fast local reading assistant. Perfect for slower devices or low-RAM environments. Fast explanations & flashcards.';
            } else if (cleanModel.startsWith('llama3.2:3b') || cleanModel.startsWith('llama3.2')) {
                specTitle.textContent = 'Llama 3.2 (3B)';
                specDesc.textContent = 'Meta\'s compact multi-lingual model. Highly responsive and robust for everyday reading, summaries, and answering general knowledge queries.';
            } else if (cleanModel.startsWith('phi4')) {
                specTitle.textContent = 'Phi-4 (14B)';
                specDesc.textContent = 'Advanced Microsoft local reasoning model. Superior capability but requires significant CPU and high RAM (16GB+) to run smoothly.';
            } else {
                specTitle.textContent = model ? `Custom: ${model}` : 'Local Model';
                specDesc.textContent = 'Active local model for off-grid reading. Ensure Ollama has pulled this exact identifier.';
            }

            // 2. Check download status
            const isInstalled = localDownloadedModels.some(m => {
                const mNorm = m.toLowerCase();
                const mBase = mNorm.split(':')[0];
                const targetBase = cleanModel.split(':')[0];
                return mNorm === cleanModel || mNorm === cleanModel + ':latest' || (mBase === targetBase && targetBase !== 'custom');
            });

            if (isInstalled) {
                badge.textContent = '✓ Pulled';
                badge.className = 'text-[9px] px-1.5 py-0.5 rounded-full font-bold bg-green-100 text-green-700 shadow-sm animate-pulse-subtle';
                pullHelper.classList.add('hidden');
            } else {
                if (document.getElementById('api-status').textContent === 'Offline') {
                    badge.textContent = 'Offline';
                    badge.className = 'text-[9px] px-1.5 py-0.5 rounded-full font-bold bg-gray-100 text-gray-500';
                    pullHelper.classList.add('hidden');
                } else {
                    badge.textContent = '⚠️ Ready to Pull';
                    badge.className = 'text-[9px] px-1.5 py-0.5 rounded-full font-bold bg-yellow-100 text-yellow-700';
                    pullHelper.classList.remove('hidden');
                    if (pullCode) pullCode.textContent = `ollama run ${cleanModel || 'gemma3:4b'}`;
                }
            }
        }

        async function copyPullCommand(e) {
            if (e) e.stopPropagation();
            const code = document.getElementById('model-pull-code').textContent;
            try {
                await navigator.clipboard.writeText(code);
                showToast('✓ Command copied! Paste in your PC terminal.');
            } catch (err) {
                showToast('Failed to copy command');
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
            const testBtn = document.getElementById('ollama-test-btn');
            const helpText = document.getElementById('ollama-help-text');
            select.value = provider;
            if (provider === 'ollama') {
                label.innerText = 'Ollama URL';
                input.type = 'text';
                input.placeholder = DEFAULT_OLLAMA_URL;
                input.value = key || DEFAULT_OLLAMA_URL;
                if (modelRow) modelRow.classList.remove('hidden');
                if (testBtn) testBtn.classList.remove('hidden');
                if (helpText) helpText.classList.remove('hidden');

                updateLocalModelsList(localDownloadedModels);
            } else {
                label.innerText = provider.charAt(0).toUpperCase() + provider.slice(1) + ' Key';
                input.type = 'password';
                input.placeholder = 'Enter API Key...';
                input.value = key || '';
                if (modelRow) modelRow.classList.add('hidden');
                if (testBtn) testBtn.classList.add('hidden');
                if (helpText) helpText.classList.add('hidden');
            }
            if (key && (key.length > 10 || provider === 'ollama')) status.classList.remove('hidden');
            else status.classList.add('hidden');
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
                const modelSelect = document.getElementById('ollama-model-select');
                if (modelSelect) {
                    const selVal = modelSelect.value;
                    if (selVal === 'custom') {
                        const modelInput = document.getElementById('ollama-model-input');
                        AI_CONFIG.ollamaModel = (modelInput ? modelInput.value.trim() : '') || DEFAULT_OLLAMA_MODEL;
                    } else {
                        AI_CONFIG.ollamaModel = selVal;
                    }
                }
            }
            localStorage.setItem('AI_CONFIG', JSON.stringify(AI_CONFIG));
            updateApiKeyUI();
            showToast(`✓ ${AI_CONFIG.activeProvider.toUpperCase()} config saved!`);
            if (AI_CONFIG.activeProvider === 'ollama') {
                silentOllamaPing();
            }
        }

        async function testOllamaConnection() {
            // Auto-save current input before testing
            saveCurrentApiKey();
            const url = (AI_CONFIG.keys.ollama || DEFAULT_OLLAMA_URL).replace(/\/+$/, '');
            const model = AI_CONFIG.ollamaModel || DEFAULT_OLLAMA_MODEL;
            showToast('Testing connection...', 1500);
            try {
                const controller = new AbortController();
                const t = setTimeout(() => controller.abort(), 8000);
                const res = await fetch(`${url}/api/tags`, { signal: controller.signal });
                clearTimeout(t);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data = await res.json();
                const models = (data.models || []).map(m => m.name);
                if (!models.length) {
                    showToast(`⚠ Connected but no models installed. Run: ollama pull ${model}`, 5000);
                    return;
                }
                const cleanModel = model.toLowerCase();
                const hasModel = models.some(m => {
                    const mNorm = m.toLowerCase();
                    return mNorm === cleanModel || mNorm === cleanModel + ':latest' || mNorm.split(':')[0] === cleanModel.split(':')[0];
                });
                localDownloadedModels = models;
                updateLocalModelsList(models);
                if (hasModel) {
                    showToast(`✓ Saved & Connected. "${model}" is ready!`, 4000);
                } else {
                    showToast(`✓ Saved & Connected. Pull "${model}" first. Available: ${models.slice(0, 3).map(m => m.replace(/:latest$/, '')).join(', ')}`, 5000);
                }
            } catch (err) {
                if (err.name === 'AbortError') showToast('✗ Timeout — Ollama not responding', 4000);
                else showToast(`✗ ${err.message || 'Connection failed'}`, 4000);
            }
        }

        document.addEventListener('click', (e) => {
            const dropdown = document.getElementById('ai-tools-dropdown');
            const button = e.target.closest('button[onclick*="toggleAITools"]');
            if (!dropdown.contains(e.target) && !button) dropdown.classList.add('hidden');
        });

        // LOW-LEVEL AI SERVICE CALLS (GEMMA 3 & CLOUD APIS)
        // ============================================================
        async function callAI(action, text, extra = "", onChunk = null, abortSignal = null) {
            const provider = AI_CONFIG.activeProvider;
            const key = AI_CONFIG.keys[provider];

            const prompts = {
                summary: "Summarize this text using clean Markdown with headings, bullets, and bold terms. Do NOT use HTML tags like <sup> or <sub>. For math, write powers as x^2 (not x<sup>2</sup>), and partial derivatives as ∂f/∂x using plain Unicode symbols. Keep formatting mobile-friendly.",
                explain: "Explain in simple terms using clean Markdown. Use headings, bold key terms, bullet points. NEVER use HTML tags. For math: write x^2 instead of x<sup>2</sup>, use ∂ for partial derivatives, write fractions as a/b. Keep output concise and mobile-readable.",
                simplify: "Simplify this for a 10-year-old. Use simple Markdown only — no HTML tags. Use plain math notation (x^2, ∂f/∂x).",
                lecture: "Give a clean lecture with Introduction, Key Concepts, Summary. Use Markdown only (no HTML). Plain math notation only.",
                ask: "Answer this question using clean Markdown formatting. NEVER use HTML tags like <sup>, <sub>, <br>. Write math in plain Unicode: x², x³, ∂f/∂x, fractions as a/b. Use **bold** for key terms and bullet points for steps.",
                chat: "You are a friendly tutor. Answer using clean Markdown only. NEVER output raw HTML tags (no <sup>, <sub>, <br>, <div>). For math, use Unicode: x², x³, x⁴, ∂f/∂x, write fractions inline as numerator/denominator. Use **bold**, bullets, and numbered lists. Keep answers concise and mobile-friendly."
            };

            let systemPrompt = "";
            let prompt = "";

            if (action === 'quiz') {
                systemPrompt = "You are an educational assistant. Return ONLY a raw JSON array (starting with [ and ending with ]) of exactly 8 multiple-choice question objects. Do NOT wrap the array in an outer object. Do NOT add any keys like 'questions' or 'quiz'. Do NOT include markdown fences or commentary. Each object must have this exact schema:\n" +
                    "{\n" +
                    "  \"question\": \"...\",\n" +
                    "  \"options\": [\"A\", \"B\", \"C\", \"D\"],\n" +
                    "  \"answer\": 0,\n" +
                    "  \"explanation\": \"...\"\n" +
                    "}";
                prompt = "Text:\n" + text;
            } else if (action === 'cards') {
                systemPrompt = "You are an educational assistant. Return ONLY a raw JSON array (starting with [ and ending with ]) of exactly 8 flashcard objects. Do NOT wrap the array in an outer object. Do NOT add any keys like 'flashcards' or 'cards'. Do NOT include markdown fences or commentary. Each object must have this exact schema:\n" +
                    "{\n" +
                    "  \"front\": \"...\",\n" +
                    "  \"back\": \"...\"\n" +
                    "}";
                prompt = "Text:\n" + text;
            } else {
                systemPrompt = action === 'chat'
                    ? prompts.chat
                    : "You are an expert tutor. Format your output in beautiful, standard Markdown. Use headings, bullet points, blockquotes, code fragments, and bold phrases to make the information look premium, professional, and readable.";
                if (action === 'chat') {
                    prompt = extra + (text ? "\n\nContext (optional reference text):\n" + text : "");
                } else {
                    prompt = (prompts[action] || "Answer the following question about this text:") + (extra ? "\nQuestion: " + extra : "") + "\n\nText:\n" + text;
                }
            }

            const useStreaming = (action !== 'quiz' && action !== 'cards') && typeof onChunk === 'function';
            let url = "", body = {}, headers = { 'Content-Type': 'application/json' };

            if (provider === 'gemini') {
                if (useStreaming) {
                    url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:streamGenerateContent?alt=sse&key=${key}`;
                } else {
                    url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${key}`;
                }
                body = {
                    contents: [{
                        parts: [{
                            text: systemPrompt + "\n\n" + prompt
                        }]
                    }]
                };
            } else if (provider === 'openai' || provider === 'meta' || provider === 'deepseek') {
                url = provider === 'openai' ? "https://api.openai.com/v1/chat/completions"
                    : provider === 'deepseek' ? "https://api.deepseek.com/chat/completions"
                        : "https://api.groq.com/openai/v1/chat/completions";
                headers['Authorization'] = `Bearer ${key}`;
                body = {
                    model: provider === 'openai' ? "gpt-4o-mini" : provider === 'deepseek' ? "deepseek-chat" : "llama-3.1-70b-versatile",
                    messages: [
                        { role: "system", content: systemPrompt },
                        { role: "user", content: prompt }
                    ],
                    stream: useStreaming
                };
            } else if (provider === 'claude') {
                url = "https://api.anthropic.com/v1/messages";
                headers['x-api-key'] = key;
                headers['anthropic-version'] = '2023-06-01';
                body = {
                    model: "claude-3-5-sonnet-20240620",
                    max_tokens: 1536,
                    system: systemPrompt,
                    messages: [{ role: "user", content: prompt }],
                    stream: useStreaming
                };
            } else if (provider === 'ollama') {
                const baseUrl = (key || DEFAULT_OLLAMA_URL).replace(/\/+$/, '');
                url = `${baseUrl}/api/generate`;

                const MAX_INPUT_CHARS = 6000;
                let trimmedText = text;
                if (text && text.length > MAX_INPUT_CHARS) {
                    trimmedText = text.substring(0, MAX_INPUT_CHARS) + "\n\n[... text truncated for speed ...]";
                    if (action === 'chat') {
                        prompt = extra + (trimmedText ? "\n\nContext (optional reference text):\n" + trimmedText : "");
                    } else {
                        prompt = (prompts[action] || "Answer the following question about this text:") + (extra ? "\nQuestion: " + extra : "") + "\n\nText:\n" + trimmedText;
                    }
                    showToast(`Text trimmed to ${MAX_INPUT_CHARS} chars for faster response`, 2500);
                }

                const ollamaFormat = (action === 'quiz' || action === 'cards') ? "json" : "";

                body = {
                    model: AI_CONFIG.ollamaModel || DEFAULT_OLLAMA_MODEL,
                    prompt: systemPrompt + "\n\n" + prompt,
                    stream: useStreaming,
                    keep_alive: "10m",
                    options: {
                        num_ctx: 4096,
                        num_predict: 1536,
                        temperature: (action === 'quiz' || action === 'cards') ? 0.1 : 0.7,
                        top_k: 40,
                        top_p: 0.9
                    }
                };
                if (ollamaFormat) {
                    body.format = ollamaFormat;
                }

                try {
                    fetch(`${baseUrl}/api/generate`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            model: AI_CONFIG.ollamaModel || DEFAULT_OLLAMA_MODEL,
                            prompt: "hi",
                            stream: false,
                            keep_alive: "10m",
                            options: { num_predict: 1 }
                        })
                    }).catch(() => { });
                } catch (e) { }
            }

            const internalController = new AbortController();
            const timeoutId = setTimeout(() => internalController.abort(), provider === 'ollama' ? 300000 : 60000);
            const signal = abortSignal || internalController.signal;

            const response = await fetch(url, {
                method: 'POST',
                headers,
                body: JSON.stringify(body),
                signal
            });
            clearTimeout(timeoutId);

            if (!response.ok) {
                const errText = await response.text();
                throw new Error(`HTTP ${response.status}: ${errText.substring(0, 200)}`);
            }

            if (!useStreaming) {
                const data = await response.json();
                if (data.error) throw new Error(data.error.message || data.error || "API Error");

                let resText = "";
                if (provider === 'gemini') {
                    if (!data.candidates?.[0]?.content) {
                        throw new Error(`Blocked by Google Safety Settings: ${data.candidates?.[0]?.finishReason || 'Unknown Reason'}`);
                    }
                    resText = data.candidates[0].content.parts[0].text;
                }
                else if (provider === 'openai' || provider === 'meta' || provider === 'deepseek') resText = data.choices[0].message.content;
                else if (provider === 'claude') resText = data.content[0].text;
                else if (provider === 'ollama') resText = data.response;

                return resText;
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder('utf-8');
            let fullText = "";
            let buffer = "";

            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    buffer += decoder.decode(value, { stream: true });
                    let lines = buffer.split('\n');
                    buffer = lines.pop() || "";

                    for (let line of lines) {
                        line = line.trim();
                        if (!line) continue;

                        let chunkText = "";
                        if (provider === 'ollama') {
                            try {
                                const obj = JSON.parse(line);
                                if (obj.response) chunkText = obj.response;
                                if (obj.error) throw new Error(obj.error);
                            } catch (e) {
                                if (e.message && e.message !== 'Unexpected end of JSON input') {
                                    console.warn('Ollama parse:', e, 'Line:', line);
                                }
                            }
                        } else if (provider === 'openai' || provider === 'meta' || provider === 'deepseek') {
                            if (line.startsWith('data:')) {
                                const data = line.substring(5).trim();
                                if (data === '[DONE]') continue;
                                try {
                                    const obj = JSON.parse(data);
                                    const delta = obj.choices?.[0]?.delta?.content;
                                    if (delta) chunkText = delta;
                                } catch (e) { }
                            }
                        } else if (provider === 'gemini') {
                            if (line.startsWith('data:')) {
                                const data = line.substring(5).trim();
                                try {
                                    const obj = JSON.parse(data);
                                    const parts = obj.candidates?.[0]?.content?.parts;
                                    if (parts && parts[0]?.text) chunkText = parts[0].text;
                                } catch (e) { }
                            }
                        } else if (provider === 'claude') {
                            if (line.startsWith('data:')) {
                                const data = line.substring(5).trim();
                                try {
                                    const obj = JSON.parse(data);
                                    if (obj.type === 'content_block_delta' && obj.delta?.text) {
                                        chunkText = obj.delta.text;
                                    }
                                } catch (e) { }
                            }
                        }

                        if (chunkText) {
                            fullText += chunkText;
                            try { onChunk(chunkText, fullText); } catch (e) { console.warn('onChunk:', e); }
                        }
                    }
                }
            } finally {
                try { reader.releaseLock(); } catch (e) { }
            }

            return fullText;
        }

        // Main entry point for AI tasks
        async function processAI(action) {
            synth.cancel(); isPlaying = false; updateUI();
            document.getElementById('ai-tools-dropdown').classList.add('hidden');
            if (action === 'ask') {
                showChatView();
                return;
            }
            const provider = AI_CONFIG.activeProvider;
            const key = AI_CONFIG.keys[provider];
            let text = activeSelectedText;
            if (!text) text = (currentMode === 'pdf') ? pdfWords.join(" ") : document.getElementById('text-reader-display').innerText;
            if (provider !== 'ollama' && (!key || key.length < 10)) {
                return showToast(`Add your ${provider.toUpperCase()} key first`);
            }
            if (provider === 'ollama' && !key) {
                AI_CONFIG.keys.ollama = DEFAULT_OLLAMA_URL;
                localStorage.setItem('AI_CONFIG', JSON.stringify(AI_CONFIG));
            }
            if (!text.trim()) return showToast("No content to analyze");
            // Reset states
            _aiState.quiz = { questions: [], currentIndex: 0, score: 0, answered: false, userAnswer: null };
            _aiState.flashcards = { cards: [], currentIndex: 0, known: [], review: [] };
            _aiState.rawMarkdown = "";
            const modal = document.getElementById('ai-modal');
            const content = document.getElementById('modal-content');
            const title = document.getElementById('modal-title');
            modal.classList.remove('hidden');
            title.innerText = action.charAt(0).toUpperCase() + action.slice(1) + " (AI)";
            let extraQuery = "";
            if (action === 'ask') {
                extraQuery = prompt("What is your question about this text?");
                if (!extraQuery) { closeModal(); return; }
                title.innerText = "Q&A (AI)";
            }
            // For quiz/cards — keep loading spinner (no streaming)
            if (action === 'quiz' || action === 'cards') {
                content.className = "overflow-y-auto min-h-[200px] flex items-center justify-center p-6";
                content.innerHTML = `
                    <div class="ai-loading-state">
                        <div class="ai-loading-spinner"></div>
                        <div class="ai-loading-text">Consulting ${provider.toUpperCase()}...</div>
                    </div>
                `;
                try {
                    const resText = await callAI(action, text, extraQuery);
                    if (action === 'quiz') {
                        let parsedQuestions = null;
                        const jsonArr = extractJSON(resText);
                        if (jsonArr && Array.isArray(jsonArr)) parsedQuestions = normalizeQuizQuestions(jsonArr);
                        if (!parsedQuestions || parsedQuestions.length === 0) parsedQuestions = fallbackParseQuiz(resText);
                        _aiState.quiz.questions = parsedQuestions || [];
                        renderQuiz();
                    } else {
                        let parsedCards = null;
                        const jsonArr = extractJSON(resText);
                        if (jsonArr && Array.isArray(jsonArr)) parsedCards = normalizeFlashcards(jsonArr);
                        if (!parsedCards || parsedCards.length === 0) parsedCards = fallbackParseFlashcards(resText);
                        _aiState.flashcards.cards = parsedCards || [];
                        renderFlashcards();
                    }
                } catch (err) {
                    showAIError(err, provider, content);
                }
                return;
            }
            // STREAMING for explain / simplify / summary / lecture
            const modalFooter = document.getElementById('modal-footer');
            if (modalFooter) modalFooter.style.display = 'flex';
            content.className = "overflow-y-auto min-h-[200px] px-6 py-4";
            content.innerHTML = `
                <div class="ai-prose" id="streaming-prose">
                    <div class="chat-typing"><span></span><span></span><span></span></div>
                </div>
            `;
            const proseEl = document.getElementById('streaming-prose');
            let streamedContent = "";
            let firstChunk = true;
            // Auto-scroll behavior
            let userScrolledUp = false;
            const onContentScroll = () => {
                const dist = content.scrollHeight - content.clientHeight - content.scrollTop;
                userScrolledUp = (dist > 40);
            };
            content.addEventListener('scroll', onContentScroll, { passive: true });
            try {
                await callAI(action, text, extraQuery, (chunk, fullText) => {
                    if (firstChunk) {
                        firstChunk = false;
                        proseEl.innerHTML = "";
                    }
                    streamedContent = fullText;
                    proseEl.innerHTML = renderMarkdown(streamedContent).replace(/^<div class="ai-prose">|<\/div>$/g, '')
                        + '<span class="chat-streaming-cursor"></span>';
                    if (!userScrolledUp) content.scrollTop = content.scrollHeight;
                });
                _aiState.rawMarkdown = streamedContent;
                proseEl.innerHTML = renderMarkdown(streamedContent).replace(/^<div class="ai-prose">|<\/div>$/g, '');
                // Save to chat history so it persists in Ask AI
                const actionLabels = {
                    explain: '📖 Explain',
                    simplify: '✨ Simplify',
                    summary: '📝 Summary',
                    lecture: '🎓 Lecture'
                };
                const userLabel = actionLabels[action] || action;
                const contextSnippet = text.substring(0, 200);
                chatHistory.push({
                    role: 'user',
                    content: `${userLabel} the selected text`,
                    hasContext: true,
                    contextText: contextSnippet
                });
                chatHistory.push({
                    role: 'ai',
                    content: streamedContent
                });
                try { sessionStorage.setItem('chatHistory', JSON.stringify(chatHistory)); } catch (e) { }
            } catch (err) {
                showAIError(err, provider, content);
            } finally {
                content.removeEventListener('scroll', onContentScroll);
            }
        }

        function showAIError(err, provider, content) {
            let msg = err.message || String(err);
            if (err.name === 'AbortError') {
                msg = 'Request timed out. Check that Ollama is running and reachable.';
            } else if (provider === 'ollama' && /Failed to fetch|NetworkError|ERR_/i.test(msg)) {
                msg = `Cannot reach Ollama at ${AI_CONFIG.keys.ollama}.\n\nChecklist:\n1. Ollama is running\n2. Phone & PC on same Wi-Fi\n3. OLLAMA_HOST=0.0.0.0:11434\n4. Firewall allows port 11434`;
            }
            const modalFooter = document.getElementById('modal-footer');
            if (modalFooter) modalFooter.style.display = 'flex';
            content.className = "overflow-y-auto min-h-[200px] px-6 py-6";
            content.innerHTML = `
                <div class="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl text-sm font-semibold flex flex-col gap-2">
                    <div><i class="fas fa-circle-exclamation text-lg mr-1.5"></i> Error with ${provider.toUpperCase()}:</div>
                    <div class="font-normal text-xs whitespace-pre-wrap">${msg}</div>
                </div>
            `;
        }

        function closeModal() {
            synth.cancel();
            isPlaying = false;
            updateUI();
            document.getElementById('ai-modal').classList.add('hidden');
        }

        async function copyModalText(e) {
            let textToCopy = "";
            if (_aiState.rawMarkdown) {
                textToCopy = markdownToPlainText(_aiState.rawMarkdown);
            } else {
                textToCopy = document.getElementById('modal-content').innerText;
            }
            try { await universalCopy(textToCopy); } catch (err) { /* silent */ }
            const btn = e.currentTarget;
            const oldContent = btn.innerHTML;
            btn.innerHTML = '<i class="fas fa-check"></i> Copied!';
            showToast('✓ Copied to clipboard', 1500);
            setTimeout(() => btn.innerHTML = oldContent, 2000);
        }

        function openOutputInTextMode() {
            let textToLoad = "";
            if (_aiState.rawMarkdown) {
                textToLoad = markdownToPlainText(_aiState.rawMarkdown).trim();
            } else {
                textToLoad = document.getElementById('modal-content').innerText.trim();
            }
            if (!textToLoad) { showToast('Nothing to open'); return; }

            synth.cancel();
            isPlaying = false;
            isSelectionReading = false;
            activeSelectedText = "";
            selectionWordIndices = [];
            updateUI();

            closeModal();

            const editor = document.getElementById('text-editor');
            editor.value = textToLoad;

            switchMode('text');
            toggleTextEdit(false);
            textActiveIndex = -1;

            showToast('✓ Loaded in Text Mode', 2000);
        }

        function speakModalText() {
            synth.cancel();
            const text = document.getElementById('modal-content').innerText;
            // Build temporary word map for modal highlighting
            const words = text.split(/\s+/);
            readerTokenMeta.modal = words.map((w, i) => ({
                word: w,
                index: i,
                isModal: true
            }));
            isPlaying = true;
            updateUI();
            synth.speak(text, speed, currentVoice ? currentVoice.name : null);
        }

