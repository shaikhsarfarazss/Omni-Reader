// ============================================================
// OCR ENGINE (Tesseract.js Offline) & DUAL-VIEW PANEL
// ============================================================

let selectedPages = [];
let ocrAborted = false;
const _ocrState = {
    plainText: '',
    layoutHtml: '',
    view: 'text'
};

function promptOCRChoice() {
    if (!pdfDoc && currentMode !== 'edit') {
        showToast('Please upload a PDF first.', 2500);
        return;
    }
    const modal = document.getElementById('ocr-choice-modal');
    if (modal) modal.classList.remove('hidden');
}

function closeOCRChoice() {
    const modal = document.getElementById('ocr-choice-modal');
    if (modal) modal.classList.add('hidden');
}

async function showPageSelector() {
    closeOCRChoice();
    const picker = document.getElementById('ocr-page-picker');
    const grid = document.getElementById('page-picker-grid');
    if (!picker || !grid) return;
    picker.classList.remove('hidden');

    selectedPages = [];
    updatePageSelectionUI();

    if (!pdfDoc) {
        grid.innerHTML = '<div class="col-span-full text-center text-gray-400 py-20 font-bold">No multi-page document found.</div>';
        return;
    }

    grid.innerHTML = '';
    for (let i = 1; i <= pdfDoc.numPages; i++) {
        const item = document.createElement('div');
        item.className = 'group relative flex flex-col items-center gap-3 cursor-pointer select-none';

        let pressTimer;
        let wasPreviewed = false;

        const startPress = () => {
            wasPreviewed = false;
            clearTimeout(pressTimer);
            pressTimer = setTimeout(() => {
                wasPreviewed = true;
                showPagePreview(i);
            }, 600);
        };
        const cancelPress = () => clearTimeout(pressTimer);

        item.addEventListener('mousedown', startPress);
        item.addEventListener('touchstart', startPress, { passive: true });
        item.addEventListener('mouseup', () => {
            cancelPress();
            if (wasPreviewed) closePagePreview();
        });
        item.addEventListener('touchend', () => {
            cancelPress();
            if (wasPreviewed) closePagePreview();
        });
        item.addEventListener('mouseleave', cancelPress);
        item.onclick = () => {
            if (!wasPreviewed) togglePageSelection(i);
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

    // Render thumbnails with bounded concurrency (max 2 parallel tasks) to prevent memory spikes
    const renderThumbnail = async (pageIdx) => {
        try {
            const page = await pdfDoc.getPage(pageIdx);
            const canvas = document.getElementById(`thumb-canvas-${pageIdx}`);
            if (canvas) {
                const viewport = page.getViewport({ scale: 0.3 });
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
            }
        } catch (e) {
            console.warn(`Thumbnail render failed for page ${pageIdx}:`, e);
        }
    };

    const queue = Array.from({ length: pdfDoc.numPages }, (_, idx) => idx + 1);
    const worker = async () => {
        while (queue.length > 0) {
            const pageIdx = queue.shift();
            await renderThumbnail(pageIdx);
        }
    };
    await Promise.all([worker(), worker()]);
}

async function showPagePreview(pageNum) {
    const modal = document.getElementById('ocr-page-preview-modal');
    const img = document.getElementById('page-preview-img');
    const label = document.getElementById('preview-page-label');
    if (!modal || !img || !label || !pdfDoc) return;

    label.innerText = `Page ${pageNum}`;
    modal.classList.remove('hidden');

    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1.5 });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    img.src = canvas.toDataURL();
}

function closePagePreview() {
    const modal = document.getElementById('ocr-page-preview-modal');
    if (modal) modal.classList.add('hidden');
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
        const check = el.querySelector('.check-icon');
        if (check) check.classList.add('opacity-0', 'scale-50');
    });

    selectedPages.forEach(page => {
        const el = document.getElementById(`page-thumb-${page}`);
        if (el) {
            el.classList.add('border-indigo-600', 'bg-indigo-50/50', 'ring-4', 'ring-indigo-100');
            const check = el.querySelector('.check-icon');
            if (check) check.classList.remove('opacity-0', 'scale-50');
        }
    });

    const countEl = document.getElementById('selected-page-count');
    if (countEl) countEl.innerText = String(selectedPages.length);
    const startBtn = document.getElementById('start-ocr-btn');
    if (startBtn) startBtn.disabled = selectedPages.length === 0;
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
    const picker = document.getElementById('ocr-page-picker');
    if (picker) picker.classList.add('hidden');
}

function startFullOCR() {
    closeOCRChoice();
    if (pdfDoc) {
        const pages = [];
        for (let i = 1; i <= pdfDoc.numPages; i++) pages.push(i);
        performOCR(pages);
    } else if (currentMode === 'edit' && fabricCanvas) {
        performOCR([null]);
    }
}

function startSelectedOCR() {
    if (!selectedPages.length) return;
    closePagePicker();
    performOCR([...selectedPages].sort((a, b) => a - b));
}

function cancelOCR() {
    ocrAborted = true;
    hideOCRLoading();
}

function showOCRLoading(text = 'Initializing...') {
    const toolbarStatus = document.getElementById('ocr-status-container');
    if (toolbarStatus) toolbarStatus.classList.remove('opacity-0', 'pointer-events-none');
    const progText = document.getElementById('ocr-progress-text');
    if (progText) progText.innerText = text;
    updateOCRProgress(0);
}

function hideOCRLoading() {
    const toolbarStatus = document.getElementById('ocr-status-container');
    if (toolbarStatus) toolbarStatus.classList.add('opacity-0', 'pointer-events-none');

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
    const p = Math.max(0, Math.min(100, percent));
    const circumference = 2 * Math.PI * 40;
    const offset = circumference - (p / 100 * circumference);

    const tbCircle = document.getElementById('ocr-toolbar-progress-circle');
    const tbText = document.getElementById('ocr-toolbar-perc');
    if (tbCircle) tbCircle.style.strokeDashoffset = offset;
    if (tbText) tbText.innerText = `${Math.round(p)}%`;

    const circle = document.getElementById('ocr-progress-circle');
    const percText = document.getElementById('ocr-percentage');
    if (circle) circle.style.strokeDashoffset = offset;
    if (percText) percText.innerText = `${Math.round(p)}%`;
}

async function performOCR(pages) {
    if (typeof Tesseract === 'undefined') {
        showToast('OCR engine (Tesseract) is not loaded.', 3000);
        return;
    }
    ocrAborted = false;
    showOCRLoading('Preparing Pages...');
    let combinedLayoutHtml = '';
    const plainPages = [];

    try {
        for (let i = 0; i < pages.length; i++) {
            if (ocrAborted) break;
            const pageNum = pages[i];
            const displayNum = pageNum || 'Edit Canvas';

            let source;
            if (pageNum === null) {
                source = fabricCanvas.toDataURL({ format: 'png', multiplier: 2 });
            } else {
                const page = await pdfDoc.getPage(pageNum);
                const viewport = page.getViewport({ scale: 2.0 });
                const canvas = document.createElement('canvas');
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                await page.render({ canvasContext: ctx, viewport }).promise;
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
                        const progText = document.getElementById('ocr-progress-text');
                        if (progText) progText.innerText = `Scanning Page ${i + 1}/${pages.length}`;
                    }
                }
            });

            if (ocrAborted) break;

            const pageText = (result && result.data && result.data.text) ? result.data.text.trim() : '';
            plainPages.push(`--- Page ${displayNum} ---\n${pageText}`);

            const pageLayout = document.createElement('div');
            pageLayout.className = 'ocr-page-layout mb-10 relative bg-white shadow-sm border border-gray-100 rounded-lg overflow-hidden';

            let sW = 800, sH = 1100;
            if (source instanceof HTMLCanvasElement) {
                sW = source.width / 2;
                sH = source.height / 2;
            }
            pageLayout.style.width = `${sW}px`;
            pageLayout.style.height = `${sH}px`;
            pageLayout.style.margin = '0 auto 2rem auto';

            const pageLabel = document.createElement('div');
            pageLabel.className = 'absolute top-2 left-2 px-3 py-1 bg-black/5 rounded font-black text-[9px] uppercase tracking-widest text-gray-400 z-10 pointer-events-none';
            pageLabel.innerText = `OCR Page ${displayNum}`;
            pageLayout.appendChild(pageLabel);

            (result.data.words || []).forEach(word => {
                const span = document.createElement('span');
                span.innerText = word.text;
                span.className = 'absolute whitespace-nowrap leading-none transition-colors hover:bg-indigo-50 hover:text-indigo-600 cursor-default';
                const box = word.bbox;
                const scaleF = 0.5;
                const l = box.x0 * scaleF;
                const t = box.y0 * scaleF;
                const w = (box.x1 - box.x0) * scaleF;
                const h = (box.y1 - box.y0) * scaleF;

                span.style.left = `${l}px`;
                span.style.top = `${t}px`;
                span.style.width = `${w}px`;
                span.style.height = `${h}px`;
                span.style.fontSize = `${Math.max(8, h * 0.9)}px`;
                pageLayout.appendChild(span);
            });

            combinedLayoutHtml += pageLayout.outerHTML;
        }

        if (!ocrAborted) {
            _ocrState.plainText = plainPages.join('\n\n').trim();
            _ocrState.layoutHtml = combinedLayoutHtml;

            const panel = document.getElementById('ocr-result-panel');
            if (panel) panel.classList.remove('translate-y-full');
            setOCRView(_ocrState.view || 'text');
        }
    } catch (err) {
        console.error('OCR Error:', err);
        showToast('OCR Failed: ' + (err.message || 'Unknown error'), 4000);
    } finally {
        hideOCRLoading();
    }
}

function setOCRView(view) {
    _ocrState.view = view === 'layout' ? 'layout' : 'text';
    const ocrDisplay = document.getElementById('ocr-content');
    const btnText = document.getElementById('btn-ocr-text-view');
    const btnLayout = document.getElementById('btn-ocr-layout-view');
    if (!ocrDisplay) return;

    if (btnText && btnLayout) {
        if (_ocrState.view === 'text') {
            btnText.className = 'w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center transition-all shadow-sm';
            btnLayout.className = 'w-10 h-10 rounded-xl bg-gray-50 text-gray-400 flex items-center justify-center transition-all';
        } else {
            btnLayout.className = 'w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center transition-all shadow-sm';
            btnText.className = 'w-10 h-10 rounded-xl bg-gray-50 text-gray-400 flex items-center justify-center transition-all';
        }
    }

    if (_ocrState.view === 'text') {
        ocrDisplay.className = 'h-full p-8 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed font-mono text-gray-700 select-text';
        ocrDisplay.style.padding = '';
        ocrDisplay.textContent = _ocrState.plainText || 'No text extracted.';
    } else {
        ocrDisplay.className = 'h-full overflow-y-auto text-gray-700';
        ocrDisplay.style.padding = '24px 12px';
        ocrDisplay.innerHTML = _ocrState.layoutHtml || '<div class="p-8 text-center text-gray-400">No layout data available.</div>';

        const panelW = Math.max(ocrDisplay.clientWidth, 300);
        ocrDisplay.querySelectorAll('.ocr-page-layout').forEach(l => {
            const nativeW = parseFloat(l.style.width) || 800;
            const scaleF = Math.min(1, (panelW - 40) / nativeW);
            l.style.transform = `scale(${scaleF})`;
            l.style.transformOrigin = 'top center';
            const nativeH = parseFloat(l.style.height) || 1100;
            l.style.marginBottom = `${(nativeH * (scaleF - 1)) + 32}px`;
        });
    }
}

function runOCR() {
    promptOCRChoice();
}

function closeOCRPanel() {
    const panel = document.getElementById('ocr-result-panel');
    if (panel) panel.classList.add('translate-y-full');
}

async function copyOCRText() {
    const content = document.getElementById('ocr-content');
    const text = _ocrState.plainText || (content ? (content.innerText || content.textContent) : '');
    if (!text || !text.trim()) {
        showToast('Nothing to copy', 1500);
        return;
    }
    const ok = await universalCopy(text);
    showToast(ok ? '✓ Extracted text copied' : 'Failed to copy text', 1800);
}

function initOCRResizing() {
    const panel = document.getElementById('ocr-result-panel');
    const handle = document.getElementById('ocr-resize-handle');
    if (!handle || !panel) return;

    let isResizing = false;
    handle.addEventListener('mousedown', () => {
        isResizing = true;
        panel.style.transition = 'none';
        document.body.style.cursor = 'ns-resize';
        document.body.classList.add('select-none');
    });

    window.addEventListener('mousemove', (e) => {
        if (!isResizing) return;
        const vh = window.innerHeight;
        const newHeight = vh - e.clientY;
        if (newHeight >= vh * 0.1 && newHeight <= vh) {
            panel.style.height = `${newHeight}px`;
        }
    });

    window.addEventListener('mouseup', () => {
        if (isResizing) {
            isResizing = false;
            panel.style.transition = 'transform 0.3s ease';
            document.body.style.cursor = 'default';
            document.body.classList.remove('select-none');
        }
    });
}
