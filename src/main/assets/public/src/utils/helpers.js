// ============================================================
// SHARED UTILITIES & MARKDOWN RENDERER
// ============================================================

let _toastTimer = null;
function showToast(message, duration = 3000) {
    const container = document.getElementById('toast-container');
    const text = document.getElementById('toast-text');
    if (!container || !text) return;
    text.innerText = message;
    container.style.opacity = '1';
    if (_toastTimer) clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => {
        container.style.opacity = '0';
    }, duration);
}

async function universalCopy(text) {
    if (!text) return false;
    try {
        if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Clipboard) {
            await window.Capacitor.Plugins.Clipboard.write({ string: text });
            return true;
        }
    } catch (e) { /* fall through */ }

    try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(text);
            return true;
        }
    } catch (e) { /* fall through */ }

    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
        document.execCommand('copy');
        return true;
    } finally {
        document.body.removeChild(ta);
    }
}

function hexToRgba(hex, alpha) {
    if (!hex || hex === 'transparent') return 'rgba(0,0,0,0)';
    const clean = hex.replace('#', '');
    const full = clean.length === 3
        ? clean.split('').map(c => c + c).join('')
        : clean;
    const r = parseInt(full.slice(0, 2), 16) || 0;
    const g = parseInt(full.slice(2, 4), 16) || 0;
    const b = parseInt(full.slice(4, 6), 16) || 0;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function escapeHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function renderMarkdown(md) {
    if (!md) return '<div class="ai-prose"></div>';
    let html = escapeHtml(md);

    // Code blocks ```...```
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
        return `<pre><code>${code.trim()}</code></pre>`;
    });

    // Inline code `...`
    html = html.replace(/`([^`\n]+)`/g, '<code>$1</code>');

    // Headings
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

    // Blockquotes
    html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');

    // Bold & Italic
    html = html.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>');
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');

    // Unordered lists
    html = html.replace(/(?:^(?:-|\*) .+(?:\n|$))+/gm, (block) => {
        const items = block.trim().split('\n').map(l => `<li>${l.replace(/^(?:-|\*) /, '')}</li>`).join('');
        return `<ul>${items}</ul>`;
    });

    // Ordered lists
    html = html.replace(/(?:^\d+\. .+(?:\n|$))+/gm, (block) => {
        const items = block.trim().split('\n').map(l => `<li>${l.replace(/^\d+\. /, '')}</li>`).join('');
        return `<ol>${items}</ol>`;
    });

    // Paragraphs
    html = html.split(/\n{2,}/).map(chunk => {
        const trimmed = chunk.trim();
        if (!trimmed) return '';
        if (/^<(h1|h2|h3|ul|ol|pre|blockquote)/.test(trimmed)) return trimmed;
        return `<p>${trimmed.replace(/\n/g, '<br>')}</p>`;
    }).join('');

    return `<div class="ai-prose">${html}</div>`;
}

function markdownToPlainText(md) {
    if (!md) return '';
    return String(md)
        .replace(/```[\s\S]*?```/g, (m) => m.replace(/```\w*\n?/g, '').replace(/```/g, ''))
        .replace(/`([^`]+)`/g, '$1')
        .replace(/^#{1,6}\s+/gm, '')
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/\*([^*]+)\*/g, '$1')
        .replace(/^>\s+/gm, '')
        .replace(/^[-*]\s+/gm, '• ')
        .trim();
}
