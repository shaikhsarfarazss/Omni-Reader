// ============================================================
// ASK AI CHAT VIEW
// ============================================================

let _chatAbortController = null;
let _isChatSending = false;

function showChatView() {
    const chatView = document.getElementById('chat-view');
    if (!chatView) return;
    chatView.classList.remove('hidden');
    chatView.classList.add('flex');

    const providerLabel = document.getElementById('chat-provider-label');
    if (providerLabel) {
        const p = AI_CONFIG.activeProvider || 'ollama';
        providerLabel.innerText = p === 'ollama'
            ? `Powered by Ollama (${AI_CONFIG.ollamaModel || DEFAULT_OLLAMA_MODEL})`
            : `Powered by ${p.charAt(0).toUpperCase() + p.slice(1)}`;
    }

    renderChatContextPill();
    renderChatMessages();

    const input = document.getElementById('chat-input');
    if (input) setTimeout(() => input.focus(), 100);
}

function closeChatView() {
    if (_chatAbortController) {
        try { _chatAbortController.abort(); } catch (e) {}
        _chatAbortController = null;
    }
    _isChatSending = false;
    const chatView = document.getElementById('chat-view');
    if (chatView) {
        chatView.classList.add('hidden');
        chatView.classList.remove('flex');
    }
}

function clearChatHistory() {
    chatHistory = [];
    try { sessionStorage.removeItem('chatHistory'); } catch (e) {}
    renderChatMessages();
    showToast('Chat cleared', 1500);
}

function renderChatContextPill() {
    const container = document.getElementById('chat-context-pill-container');
    if (!container) return;
    const docText = activeSelectedText || (currentMode === 'pdf' ? pdfWords.join(' ') : (document.getElementById('text-reader-display')?.innerText || ''));
    if (docText && docText.trim()) {
        const label = activeSelectedText ? 'Using selected text' : 'Using current document';
        container.innerHTML = `<div class="chat-context-pill"><i class="fas fa-file-lines"></i><span>${label}</span></div>`;
    } else {
        container.innerHTML = '';
    }
}

function renderChatMessages() {
    const box = document.getElementById('chat-messages');
    if (!box) return;
    if (!chatHistory.length) {
        box.innerHTML = `
            <div class="m-auto text-center max-w-xs text-gray-400 flex flex-col items-center gap-3 py-12">
                <div class="w-14 h-14 rounded-2xl bg-pink-50 text-pink-500 flex items-center justify-center text-xl">
                    <i class="fas fa-sparkles"></i>
                </div>
                <div class="text-sm font-bold text-gray-600">Ask anything about your document</div>
                <div class="text-xs leading-relaxed">Select text in the reader or ask general questions about the loaded PDF or notes.</div>
            </div>
        `;
        return;
    }

    box.innerHTML = chatHistory.map(msg => {
        if (msg.role === 'user') {
            return `<div class="chat-bubble chat-bubble-user">${escapeHtml(msg.content)}</div>`;
        }
        return `<div class="chat-bubble chat-bubble-ai">${renderMarkdown(msg.content)}</div>`;
    }).join('');
    box.scrollTop = box.scrollHeight;
}

function autoGrowChatInput(el) {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
}

function handleChatKeydown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendChatMessage();
    }
}

async function sendChatMessage() {
    if (_isChatSending) return;
    const input = document.getElementById('chat-input');
    const sendBtn = document.getElementById('chat-send-btn');
    const box = document.getElementById('chat-messages');
    if (!input || !box) return;

    const query = input.value.trim();
    if (!query) return;

    const provider = AI_CONFIG.activeProvider;
    const key = AI_CONFIG.keys[provider];
    if (provider !== 'ollama' && (!key || key.length < 10)) {
        showToast(`Add your ${provider.toUpperCase()} key in AI menu first`, 3000);
        return;
    }

    input.value = '';
    input.style.height = 'auto';
    _isChatSending = true;
    if (sendBtn) sendBtn.disabled = true;

    const contextText = activeSelectedText
        || (currentMode === 'pdf' ? pdfWords.join(' ') : (document.getElementById('text-reader-display')?.innerText || ''));

    chatHistory.push({ role: 'user', content: query });
    renderChatMessages();

    const aiBubble = document.createElement('div');
    aiBubble.className = 'chat-bubble chat-bubble-ai';
    aiBubble.innerHTML = `<div class="chat-typing"><span></span><span></span><span></span></div>`;
    box.appendChild(aiBubble);
    box.scrollTop = box.scrollHeight;

    _chatAbortController = new AbortController();
    let streamed = '';

    try {
        await callAI('chat', contextText.substring(0, 6000), query, (chunk, fullText) => {
            streamed = fullText;
            aiBubble.innerHTML = renderMarkdown(streamed) + '<span class="chat-streaming-cursor"></span>';
            box.scrollTop = box.scrollHeight;
        }, _chatAbortController.signal);

        aiBubble.innerHTML = renderMarkdown(streamed);
        chatHistory.push({ role: 'ai', content: streamed });
        try { sessionStorage.setItem('chatHistory', JSON.stringify(chatHistory)); } catch (e) {}
    } catch (err) {
        if (err.name === 'AbortError') return;
        const msg = err.message || String(err);
        aiBubble.innerHTML = `<div class="text-red-600 text-xs font-semibold">Error: ${escapeHtml(msg)}</div>`;
    } finally {
        _isChatSending = false;
        _chatAbortController = null;
        if (sendBtn) sendBtn.disabled = false;
    }
}
