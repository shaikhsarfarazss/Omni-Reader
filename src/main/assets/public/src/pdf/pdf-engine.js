// ============================================================
// PDF RENDERING ENGINE & ZOOM CONTROLLER
// ============================================================

let scale = 1;
let lastTouchDist = 0;
let currentX = 0;
let currentY = 0;
let pinchCenter = { x: 0, y: 0 };
let pageObserver = null;

function checkPdfJs() {
    if (typeof pdfjsLib === 'undefined') {
        window.retryCount = (window.retryCount || 0) + 1;
        if (window.retryCount < 10) {
            setTimeout(checkPdfJs, 300);
        } else {
            showToast('PDF.js library failed to load. Check assets.', 4000);
        }
    } else {
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'assets/pdfjs/pdf.worker.js';
    }
}

async function mountPageCanvas(wrapper, pageNum, targetWidth) {
    if (!pdfDoc || wrapper.querySelector('canvas') || wrapper.dataset.rendering === 'true') return;
    wrapper.dataset.rendering = 'true';
    try {
        const page = await pdfDoc.getPage(pageNum);
        const baseViewport = page.getViewport({ scale: 1.0 });
        const displayScale = targetWidth / baseViewport.width;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const renderViewport = page.getViewport({ scale: displayScale * dpr });

        const canvas = document.createElement('canvas');
        canvas.width = Math.floor(renderViewport.width);
        canvas.height = Math.floor(renderViewport.height);
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        await page.render({ canvasContext: ctx, viewport: renderViewport }).promise;

        const textLayer = wrapper.querySelector('.pdf-text-layer');
        if (textLayer) {
            wrapper.insertBefore(canvas, textLayer);
        } else {
            wrapper.appendChild(canvas);
        }
    } catch (e) {
        console.warn(`Page ${pageNum} render cancelled or failed:`, e);
    } finally {
        wrapper.dataset.rendering = 'false';
    }
}

function unmountPageCanvas(wrapper) {
    const canvas = wrapper.querySelector('canvas');
    if (canvas && wrapper.dataset.rendering !== 'true') {
        canvas.width = 0;
        canvas.height = 0;
        canvas.remove();
    }
}

async function renderPdf(file, keepExisting = false) {
    const container = document.getElementById('pdf-render-container');
    const view = document.getElementById('pdf-viewport-container');
    const scrollHost = document.getElementById('pdf-scroll-host');
    if (!container) return;

    // Disconnect and clean previous observer and canvases to free memory
    if (pageObserver) {
        pageObserver.disconnect();
        pageObserver = null;
    }
    container.querySelectorAll('canvas').forEach(c => {
        c.width = 0;
        c.height = 0;
    });

    try {
        if (!keepExisting) {
            if (!file) return;
            if (typeof pdfjsLib === 'undefined') {
                showToast('PDF engine still loading, please wait...', 2000);
                return;
            }
            pdfjsLib.GlobalWorkerOptions.workerSrc = 'assets/pdfjs/pdf.worker.js';
            lastPdfFile = file;
            lastSyncedPdf = null;
            const arrayBuffer = await file.arrayBuffer();
            pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        }

        if (!pdfDoc) return;

        container.innerHTML = '';
        pdfWords = [];
        readerTokenMeta.pdf = [];
        pdfActiveIndex = -1;
        lastHighlightedEl = null;

        const viewW = (view && view.clientWidth > 0) ? view.clientWidth - 24 : Math.max(window.innerWidth - 24, 300);

        // Setup Virtual Viewport IntersectionObserver
        if ('IntersectionObserver' in window) {
            pageObserver = new IntersectionObserver((entries) => {
                entries.forEach((entry) => {
                    const wrapper = entry.target;
                    const pageNum = parseInt(wrapper.dataset.pageNumber, 10);
                    const targetW = parseFloat(wrapper.dataset.targetWidth) || viewW;
                    if (entry.isIntersecting) {
                        mountPageCanvas(wrapper, pageNum, targetW);
                    } else {
                        unmountPageCanvas(wrapper);
                    }
                });
            }, {
                root: scrollHost || null,
                rootMargin: '600px 0px 600px 0px',
                threshold: 0.01
            });
        }

        const buildPageElement = async (pageNum, targetWidth) => {
            const page = await pdfDoc.getPage(pageNum);
            const baseViewport = page.getViewport({ scale: 1.0 });
            const displayScale = targetWidth / baseViewport.width;
            const displayViewport = page.getViewport({ scale: displayScale });

            const wrapper = document.createElement('div');
            wrapper.className = 'pdf-page-wrapper';
            wrapper.dataset.pageNumber = String(pageNum);
            wrapper.dataset.targetWidth = String(targetWidth);
            wrapper.style.aspectRatio = `${baseViewport.width} / ${baseViewport.height}`;
            wrapper.style.minHeight = `${Math.round(baseViewport.height * displayScale)}px`;
            wrapper.style.position = 'relative';

            // Extract text & create word spans for TTS sync + selection
            const textLayer = document.createElement('div');
            textLayer.className = 'pdf-text-layer';
            try {
                const textContent = await page.getTextContent();
                for (const item of textContent.items) {
                    if (!item.str || !item.str.trim()) continue;
                    const tx = pdfjsLib.Util.transform(displayViewport.transform, item.transform);
                    const fontHeight = Math.hypot(tx[2], tx[3]) || 12;
                    const leftPct = (tx[4] / displayViewport.width) * 100;
                    const topPct = ((tx[5] - fontHeight) / displayViewport.height) * 100;
                    const itemWidthPct = ((item.width * displayScale) / displayViewport.width) * 100;
                    const itemHeightPct = (fontHeight / displayViewport.height) * 100;

                    const tokens = item.str.split(/\s+/).filter(Boolean);
                    const totalChars = tokens.reduce((s, t) => s + t.length, 0) || 1;
                    let cursorPct = leftPct;

                    tokens.forEach((word) => {
                        const idx = pdfWords.length;
                        pdfWords.push(word);
                        const wordWPct = Math.max(0.8, (word.length / totalChars) * itemWidthPct);

                        const span = document.createElement('span');
                        span.id = `pdf-word-${idx}`;
                        span.className = 'word-span';
                        span.textContent = word;
                        span.style.left = `${cursorPct.toFixed(3)}%`;
                        span.style.top = `${topPct.toFixed(3)}%`;
                        span.style.width = `${wordWPct.toFixed(3)}%`;
                        span.style.height = `${Math.max(1.2, itemHeightPct * 1.15).toFixed(3)}%`;
                        span.style.fontSize = `${Math.max(8, fontHeight)}px`;
                        span.onclick = (e) => {
                            e.stopPropagation();
                            jumpToWord(idx);
                        };

                        readerTokenMeta.pdf[idx] = { index: idx, text: word, elementId: span.id, mode: 'pdf', page: pageNum };
                        textLayer.appendChild(span);
                        cursorPct += wordWPct + (itemWidthPct * 0.05);
                    });
                }
            } catch (textErr) {
                console.warn(`Text extraction failed on page ${pageNum}:`, textErr);
            }

            wrapper.appendChild(textLayer);

            // Register with IntersectionObserver for virtual canvas mount/unmount
            if (pageObserver) {
                pageObserver.observe(wrapper);
            } else {
                // Fallback: render immediately if IntersectionObserver unavailable
                await mountPageCanvas(wrapper, pageNum, targetWidth);
            }

            return wrapper;
        };

        if (isTwoPage) {
            const pairTargetW = Math.max((viewW - 12) / 2, 140);
            let i = 1;
            if (twoPageOption === 2 && pdfDoc.numPages >= 1) {
                const row = document.createElement('div');
                row.className = 'pdf-two-page-row';
                row.appendChild(await buildPageElement(1, pairTargetW));
                container.appendChild(row);
                i = 2;
            }
            for (; i <= pdfDoc.numPages; i += 2) {
                const row = document.createElement('div');
                row.className = 'pdf-two-page-row';
                row.appendChild(await buildPageElement(i, pairTargetW));
                if (i + 1 <= pdfDoc.numPages) {
                    row.appendChild(await buildPageElement(i + 1, pairTargetW));
                }
                container.appendChild(row);
            }
        } else {
            for (let i = 1; i <= pdfDoc.numPages; i++) {
                container.appendChild(await buildPageElement(i, viewW));
            }
        }

        updateWordCountBadge(pdfWords.length);
        applyPdfScale();
    } catch (err) {
        console.error('PDF Render Error:', err);
        showToast('Failed to load PDF: ' + (err.message || 'Unknown error'), 4000);
    }
}

function applyPdfScale() {
    const content = document.getElementById('pdf-render-container');
    if (content) content.style.width = Math.round(100 * scale) + '%';
    const label = document.getElementById('pdf-zoom-level');
    if (label) label.innerText = Math.round(scale * 100) + '%';
}

function updateTransform() { applyPdfScale(); }
function getBounds() { return { minX: 0, minY: 0, maxX: 0, maxY: 0 }; }
function applyRubberBand(v, mn, mx) { return Math.max(mn, Math.min(mx, v)); }

function adjustPdfZoom(multiplier) {
    scale = Math.min(Math.max(scale * multiplier, 0.4), 5);
    applyPdfScale();
}

function resetPdfZoom() {
    scale = 1;
    applyPdfScale();
    const scrollHost = document.getElementById('pdf-scroll-host');
    if (scrollHost) scrollHost.scrollTo({ top: 0, behavior: 'smooth' });
}

(function initPdfGestures() {
    const view = document.getElementById('pdf-viewport-container');
    const scrollHost = document.getElementById('pdf-scroll-host');
    if (!view || !scrollHost) return;

    view.addEventListener('wheel', (e) => {
        if (e.ctrlKey) {
            e.preventDefault();
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
                void scrollHost.scrollWidth;
                scrollHost.scrollLeft = (contentX * factor) - cx;
                scrollHost.scrollTop = (contentY * factor) - cy;
            }
        }
    }, { passive: false });

    view.addEventListener('touchstart', (e) => {
        if (e.touches.length === 2) {
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            lastTouchDist = Math.sqrt(dx * dx + dy * dy);
            const rect = scrollHost.getBoundingClientRect();
            pinchCenter.x = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
            pinchCenter.y = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;
        }
    }, { passive: true });

    view.addEventListener('touchmove', (e) => {
        if (e.touches.length === 2 && lastTouchDist > 0) {
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
                void scrollHost.scrollWidth;
                scrollHost.scrollLeft = (contentX * factor) - pinchCenter.x;
                scrollHost.scrollTop = (contentY * factor) - pinchCenter.y;
            }
            lastTouchDist = dist;
        }
    }, { passive: false });

    view.addEventListener('touchend', () => {
        lastTouchDist = 0;
    }, { passive: true });
})();
