// ============================================================
// FABRIC.JS ANNOTATION EDITOR, ERASER, SHAPES & PDF EXPORT
// ============================================================

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
const SHAPE_COLORS = [
    '#ef4444', '#f97316', '#f59e0b', '#84cc16', '#22c55e', '#10b981',
    '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1', '#8b5cf6', '#d946ef',
    '#f43f5e', '#ffffff', '#9ca3af', '#000000', 'transparent'
];

let currentPenColor = '#ed1c24';
let currentPenSize = 3;
let currentHighlighterColor = '#ffff00';
let currentHighlighterSize = 25;
let currentEraserSize = 30;
let isEraserActive = false;
let currentShapeColor = '#3b82f6';
let currentShapeStrokeWidth = 3;

let _editorResizeObserver = null;
let _editScrollerDocListenersBound = false;
let isSyncing = false;
let isRestoringHistory = false;
let lastSyncedPdf = null;
let eraserCursorObject = null;
let _activeToolPanel = null;

function initEditor() {
    if (fabricCanvas) {
        try {
            const el = fabricCanvas.getElement();
            if (el && el.parentNode && document.contains(el)) {
                return;
            }
            fabricCanvas.dispose();
            fabricCanvas = null;
        } catch (e) {
            try { fabricCanvas.dispose(); } catch (ex) {}
            fabricCanvas = null;
        }
    }

    if (typeof fabric === 'undefined') {
        showToast('Editor library (Fabric.js) not loaded.', 3000);
        return;
    }

    fabricCanvas = new fabric.Canvas('editor-canvas', {
        renderOnAddRemove: false,
        stateful: false,
        objectCaching: true,
        imageSmoothingEnabled: true,
        preserveObjectStacking: true,
        allowTouchScrolling: false,
        skipOffscreen: true,
        enableRetinaCanvas: true
    });

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

    fabricCanvas.on('object:added', () => {
        if (!isDrawingShape) saveHistory();
    });
    fabricCanvas.on('object:modified', saveHistory);
    fabricCanvas.on('selection:created', onObjectSelected);
    fabricCanvas.on('selection:updated', onObjectSelected);
    fabricCanvas.on('selection:cleared', onSelectionCleared);

    // Edit Mode Fast Scroller
    (function initEditFastScroller() {
        const scroller = document.getElementById('edit-fast-scroller');
        const handle = document.getElementById('edit-fast-scroller-handle');
        const indicator = document.getElementById('edit-fast-scroller-indicator');
        if (!scroller || !handle || !indicator) return;

        let isDraggingHandle = false;
        let lastPage = -1;
        let hideTimer = null;

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
            if (editorTool !== 'select' && editorTool !== 'crop') {
                scroller.classList.remove('visible');
                return;
            }
            const info = getEditScrollInfo();
            if (!info || info.maxScroll <= 0) { scroller.classList.remove('visible'); return; }

            const { viewH, scrolled, maxScroll } = info;
            const trackH = Math.max(1, viewH - 56);
            const scrollRatio = scrolled / maxScroll;
            handle.style.top = Math.max(0, Math.min(scrollRatio * trackH, trackH)) + 'px';

            const total = pdfDoc ? pdfDoc.numPages : 1;
            const pageNum = Math.max(1, Math.min(Math.ceil(scrollRatio * total) || 1, total));
            if (pageNum !== lastPage) {
                indicator.textContent = `${pageNum} / ${total}`;
                lastPage = pageNum;
            }
            showEditScroller();
        }

        fabricCanvas.on('after:render', () => {
            if (!isDraggingHandle) updateEditFastScroller();
        });

        handle.onmousedown = handle.ontouchstart = (e) => {
            isDraggingHandle = true;
            handle.style.transition = 'none';
            e.stopPropagation();
            e.preventDefault();
        };

        if (!_editScrollerDocListenersBound) {
            _editScrollerDocListenersBound = true;
            const onMove = (e) => {
                if (!isDraggingHandle || !fabricCanvas) return;
                e.preventDefault();
                const clientY = e.touches ? e.touches[0].clientY : e.clientY;
                const info = getEditScrollInfo();
                if (!info) return;
                const containerEl = document.getElementById('editor-container');
                const rect = containerEl ? containerEl.getBoundingClientRect() : { top: 0 };
                const relativeY = clientY - rect.top;
                const trackH = Math.max(1, info.viewH - 56);
                const ratio = Math.max(0, Math.min((relativeY - 28) / trackH, 1));
                fabricCanvas.viewportTransform[5] = -(ratio * info.maxScroll);
                fabricCanvas.requestRenderAll();
                updateEditFastScroller();
            };
            const onEnd = () => {
                if (isDraggingHandle) {
                    isDraggingHandle = false;
                    handle.style.transition = '';
                }
            };
            document.addEventListener('mousemove', onMove);
            document.addEventListener('touchmove', onMove, { passive: false });
            document.addEventListener('mouseup', onEnd);
            document.addEventListener('touchend', onEnd);
        }
    })();

    // Single-finger touch pan in select mode
    (function initEditTouchPan() {
        const canvasEl = fabricCanvas.upperCanvasEl;
        if (!canvasEl) return;
        let touchStartX = 0, touchStartY = 0;
        let panActive = false;
        let touchStartedOnObject = false;

        canvasEl.addEventListener('touchstart', (e) => {
            if (e.touches.length !== 1) return;
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
            panActive = false;
            const hitObj = fabricCanvas.findTarget(e.touches[0], false);
            touchStartedOnObject = !!(hitObj && hitObj.selectable && !hitObj.isPdfBackground);
        }, { passive: true });

        canvasEl.addEventListener('touchmove', (e) => {
            if (e.touches.length !== 1) return;
            if (editorTool !== 'select' || activeShapeType) return;
            if (touchStartedOnObject || fabricCanvas._isCurrentlyMoving) return;

            const dx = e.touches[0].clientX - touchStartX;
            const dy = e.touches[0].clientY - touchStartY;
            if (!panActive && Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
            panActive = true;
            e.preventDefault();

            const vpt = fabricCanvas.viewportTransform;
            const bounds = fabricCanvas.getBounds();
            vpt[4] = Math.max(bounds.minX, Math.min(bounds.maxX, vpt[4] + dx));
            vpt[5] = Math.max(bounds.minY, Math.min(bounds.maxY, vpt[5] + dy));

            fabricCanvas.requestRenderAll();
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
        }, { passive: false });

        canvasEl.addEventListener('touchend', () => {
            panActive = false;
            touchStartedOnObject = false;
        }, { passive: true });
    })();

    if (fabricCanvas.upperCanvasEl) {
        fabricCanvas.upperCanvasEl.addEventListener('wheel', (e) => {
            e.preventDefault();
        }, { passive: false });
    }

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

    fabric.Object.prototype.objectCaching = true;
    fabric.Object.prototype.noScaleCache = false;
    fabric.Object.prototype.transparentCorners = true;
    fabric.Object.prototype.cornerColor = 'rgba(255,255,255,0.01)';
    fabric.Object.prototype.cornerStrokeColor = '#3b82f6';
    fabric.Object.prototype.borderColor = '#3b82f6';
    fabric.Object.prototype.cornerSize = 10;
    fabric.Object.prototype.padding = 6;
    fabric.Object.prototype.cornerStyle = 'circle';
    fabric.Object.prototype.borderDashArray = [5, 5];

    fabricCanvas.on('mouse:wheel', function (opt) {
        const delta = opt.e.deltaY;
        const vpt = fabricCanvas.viewportTransform;
        if (opt.e.ctrlKey) {
            let zoom = fabricCanvas.getZoom() * (1 - delta * 0.009);
            zoom = Math.max(0.8, Math.min(2.5, zoom));
            fabricCanvas.zoomToPoint({ x: opt.e.offsetX, y: opt.e.offsetY }, zoom);
        } else {
            vpt[4] -= opt.e.deltaX;
            vpt[5] -= delta;
        }
        const bounds = fabricCanvas.getBounds();
        vpt[4] = Math.max(bounds.minX, Math.min(bounds.maxX, vpt[4]));
        vpt[5] = Math.max(bounds.minY, Math.min(bounds.maxY, vpt[5]));
        fabricCanvas.requestRenderAll();
        opt.e.preventDefault();
        opt.e.stopPropagation();
    });

    // Shape Drawing Engine
    fabricCanvas.on('mouse:down', function (opt) {
        if (opt.e && opt.e.touches && opt.e.touches.length > 1) return;
        const evt = opt.e;

        if (activeShapeType) {
            isDrawingShape = true;
            shapeStartPoint = fabricCanvas.getPointer(evt);
            const stroke = currentShapeColor;
            const strokeWidth = currentShapeStrokeWidth;

            if (activeShapeType === 'rect') {
                drawingObject = new fabric.Rect({
                    left: shapeStartPoint.x, top: shapeStartPoint.y,
                    originX: 'left', originY: 'top', width: 0, height: 0,
                    fill: 'transparent', stroke, strokeWidth, selectable: false
                });
            } else if (activeShapeType === 'circle') {
                drawingObject = new fabric.Circle({
                    left: shapeStartPoint.x, top: shapeStartPoint.y,
                    originX: 'left', originY: 'top', radius: 0,
                    fill: 'transparent', stroke, strokeWidth, selectable: false
                });
            } else if (activeShapeType === 'line' || activeShapeType === 'arrow') {
                drawingObject = new fabric.Line([shapeStartPoint.x, shapeStartPoint.y, shapeStartPoint.x, shapeStartPoint.y], {
                    fill: 'transparent', stroke, strokeWidth, selectable: false,
                    originX: 'center', originY: 'center'
                });
            }
            if (drawingObject) fabricCanvas.add(drawingObject);
        } else if (evt.altKey || evt.button === 1) {
            isDragging = false;
            lastPosX = evt.clientX;
            lastPosY = evt.clientY;
            fabricCanvas._panPending = true;
            fabricCanvas.selection = false;
        }
    });

    fabricCanvas.on('mouse:move', function (opt) {
        if (isDrawingShape && drawingObject) {
            const pointer = fabricCanvas.getPointer(opt.e);
            if (activeShapeType === 'rect') {
                let w = Math.abs(pointer.x - shapeStartPoint.x);
                let h = Math.abs(pointer.y - shapeStartPoint.y);
                if (opt.e.shiftKey) w = h = Math.max(w, h);
                drawingObject.set({
                    originX: pointer.x < shapeStartPoint.x ? 'right' : 'left',
                    originY: pointer.y < shapeStartPoint.y ? 'bottom' : 'top',
                    width: w, height: h
                });
            } else if (activeShapeType === 'circle') {
                const dx = Math.abs(pointer.x - shapeStartPoint.x);
                const dy = Math.abs(pointer.y - shapeStartPoint.y);
                const radius = opt.e.shiftKey ? Math.max(dx, dy) / 2 : Math.sqrt(dx * dx + dy * dy) / 2;
                drawingObject.set({
                    radius,
                    left: (shapeStartPoint.x + pointer.x) / 2,
                    top: (shapeStartPoint.y + pointer.y) / 2,
                    originX: 'center', originY: 'center'
                });
            } else if (activeShapeType === 'line') {
                drawingObject.set({ x2: pointer.x, y2: pointer.y });
            } else if (activeShapeType === 'arrow') {
                fabricCanvas.remove(drawingObject);
                const headLength = 20;
                const angle = Math.atan2(pointer.y - shapeStartPoint.y, pointer.x - shapeStartPoint.x);
                const x2 = pointer.x - headLength * Math.cos(angle - Math.PI / 6);
                const y2 = pointer.y - headLength * Math.sin(angle - Math.PI / 6);
                const x3 = pointer.x - headLength * Math.cos(angle + Math.PI / 6);
                const y3 = pointer.y - headLength * Math.sin(angle + Math.PI / 6);
                const pathStr = `M ${shapeStartPoint.x} ${shapeStartPoint.y} L ${pointer.x} ${pointer.y} M ${pointer.x} ${pointer.y} L ${x2} ${y2} M ${pointer.x} ${pointer.y} L ${x3} ${y3}`;
                drawingObject = new fabric.Path(pathStr, {
                    fill: 'transparent', stroke: currentShapeColor,
                    strokeWidth: currentShapeStrokeWidth, strokeLineCap: 'round', selectable: false
                });
                fabricCanvas.add(drawingObject);
            }
            fabricCanvas.requestRenderAll();
        } else if (isDragging || fabricCanvas._panPending) {
            const e = opt.e;
            const dx = e.clientX - lastPosX;
            const dy = e.clientY - lastPosY;
            if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
                isDragging = true;
                fabricCanvas._panPending = false;
                const vpt = fabricCanvas.viewportTransform;
                const bounds = fabricCanvas.getBounds();
                vpt[4] = Math.max(bounds.minX, Math.min(bounds.maxX, vpt[4] + dx));
                vpt[5] = Math.max(bounds.minY, Math.min(bounds.maxY, vpt[5] + dy));
                fabricCanvas.requestRenderAll();
            }
            lastPosX = e.clientX;
            lastPosY = e.clientY;
        }
    });

    fabricCanvas.on('mouse:up', function () {
        fabricCanvas._isCurrentlyMoving = false;
        if (isDrawingShape) {
            isDrawingShape = false;
            if (drawingObject) {
                drawingObject.setCoords();
                drawingObject.set({
                    selectable: true, evented: true,
                    lockMovementX: false, lockMovementY: false,
                    hasControls: true, hasBorders: true
                });
                activeShapeType = null;
                setEditorTool('select');
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

    fabricCanvas.on('object:moving', () => { fabricCanvas._isCurrentlyMoving = true; });

    // 2-Finger Pinch Zoom & Pan
    const canvasEl = fabricCanvas.upperCanvasEl;
    if (canvasEl) {
        let touchStartDist = 0;
        let touchStartPoint = { x: 0, y: 0 };
        let isGesturing = false;
        let wasDrawing = false;
        let ticking = false;

        canvasEl.addEventListener('touchstart', (e) => {
            if (e.touches.length === 2) {
                e.preventDefault();
                isGesturing = true;
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
                const t1 = e.touches[0], t2 = e.touches[1];
                touchStartDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
                touchStartPoint = { x: (t1.clientX + t2.clientX) / 2, y: (t1.clientY + t2.clientY) / 2 };
            }
        }, { passive: false });

        canvasEl.addEventListener('touchmove', (e) => {
            if (e.touches.length === 1) {
                e.preventDefault();
            } else if (e.touches.length === 2 && isGesturing) {
                e.preventDefault();
                if (!ticking) {
                    window.requestAnimationFrame(() => {
                        if (e.touches.length >= 2) {
                            const t1 = e.touches[0], t2 = e.touches[1];
                            const rect = canvasEl.getBoundingClientRect();
                            const currentDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
                            const curX = (t1.clientX + t2.clientX) / 2;
                            const curY = (t1.clientY + t2.clientY) / 2;
                            const vpt = fabricCanvas.viewportTransform;
                            const bounds = fabricCanvas.getBounds();

                            if (touchStartDist > 0 && Math.abs(currentDist - touchStartDist) > 1) {
                                const deltaScale = currentDist / touchStartDist;
                                const zoomPoint = new fabric.Point(curX - rect.left, curY - rect.top);
                                fabricCanvas.zoomToPoint(zoomPoint, Math.min(Math.max(fabricCanvas.getZoom() * deltaScale, 0.8), 2.5));
                            }
                            vpt[4] = applyRubberBand(vpt[4] + (curX - touchStartPoint.x), bounds.minX, bounds.maxX);
                            vpt[5] = applyRubberBand(vpt[5] + (curY - touchStartPoint.y), bounds.minY, bounds.maxY);
                            fabricCanvas.requestRenderAll();
                            touchStartDist = currentDist;
                            touchStartPoint = { x: curX, y: curY };
                        }
                        ticking = false;
                    });
                    ticking = true;
                }
            }
        }, { passive: false });

        canvasEl.addEventListener('touchend', (e) => {
            if (e.touches.length < 2 && isGesturing) {
                isGesturing = false;
                const vpt = fabricCanvas.viewportTransform;
                const bounds = fabricCanvas.getBounds();
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
}

function saveHistory() {
    if (!fabricCanvas || isSyncing || isRestoringHistory) return;
    const annots = fabricCanvas.getObjects().filter(o =>
        !o.isPdfBackground && !o.isEraserCursor && o.name !== 'crop-overlay'
    );
    const state = JSON.stringify(annots.map(o => o.toObject()));
    if (editorHistory.length > 0 && editorHistory[editorHistory.length - 1] === state) return;
    editorHistory.push(state);
    redoStack = [];
}

function _restoreAnnotations(stateJson) {
    if (!fabricCanvas) return;
    isRestoringHistory = true;

    const toRemove = fabricCanvas.getObjects().filter(o =>
        !o.isPdfBackground && !o.isEraserCursor && o.name !== 'crop-overlay' &&
        !(o.type === 'image' && o.lockMovementX && o.lockMovementY && o.lockScalingX)
    );
    toRemove.forEach(o => fabricCanvas.remove(o));

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
    if (!fabricCanvas || isRestoringHistory) return;
    if (editorHistory.length <= 1) return;
    const current = editorHistory.pop();
    redoStack.push(current);
    _restoreAnnotations(editorHistory[editorHistory.length - 1]);
}

function redoEditor() {
    if (!fabricCanvas || isRestoringHistory) return;
    if (redoStack.length === 0) return;
    const target = redoStack.pop();
    editorHistory.push(target);
    _restoreAnnotations(target);
}

async function syncPdfToEditor() {
    if (!pdfDoc || isSyncing) {
        if (!pdfDoc) {
            showToast('No PDF loaded. Cannot open editor.', 2500);
            switchMode('pdf');
        }
        return;
    }
    if (!fabricCanvas) initEditor();
    if (!fabricCanvas) return;

    if (lastSyncedPdf === pdfDoc) {
        const workspace = document.getElementById('editor-workspace');
        if (workspace) {
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
    if (workspace.clientWidth === 0) await new Promise(r => setTimeout(r, 150));

    const qualityMultiplier = (window.innerWidth < 1024) ? 2.0 : 3.0;

    fabricCanvas.setDimensions({
        width: workspace.clientWidth || window.innerWidth,
        height: workspace.clientHeight || window.innerHeight
    });
    fabricCanvas.clear();
    fabricCanvas.backgroundColor = '#1e1e1e';
    editorHistory = [];
    redoStack = [];

    let totalHeight = 0;
    let maxWidth = 0;
    let pagesLoaded = 0;

    try {
        const firstPage = await pdfDoc.getPage(1);
        const baseViewport = firstPage.getViewport({ scale: 1.0 });
        const containerWidth = Math.max(workspace.clientWidth, 320);
        const fitScale = containerWidth / baseViewport.width;

        for (let i = 1; i <= pdfDoc.numPages; i++) {
            const page = await pdfDoc.getPage(i);
            const highResViewport = page.getViewport({ scale: fitScale * qualityMultiplier });

            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = highResViewport.width;
            tempCanvas.height = highResViewport.height;
            const ctx = tempCanvas.getContext('2d');
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
            await page.render({ canvasContext: ctx, viewport: highResViewport }).promise;

            const pageDataUrl = tempCanvas.toDataURL('image/jpeg', 0.90);
            const img = await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error('Image decoding timed out')), 8000);
                fabric.Image.fromURL(pageDataUrl, function (fabricImg) {
                    clearTimeout(timeout);
                    if (!fabricImg) reject(new Error('Failed to decode PDF page'));
                    else resolve(fabricImg);
                });
            });

            img.set({
                left: 0,
                top: totalHeight,
                selectable: false,
                evented: true,
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

            const pageHeight = highResViewport.height / qualityMultiplier;
            totalHeight += pageHeight + 40;
            maxWidth = Math.max(maxWidth, highResViewport.width / qualityMultiplier);
            pagesLoaded++;

            if (window.innerWidth < 768 && i % 2 === 0) {
                await new Promise(r => setTimeout(r, 80));
                fabricCanvas.requestRenderAll();
            }
        }

        fabricCanvas.docWidth = maxWidth;
        fabricCanvas.docHeight = totalHeight;
        fabricCanvas.setDimensions({
            width: workspace.clientWidth || window.innerWidth,
            height: workspace.clientHeight || window.innerHeight
        });
        fabricCanvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
        const zoom = fabricCanvas.getZoom();
        fabricCanvas.viewportTransform[4] = Math.max((fabricCanvas.width - (maxWidth * zoom)) / 2, 0);
        fabricCanvas.viewportTransform[5] = 0;
        fabricCanvas.calcOffset();
        fabricCanvas.requestRenderAll();
        lastSyncedPdf = pdfDoc;
    } catch (err) {
        console.error('CrystalSync Error:', err);
        if (pagesLoaded === 0) {
            showToast('Error loading Editor: ' + (err.message || 'Unknown error'), 4000);
        } else {
            showToast(`Loaded ${pagesLoaded}/${pdfDoc.numPages} pages.`, 3000);
        }
    } finally {
        isSyncing = false;
        editorHistory = [JSON.stringify([])];
        redoStack = [];
        isRestoringHistory = false;
    }
}

// Pure-JS multi-page JPEG-to-PDF builder (works offline without external jsPDF)
function _buildPdfFromJpegs(pages) {
    const encoder = new TextEncoder();
    const parts = [];
    const offsets = [0];
    let byteLen = 0;

    const pushBytes = (uint8) => {
        parts.push(uint8);
        byteLen += uint8.length;
    };
    const pushStr = (str) => pushBytes(encoder.encode(str));

    pushStr('%PDF-1.4\n%\xFF\xFF\xFF\xFF\n');

    const totalObjs = 2 + pages.length * 3; // 1: Catalog, 2: Pages, then per page: Page, Content, Image
    const pageObjIds = [];

    // Reserve IDs: 1 = Catalog, 2 = Pages
    let nextId = 3;
    const pageDefs = pages.map((p) => {
        const pageId = nextId++;
        const contentId = nextId++;
        const imgId = nextId++;
        pageObjIds.push(pageId);
        return { ...p, pageId, contentId, imgId };
    });

    // Obj 1: Catalog
    offsets[1] = byteLen;
    pushStr('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

    // Obj 2: Pages
    offsets[2] = byteLen;
    pushStr(`2 0 obj\n<< /Type /Pages /Kids [${pageObjIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>\nendobj\n`);

    for (const p of pageDefs) {
        // Page obj
        offsets[p.pageId] = byteLen;
        pushStr(`${p.pageId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${p.wPt.toFixed(2)} ${p.hPt.toFixed(2)}] /Resources << /XObject << /Im0 ${p.imgId} 0 R >> >> /Contents ${p.contentId} 0 R >>\nendobj\n`);

        // Content stream
        const stream = `q\n${p.wPt.toFixed(2)} 0 0 ${p.hPt.toFixed(2)} 0 0 cm\n/Im0 Do\nQ\n`;
        offsets[p.contentId] = byteLen;
        pushStr(`${p.contentId} 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}endstream\nendobj\n`);

        // Image XObject (DCTDecode)
        offsets[p.imgId] = byteLen;
        pushStr(`${p.imgId} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${p.pxW} /Height ${p.pxH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpegBytes.length} >>\nstream\n`);
        pushBytes(p.jpegBytes);
        pushStr('\nendstream\nendobj\n');
    }

    const xrefOffset = byteLen;
    pushStr(`xref\n0 ${totalObjs + 1}\n0000000000 65535 f \n`);
    for (let id = 1; id <= totalObjs; id++) {
        pushStr(String(offsets[id]).padStart(10, '0') + ' 00000 n \n');
    }
    pushStr(`trailer\n<< /Size ${totalObjs + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);

    const out = new Uint8Array(byteLen);
    let pos = 0;
    for (const part of parts) {
        out.set(part, pos);
        pos += part.length;
    }
    return out;
}

function _uint8ToBase64(bytes) {
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
}

async function downloadEditedPDF() {
    if (!pdfDoc && !fabricCanvas) {
        showToast('Nothing to download.');
        return;
    }

    try {
        showToast('Preparing PDF download...', 2500);
        let base64Data, fileName, mimeType;

        if (pdfDoc && fabricCanvas) {
            const qualityMultiplier = (window.innerWidth < 1024) ? 1.8 : 2.5;
            const workspace = document.getElementById('editor-workspace');
            const containerWidth = Math.max(workspace ? workspace.clientWidth : 320, 320);

            const firstPage = await pdfDoc.getPage(1);
            const baseVp = firstPage.getViewport({ scale: 1.0 });
            const fitScale = containerWidth / baseVp.width;

            const renderedPages = [];
            let runningTopFabric = 0;

            for (let i = 1; i <= pdfDoc.numPages; i++) {
                const page = await pdfDoc.getPage(i);
                const pageBaseVp = page.getViewport({ scale: 1.0 });
                const viewport = page.getViewport({ scale: fitScale * qualityMultiplier });

                const pageCanvas = document.createElement('canvas');
                pageCanvas.width = Math.floor(viewport.width);
                pageCanvas.height = Math.floor(viewport.height);
                const pageCtx = pageCanvas.getContext('2d');
                pageCtx.fillStyle = '#ffffff';
                pageCtx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
                await page.render({ canvasContext: pageCtx, viewport }).promise;

                const pageHeightFabric = pageBaseVp.height * fitScale;
                const pageTopFabric = runningTopFabric;
                const pageBottomFabric = pageTopFabric + pageHeightFabric;
                runningTopFabric += pageHeightFabric + 40;

                const annotObjects = fabricCanvas.getObjects().filter(o => {
                    if (o.isPdfBackground || o.isEraserCursor || o.name === 'crop-overlay') return false;
                    if (o.type === 'image' && o.lockMovementX) return false;
                    const bound = o.getBoundingRect(true, true);
                    return (bound.top + bound.height) >= pageTopFabric - 10 && bound.top <= pageBottomFabric + 10;
                });

                if (annotObjects.length > 0) {
                    const annotCanvas = document.createElement('canvas');
                    annotCanvas.width = pageCanvas.width;
                    annotCanvas.height = pageCanvas.height;
                    const annotCtx = annotCanvas.getContext('2d');
                    annotCtx.scale(qualityMultiplier, qualityMultiplier);

                    for (const obj of annotObjects) {
                        try {
                            const objBound = obj.getBoundingRect(true, true);
                            const tmpW = Math.max(2, Math.ceil(objBound.width + 8));
                            const tmpH = Math.max(2, Math.ceil(objBound.height + 8));
                            const clonedCanvas = new fabric.StaticCanvas(null, { width: tmpW, height: tmpH });
                            const clonedObj = fabric.util.object.clone(obj);
                            clonedObj.set({
                                left: obj.left - objBound.left + 4,
                                top: obj.top - objBound.top + 4
                            });
                            clonedCanvas.add(clonedObj);
                            clonedCanvas.renderAll();
                            annotCtx.drawImage(clonedCanvas.getElement(), objBound.left - 4, objBound.top - pageTopFabric - 4);
                            clonedCanvas.dispose();
                        } catch (e) { console.warn('Annotation render skip:', e.message); }
                    }
                    pageCtx.drawImage(annotCanvas, 0, 0);
                }

                const jpegDataUrl = pageCanvas.toDataURL('image/jpeg', 0.92);
                const jpegB64 = jpegDataUrl.split(',')[1];
                const binStr = atob(jpegB64);
                const jpegBytes = new Uint8Array(binStr.length);
                for (let b = 0; b < binStr.length; b++) jpegBytes[b] = binStr.charCodeAt(b);

                renderedPages.push({
                    wPt: pageBaseVp.width,
                    hPt: pageBaseVp.height,
                    pxW: pageCanvas.width,
                    pxH: pageCanvas.height,
                    jpegBytes
                });
            }

            const pdfBytes = _buildPdfFromJpegs(renderedPages);
            base64Data = _uint8ToBase64(pdfBytes);
            fileName = `OmniReader_${Date.now()}.pdf`;
            mimeType = 'application/pdf';
        } else {
            const dataUrl = fabricCanvas.toDataURL({ format: 'png', multiplier: 2 });
            base64Data = dataUrl.split(',')[1];
            fileName = `OmniReader_${Date.now()}.png`;
            mimeType = 'image/png';
        }

        if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()
            && window.Capacitor.Plugins && window.Capacitor.Plugins.Filesystem) {
            const Filesystem = window.Capacitor.Plugins.Filesystem;
            await Filesystem.writeFile({
                path: `OmniReader/${fileName}`,
                data: base64Data,
                directory: 'DOCUMENTS',
                recursive: true
            });
            showToast(`✓ Saved to Documents/OmniReader/${fileName}`, 3500);
        } else {
            const link = document.createElement('a');
            link.download = fileName;
            link.href = `data:${mimeType};base64,${base64Data}`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            showToast(`✓ Downloaded ${fileName}`, 2500);
        }
    } catch (e) {
        console.error('Download error:', e);
        showToast('Download failed: ' + (e.message || 'Unknown error'), 3500);
    }
}

// ============================================================
// TOOLBAR, SETTINGS DROPDOWNS, PEN / HIGHLIGHTER / ERASER / SHAPES
// ============================================================

function initColorGrids() {
    const penGrid = document.getElementById('pen-colors-grid');
    if (penGrid) {
        penGrid.innerHTML = PEN_COLORS.map(c => `
            <button onclick="updatePenColor('${c}')" class="w-7 h-7 rounded-full border-2 border-white/10 hover:scale-110 active:scale-95 transition-transform focus:outline-none focus:ring-2 focus:ring-white shadow-md" style="background-color:${c}"></button>
        `).join('');
    }
    const hGrid = document.getElementById('highlighter-colors-grid');
    if (hGrid) {
        hGrid.innerHTML = HIGHLIGHTER_COLORS.map(c => `
            <button onclick="updateHighlighterColor('${c}')" class="w-7 h-7 rounded-full border-2 border-white/10 hover:scale-110 active:scale-95 transition-transform focus:outline-none focus:ring-2 focus:ring-white shadow-md" style="background-color:${c}"></button>
        `).join('');
    }
}

function closeSettingsDropdown() {
    const panel = document.getElementById('tool-settings-panel');
    if (panel) panel.classList.add('hidden');
    document.querySelectorAll('#tool-settings-panel > div[id^="panel-"]').forEach(el => el.classList.add('hidden'));
    _activeToolPanel = null;
}

function closeToolSettingsPanel() { closeSettingsDropdown(); }
function closeAllDropdowns() { closeSettingsDropdown(); }

function toggleSettingsDropdown(tool, event) {
    if (event) event.stopPropagation();
    const panel = document.getElementById('tool-settings-panel');
    const subPanel = document.getElementById(`panel-${tool}`);
    if (!panel || !subPanel) return;

    if (_activeToolPanel === tool) {
        closeSettingsDropdown();
        return;
    }

    document.querySelectorAll('#tool-settings-panel > div[id^="panel-"]').forEach(el => el.classList.add('hidden'));
    subPanel.classList.remove('hidden');
    panel.classList.remove('hidden');
    _activeToolPanel = tool;
    setEditorTool(tool);
}

function toggleToolPanel(tool) {
    toggleSettingsDropdown(tool);
}

function toggleEditorTool(tool) {
    closeSettingsDropdown();
    if (editorTool === tool) {
        setEditorTool('select');
    } else {
        setEditorTool(tool);
    }
}

function activateTool(tool) { toggleEditorTool(tool); }
function toggleDropdown(tool) { toggleSettingsDropdown(tool); }

document.addEventListener('click', (e) => {
    if (_activeToolPanel && !e.target.closest('#editor-toolbar')) {
        closeSettingsDropdown();
    }
});

function updatePenColor(color) {
    currentPenColor = color;
    if (fabricCanvas && fabricCanvas.freeDrawingBrush && editorTool === 'draw') {
        fabricCanvas.freeDrawingBrush.color = color;
    }
    const preview = document.getElementById('pen-preview');
    if (preview) preview.style.backgroundColor = color;
    const icon = document.querySelector('#tool-draw i.fa-pencil-alt');
    if (icon) icon.style.color = color;
    const ind = document.getElementById('tool-draw-indicator');
    if (ind) ind.style.background = color;
}

function updatePenSize(size) {
    currentPenSize = parseInt(size, 10) || 3;
    if (fabricCanvas && fabricCanvas.freeDrawingBrush && editorTool === 'draw') {
        fabricCanvas.freeDrawingBrush.width = currentPenSize;
    }
    const lbl = document.getElementById('pen-size-label');
    if (lbl) lbl.innerText = currentPenSize + 'px';
    const preview = document.getElementById('pen-preview');
    if (preview) preview.style.height = currentPenSize + 'px';
}

function updateHighlighterColor(color) {
    currentHighlighterColor = color;
    if (fabricCanvas && fabricCanvas.freeDrawingBrush && editorTool === 'highlighter') {
        fabricCanvas.freeDrawingBrush.color = hexToRgba(color, 0.5);
    }
    const preview = document.getElementById('highlighter-preview');
    if (preview) preview.style.backgroundColor = hexToRgba(color, 0.5);
    const icon = document.querySelector('#tool-highlighter i.fa-highlighter');
    if (icon) icon.style.color = color;
    const ind = document.getElementById('tool-highlighter-indicator');
    if (ind) ind.style.background = color;
}

function updateHighlighterSize(size) {
    currentHighlighterSize = parseInt(size, 10) || 25;
    if (fabricCanvas && fabricCanvas.freeDrawingBrush && editorTool === 'highlighter') {
        fabricCanvas.freeDrawingBrush.width = currentHighlighterSize;
    }
    const lbl = document.getElementById('highlighter-size-label');
    if (lbl) lbl.innerText = currentHighlighterSize + 'px';
    const preview = document.getElementById('highlighter-preview');
    if (preview) preview.style.height = currentHighlighterSize + 'px';
}

function setEditorTool(tool) {
    editorTool = tool;
    activeShapeType = null;
    isDrawingShape = false;

    if (tool !== 'shapes') {
        const shapePanel = document.getElementById('shape-settings-panel');
        if (shapePanel) shapePanel.classList.add('hidden');
    }

    document.querySelectorAll('#editor-toolbar button[id^="tool-"]').forEach(b => {
        b.classList.remove('text-white', 'bg-white/10');
        b.classList.add('text-gray-400');
    });
    document.querySelectorAll('#editor-toolbar span[id$="-indicator"]').forEach(ind => {
        ind.classList.add('hidden');
    });

    const toolId = ['draw', 'highlighter', 'shapes', 'eraser'].includes(tool) ? tool : 'select';
    if (toolId !== 'select') {
        const activeBtn = document.getElementById(`tool-${toolId}`);
        if (activeBtn) {
            activeBtn.classList.remove('text-gray-400');
            activeBtn.classList.add('text-white', 'bg-white/10');
        }
        const ind = document.getElementById(`tool-${toolId}-indicator`);
        if (ind) ind.classList.remove('hidden');
    }

    if (!fabricCanvas) return;

    disableEraserLogic();
    fabricCanvas.isDrawingMode = false;
    fabricCanvas.selection = (tool === 'select' || tool === 'crop');
    fabricCanvas.defaultCursor = 'default';
    fabricCanvas.hoverCursor = (tool === 'select') ? 'move' : 'default';

    if (fabricCanvas.upperCanvasEl) {
        fabricCanvas.upperCanvasEl.style.touchAction = 'none';
    }

    if (tool === 'eraser') {
        enableEraserLogic();
    } else if (tool === 'draw') {
        fabricCanvas.isDrawingMode = true;
        fabricCanvas.freeDrawingBrush = new fabric.PencilBrush(fabricCanvas);
        fabricCanvas.freeDrawingBrush.width = currentPenSize;
        fabricCanvas.freeDrawingBrush.color = currentPenColor;
        fabricCanvas.freeDrawingBrush.decimate = 3;
    } else if (tool === 'highlighter') {
        fabricCanvas.isDrawingMode = true;
        fabricCanvas.freeDrawingBrush = new fabric.PencilBrush(fabricCanvas);
        fabricCanvas.freeDrawingBrush.width = currentHighlighterSize;
        fabricCanvas.freeDrawingBrush.color = hexToRgba(currentHighlighterColor, 0.5);
        fabricCanvas.freeDrawingBrush.decimate = 5;
    } else if (tool === 'shapes') {
        showBottomPanel('shape-settings-panel');
        const picker = document.getElementById('shape-color-picker');
        if (picker && !picker.hasChildNodes()) initShapePanel();
        if (!activeShapeType) selectShapeTool('rect');
    }

    updateCursor(tool);
    fabricCanvas.requestRenderAll();
}

function updateCursor(tool) {
    if (!fabricCanvas) return;
    let cursor = 'default';
    if (tool === 'draw') {
        const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='white' stroke='black' stroke-width='1'><path d='M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z'></path></svg>`;
        cursor = `url("data:image/svg+xml;base64,${btoa(svg)}") 2 22, auto`;
    } else if (tool === 'highlighter') {
        const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='rgba(255,255,0,0.8)' stroke='black' stroke-width='1'><path d='M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z'></path></svg>`;
        cursor = `url("data:image/svg+xml;base64,${btoa(svg)}") 2 22, auto`;
    } else if (tool === 'eraser') {
        cursor = 'none';
    }
    fabricCanvas.defaultCursor = cursor;
    fabricCanvas.freeDrawingCursor = cursor;
    if (tool !== 'select') fabricCanvas.hoverCursor = cursor;
}

// ============================================================
// ROBUST SWEEP ERASER
// ============================================================

function _onEraserMouseOut() {
    if (eraserCursorObject && fabricCanvas) {
        eraserCursorObject.set({ left: -500, top: -500 });
        fabricCanvas.requestRenderAll();
    }
}

function enableEraserLogic() {
    if (!fabricCanvas) return;
    disableEraserLogic();

    fabricCanvas.isDrawingMode = false;
    fabricCanvas.selection = false;
    fabricCanvas.forEachObject(o => { o.selectable = false; });

    eraserCursorObject = new fabric.Circle({
        radius: currentEraserSize / 2,
        fill: 'rgba(255,255,255,0.15)',
        stroke: 'rgba(0,0,0,0.5)',
        strokeWidth: 2,
        originX: 'center',
        originY: 'center',
        left: -500,
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
    fabricCanvas.on('mouse:out', _onEraserMouseOut);
}

function disableEraserLogic() {
    isEraserActive = false;
    if (!fabricCanvas) return;

    fabricCanvas.off('mouse:down', startErasing);
    fabricCanvas.off('mouse:move', onEraserMove);
    fabricCanvas.off('mouse:up', stopErasing);
    fabricCanvas.off('touch:down', startErasingTouch);
    fabricCanvas.off('touch:move', onEraserTouchMove);
    fabricCanvas.off('touch:up', stopErasing);
    fabricCanvas.off('mouse:out', _onEraserMouseOut);

    if (eraserCursorObject) {
        fabricCanvas.remove(eraserCursorObject);
        eraserCursorObject = null;
    }

    fabricCanvas.forEachObject(o => {
        if (!o.isPdfBackground && o.name !== 'crop-overlay' && !o.isEraserCursor) {
            o.selectable = true;
        }
    });
}

function startErasing(opt) {
    if (!fabricCanvas || !opt.e || (opt.e.touches && opt.e.touches.length > 1)) return;
    isEraserActive = true;
    const pointer = fabricCanvas.getPointer(opt.e);
    if (!pointer) return;
    lastEraserX = pointer.x;
    lastEraserY = pointer.y;
    if (eraserCursorObject) {
        eraserCursorObject.set({
            left: pointer.x, top: pointer.y, visible: true,
            stroke: '#fbbf24', fill: 'rgba(254, 240, 138, 0.35)'
        });
        eraserCursorObject.setCoords();
    }
    eraseObjects(opt);
}

function onEraserMove(opt) {
    if (!fabricCanvas || !opt.e) return;
    const pointer = fabricCanvas.getPointer(opt.e);
    if (!pointer) return;
    if (eraserCursorObject) {
        eraserCursorObject.set({ left: pointer.x, top: pointer.y, visible: true });
        eraserCursorObject.setCoords();
    }
    if (isEraserActive) {
        eraseObjectsInterpolated(lastEraserX, lastEraserY, pointer.x, pointer.y);
        lastEraserX = pointer.x;
        lastEraserY = pointer.y;
    }
    fabricCanvas.requestRenderAll();
}

function startErasingTouch(opt) {
    if (!fabricCanvas || !opt.e || !opt.e.touches || !opt.e.touches.length) return;
    isEraserActive = true;
    const pointer = fabricCanvas.getPointer(opt.e.touches[0]);
    if (!pointer) return;
    lastEraserX = pointer.x;
    lastEraserY = pointer.y;
    if (eraserCursorObject) {
        eraserCursorObject.set({
            left: pointer.x, top: pointer.y, visible: true,
            stroke: '#fbbf24', fill: 'rgba(254, 240, 138, 0.35)'
        });
        eraserCursorObject.setCoords();
    }
    eraseObjectsAt(pointer.x, pointer.y);
}

function onEraserTouchMove(opt) {
    if (!fabricCanvas || !opt.e || !opt.e.touches || opt.e.touches.length > 1) return;
    const pointer = fabricCanvas.getPointer(opt.e.touches[0]);
    if (!pointer) return;
    if (eraserCursorObject) {
        eraserCursorObject.set({ left: pointer.x, top: pointer.y, visible: true });
        eraserCursorObject.setCoords();
    }
    if (isEraserActive) {
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
            eraserCursorObject.set({
                stroke: 'rgba(0,0,0,0.5)',
                fill: 'rgba(255,255,255,0.15)'
            });
        }
        if (fabricCanvas) fabricCanvas.requestRenderAll();
        saveHistory();
    }
}

function eraseObjects(opt) {
    if (!fabricCanvas || !eraserCursorObject || !opt.e) return;
    const pointer = fabricCanvas.getPointer(opt.e);
    if (!pointer) return;
    eraseObjectsAt(pointer.x, pointer.y);
}

function eraseObjectsAt(eraserX, eraserY) {
    if (!fabricCanvas || !eraserCursorObject) return;
    const eraserRadius = eraserCursorObject.radius || (currentEraserSize / 2);
    const buffer = eraserRadius * 0.25;
    const eraserBox = {
        l: eraserX - eraserRadius - buffer,
        r: eraserX + eraserRadius + buffer,
        t: eraserY - eraserRadius - buffer,
        b: eraserY + eraserRadius + buffer
    };

    const objects = fabricCanvas.getObjects().slice();
    const toErase = [];

    for (const obj of objects) {
        if (!obj || !obj.visible || obj.isPdfBackground || obj.isEraserCursor || obj.name === 'crop-overlay') continue;
        const bound = obj.getBoundingRect(true, true);
        if (bound.left > eraserBox.r || (bound.left + bound.width) < eraserBox.l ||
            bound.top > eraserBox.b || (bound.top + bound.height) < eraserBox.t) {
            continue;
        }
        const closestX = Math.max(bound.left, Math.min(eraserX, bound.left + bound.width));
        const closestY = Math.max(bound.top, Math.min(eraserY, bound.top + bound.height));
        if ((eraserX - closestX) ** 2 + (eraserY - closestY) ** 2 <= eraserRadius * eraserRadius) {
            toErase.push(obj);
        }
    }

    if (toErase.length > 0) {
        toErase.forEach(obj => fabricCanvas.remove(obj));
        fabricCanvas.requestRenderAll();
    }
}

function eraseObjectsInterpolated(x0, y0, x1, y1) {
    if (!fabricCanvas || !eraserCursorObject) return;
    const eraserRadius = eraserCursorObject.radius || (currentEraserSize / 2);
    const distance = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.max(1, Math.ceil(distance / Math.max(2, eraserRadius * 0.5)));

    let hasChanges = false;
    for (let step = 0; step <= steps; step++) {
        const t = steps === 0 ? 0 : step / steps;
        const eraserX = x0 + (x1 - x0) * t;
        const eraserY = y0 + (y1 - y0) * t;
        const buffer = eraserRadius * 0.25;
        const eraserBox = {
            l: eraserX - eraserRadius - buffer,
            r: eraserX + eraserRadius + buffer,
            t: eraserY - eraserRadius - buffer,
            b: eraserY + eraserRadius + buffer
        };

        const objects = fabricCanvas.getObjects().slice();
        const toErase = [];
        for (const obj of objects) {
            if (!obj || !obj.visible || obj.isPdfBackground || obj.isEraserCursor || obj.name === 'crop-overlay') continue;
            const bound = obj.getBoundingRect(true, true);
            if (bound.left > eraserBox.r || (bound.left + bound.width) < eraserBox.l ||
                bound.top > eraserBox.b || (bound.top + bound.height) < eraserBox.t) {
                continue;
            }
            const closestX = Math.max(bound.left, Math.min(eraserX, bound.left + bound.width));
            const closestY = Math.max(bound.top, Math.min(eraserY, bound.top + bound.height));
            if ((eraserX - closestX) ** 2 + (eraserY - closestY) ** 2 <= eraserRadius * eraserRadius) {
                toErase.push(obj);
            }
        }
        if (toErase.length > 0) {
            toErase.forEach(obj => fabricCanvas.remove(obj));
            hasChanges = true;
        }
    }
    if (hasChanges) fabricCanvas.requestRenderAll();
}

function updateEraserSize(size) {
    currentEraserSize = parseInt(size, 10) || 30;
    const lbl = document.getElementById('eraser-size-label');
    if (lbl) lbl.innerText = currentEraserSize + 'px';

    const preview = document.getElementById('eraser-preview-circle');
    if (preview) {
        preview.style.width = currentEraserSize + 'px';
        preview.style.height = currentEraserSize + 'px';
    }
    if (eraserCursorObject && fabricCanvas) {
        eraserCursorObject.set('radius', currentEraserSize / 2);
        eraserCursorObject.setCoords();
        fabricCanvas.requestRenderAll();
    }
}

function showBottomPanel(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('hidden');
    setTimeout(() => el.classList.remove('panel-slide-out'), 10);
}

function cancelEraser() { setEditorTool('select'); }
function applyEraser() { setEditorTool('select'); }

// ============================================================
// SHAPE TOOLS & PANEL
// ============================================================

function selectShapeTool(type) {
    if (editorTool !== 'shapes') setEditorTool('shapes');
    activeShapeType = type;

    document.querySelectorAll('[id^="shape-btn-"]').forEach(btn => {
        btn.classList.remove('bg-white/20', 'text-white', 'border-white/20');
        btn.classList.add('text-gray-400');
    });
    const activeBtn = document.getElementById(`shape-btn-${type}`);
    if (activeBtn) {
        activeBtn.classList.remove('text-gray-400');
        activeBtn.classList.add('bg-white/20', 'text-white', 'border-white/20');
    }

    if (fabricCanvas) {
        fabricCanvas.selection = false;
        fabricCanvas.defaultCursor = 'crosshair';
        fabricCanvas.hoverCursor = 'crosshair';
        fabricCanvas.forEachObject(o => {
            o.selectable = false;
            o.evented = false;
        });
    }
    closeSettingsDropdown();
}

function initShapePanel() {
    const container = document.getElementById('shape-color-picker');
    if (!container) return;
    const ALL_PANEL_COLORS = [...new Set([...SHAPE_COLORS, ...PEN_COLORS])];
    container.innerHTML = ALL_PANEL_COLORS.map(color => `
        <button onclick="setShapeColor('${color}')"
            class="w-8 h-8 rounded-full border border-white/10 hover:border-white hover:scale-110 transition-all shadow-sm flex-shrink-0 focus:outline-none focus:ring-1 focus:ring-white/50"
            style="background-color:${color === 'transparent' ? 'transparent' : color};"
            title="${color}">
            ${color === 'transparent' ? '<i class="fas fa-ban text-red-500 text-[10px]"></i>' : ''}
        </button>
    `).join('');
}

function onObjectSelected(e) {
    const obj = e.selected ? e.selected[0] : e.target;
    if (!obj) return;
    if (obj.name === 'crop-overlay' || obj.isEraserCursor || obj.isPdfBackground) {
        hideShapePanel();
        return;
    }
    if (editorTool === 'eraser' || editorTool === 'draw' || editorTool === 'highlighter') return;

    const panel = document.getElementById('shape-settings-panel');
    if (!panel) return;
    panel.classList.remove('hidden');
    setTimeout(() => panel.classList.remove('panel-slide-out'), 10);

    const picker = document.getElementById('shape-color-picker');
    if (picker && !picker.hasChildNodes()) initShapePanel();

    const currentStroke = obj.strokeWidth || 3;
    const slider = document.querySelector('#shape-size-popover input');
    if (slider) {
        slider.value = currentStroke;
        const disp = document.getElementById('stroke-val-display');
        if (disp) disp.innerText = currentStroke + 'px';
    }
}

function onSelectionCleared() {
    if (editorTool !== 'shapes') hideShapePanel();
}

function hideShapePanel() {
    const panel = document.getElementById('shape-settings-panel');
    if (!panel) return;
    panel.classList.add('panel-slide-out');
    const pop = document.getElementById('shape-size-popover');
    if (pop) pop.classList.add('hidden');
    setTimeout(() => panel.classList.add('hidden'), 300);
}

function setShapeColor(color) {
    currentShapeColor = color;
    if (!fabricCanvas) return;
    const activeObj = fabricCanvas.getActiveObject();
    if (!activeObj) return;
    activeObj.set({ stroke: color, fill: 'transparent' });
    fabricCanvas.requestRenderAll();
    saveHistory();
}

function toggleShapeSizeSlider() {
    const popover = document.getElementById('shape-size-popover');
    if (popover) popover.classList.toggle('hidden');
}

function updateShapeStroke(val) {
    const width = parseInt(val, 10) || 3;
    currentShapeStrokeWidth = width;
    const disp = document.getElementById('stroke-val-display');
    if (disp) disp.innerText = width + 'px';
    if (!fabricCanvas) return;
    const activeObj = fabricCanvas.getActiveObject();
    if (activeObj) {
        activeObj.set('strokeWidth', width);
        fabricCanvas.requestRenderAll();
        saveHistory();
    }
}

function deleteSelectedShape() {
    if (!fabricCanvas) return;
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
    if (!fabricCanvas) return;
    const activeObj = fabricCanvas.getActiveObject();
    if (activeObj) {
        activeObj.rotate((activeObj.angle || 0) + angle);
        fabricCanvas.requestRenderAll();
        saveHistory();
    }
}

function bringToFront() {
    if (!fabricCanvas) return;
    const activeObj = fabricCanvas.getActiveObject();
    if (activeObj) {
        activeObj.bringToFront();
        saveHistory();
    }
}

function sendToBack() {
    if (!fabricCanvas) return;
    const activeObj = fabricCanvas.getActiveObject();
    if (activeObj) {
        activeObj.sendToBack();
        fabricCanvas.getObjects().forEach(o => {
            if (o.isPdfBackground) o.sendToBack();
        });
        saveHistory();
    }
}
