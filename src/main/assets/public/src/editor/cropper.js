// ============================================================
// IMAGE CROP TOOL & ROTATION RULER
// ============================================================

let cropperInstance = null;
let cropScaleX = 1;
let cropScaleY = 1;
let activeCropObject = null;
let isCropSelecting = false;

let isRotatingRuler = false;
let rotateStartX = 0;
let currentRotation = 0;
let _rulerMoveHandler = null;
let _rulerEndHandler = null;
let lastHapticDeg = 0;

function openCropTool() {
    if (!fabricCanvas) {
        showToast('No canvas available. Open a PDF in Edit mode first.', 2500);
        return;
    }

    const activeObj = fabricCanvas.getActiveObject();
    if (activeObj && activeObj.type === 'image') {
        startCropping(activeObj);
        return;
    }

    isCropSelecting = true;
    fabricCanvas.defaultCursor = 'crosshair';
    fabricCanvas.hoverCursor = 'crosshair';
    fabricCanvas.forEachObject(o => {
        if (o.type === 'image') o.hoverCursor = 'crosshair';
    });
    fabricCanvas.requestRenderAll();
    showToast('Tap an image or page to crop it', 3500);

    fabricCanvas.off('mouse:down', handleCropSelection);
    fabricCanvas.on('mouse:down', handleCropSelection);
}

function handleCropSelection(opt) {
    if (opt.e && opt.e.touches && opt.e.touches.length > 1) return;
    if (!isCropSelecting) return;

    const pointer = fabricCanvas.getPointer(opt.e);
    let target = null;

    if (opt.target && opt.target.type === 'image') {
        target = opt.target;
    } else {
        const objects = fabricCanvas.getObjects().slice().reverse();
        for (const obj of objects) {
            if (obj.type === 'image' && obj.visible && obj.containsPoint(pointer)) {
                target = obj;
                break;
            }
        }
    }

    if (target) {
        startCropping(target);
    } else {
        showToast('No image found there. Try tapping a page.', 2000);
        return;
    }

    isCropSelecting = false;
    fabricCanvas.defaultCursor = 'default';
    fabricCanvas.hoverCursor = 'move';
    fabricCanvas.off('mouse:down', handleCropSelection);
    fabricCanvas.forEachObject(o => { o.hoverCursor = null; });
    fabricCanvas.requestRenderAll();
}

function startCropping(imageObj) {
    if (typeof Cropper === 'undefined') {
        showToast('Cropper library not loaded.', 3000);
        return;
    }
    activeCropObject = imageObj;
    const imageUrl = imageObj.toDataURL({ format: 'png', multiplier: 2 });

    const cropImage = document.getElementById('crop-image');
    const modal = document.getElementById('crop-modal');
    if (!cropImage || !modal) return;

    cropImage.onload = function () {
        if (cropperInstance) cropperInstance.destroy();
        cropperInstance = new Cropper(cropImage, {
            aspectRatio: NaN,
            viewMode: 1,
            dragMode: 'move',
            autoCropArea: 0.8,
            restore: false,
            guides: true,
            center: true,
            highlight: true,
            cropBoxMovable: false,
            cropBoxResizable: true,
            toggleDragModeOnDblclick: false,
            background: false,
            zoomable: true,
            scalable: true,
            zoomOnTouch: true,
            zoomOnWheel: false,
            wheelZoomRatio: 0.1,
            ready: function () {
                const container = this.cropper.container;
                if (container) {
                    container.addEventListener('wheel', (e) => {
                        e.preventDefault();
                        if (e.ctrlKey) {
                            cropperInstance.zoom(-e.deltaY * 0.009);
                        } else {
                            cropperInstance.move(-e.deltaX * 0.8, -e.deltaY * 0.8);
                        }
                    }, { passive: false });
                }
            }
        });
        cropScaleX = 1;
        cropScaleY = 1;
        currentRotation = 0;
        initRotationRuler();
    };

    cropImage.src = imageUrl;
    modal.classList.remove('hidden');
}

function initRotationRuler() {
    const scaleEl = document.getElementById('ruler-scale');
    const ruler = document.getElementById('rotation-ruler');
    if (!scaleEl || !ruler) return;

    let html = '';
    for (let i = -45; i <= 45; i++) {
        const isMajor = i % 5 === 0;
        html += `<div class="ruler-mark ${isMajor ? 'large' : ''}" data-deg="${i}"></div>`;
    }
    scaleEl.innerHTML = html;

    ruler.onmousedown = ruler.ontouchstart = (e) => {
        isRotatingRuler = true;
        rotateStartX = (e.type === 'touchstart' ? e.touches[0].clientX : e.clientX);
        ruler.style.cursor = 'grabbing';
        scaleEl.style.transition = 'none';
    };

    if (_rulerMoveHandler) {
        window.removeEventListener('mousemove', _rulerMoveHandler);
        window.removeEventListener('touchmove', _rulerMoveHandler);
    }
    if (_rulerEndHandler) {
        window.removeEventListener('mouseup', _rulerEndHandler);
        window.removeEventListener('touchend', _rulerEndHandler);
    }

    _rulerMoveHandler = (e) => {
        if (!isRotatingRuler || !cropperInstance) return;
        const clientX = (e.type === 'touchmove' ? e.touches[0].clientX : e.clientX);
        const deltaX = clientX - rotateStartX;
        const newDeg = Math.max(-45, Math.min(45, currentRotation + deltaX / 4));
        cropperInstance.rotateTo(newDeg);
        updateRulerUI(newDeg);
    };

    _rulerEndHandler = () => {
        if (!isRotatingRuler) return;
        isRotatingRuler = false;
        ruler.style.cursor = 'grab';
        if (cropperInstance) {
            currentRotation = cropperInstance.getData().rotate || 0;
        }
        scaleEl.style.transition = 'transform 0.1s ease-out';
    };

    window.addEventListener('mousemove', _rulerMoveHandler);
    window.addEventListener('touchmove', _rulerMoveHandler, { passive: true });
    window.addEventListener('mouseup', _rulerEndHandler);
    window.addEventListener('touchend', _rulerEndHandler);

    updateRulerUI(0);
}

function updateRulerUI(deg) {
    const scaleEl = document.getElementById('ruler-scale');
    const display = document.getElementById('tilt-val');
    if (!scaleEl || !display) return;

    const step = 13.5;
    const offset = -(deg + 45) * step;
    scaleEl.style.transform = `translateX(${offset}px)`;

    const rounded = Math.round(deg);
    display.innerText = `${rounded}°`;

    if (rounded !== lastHapticDeg) {
        if (window.navigator && window.navigator.vibrate) window.navigator.vibrate(5);
        lastHapticDeg = rounded;
    }

    const badgeParent = display.parentElement;
    if (badgeParent) {
        if (Math.abs(rounded) > 0) {
            badgeParent.classList.add('border-white/40', 'bg-white/10');
            badgeParent.classList.remove('bg-[#0a0a0a]');
        } else {
            badgeParent.classList.remove('border-white/40', 'bg-white/10');
            badgeParent.classList.add('bg-[#0a0a0a]');
        }
    }
}

function updateRulerPos(deg) {
    currentRotation = deg;
    updateRulerUI(deg);
}

function closeCropModal() {
    const modal = document.getElementById('crop-modal');
    if (modal) modal.classList.add('hidden');
    if (cropperInstance) {
        cropperInstance.destroy();
        cropperInstance = null;
    }
    const cropImg = document.getElementById('crop-image');
    if (cropImg) cropImg.src = '';
    activeCropObject = null;

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
    if (ratio === 0) {
        const data = cropperInstance.getImageData();
        ratio = data.naturalWidth / data.naturalHeight;
    }
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
    setCropRatio(ratio, e ? e.target : null);
}

function rotateCrop(degrees) {
    if (!cropperInstance) return;
    cropperInstance.rotate(degrees);
    const data = cropperInstance.getData();
    updateRulerPos(data.rotate || 0);
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
    currentRotation = 0;
    updateRulerUI(0);
    cropperInstance.setAspectRatio(NaN);

    const ratioBtns = document.querySelectorAll('.ratio-btn');
    ratioBtns.forEach(btn => {
        btn.classList.remove('active', 'bg-white/20', 'text-white', 'border-white/30');
        btn.classList.add('bg-white/5', 'text-gray-400', 'border-white/10');
    });
    if (ratioBtns[0]) {
        ratioBtns[0].classList.add('active', 'bg-white/20', 'text-white', 'border-white/30');
        ratioBtns[0].classList.remove('bg-white/5', 'text-gray-400', 'border-white/10');
    }
}

function applyCrop() {
    if (!cropperInstance || !fabricCanvas || !activeCropObject) return;
    try {
        const croppedCanvas = cropperInstance.getCroppedCanvas({
            maxWidth: 4096,
            maxHeight: 4096,
            imageSmoothingEnabled: true,
            imageSmoothingQuality: 'high'
        });
        if (!croppedCanvas) throw new Error('Failed to generate cropped image');

        const croppedDataUrl = croppedCanvas.toDataURL('image/png', 1.0);
        fabric.Image.fromURL(croppedDataUrl, function (img) {
            const displayW = activeCropObject.width * activeCropObject.scaleX;
            const displayH = activeCropObject.height * activeCropObject.scaleY;

            img.set({
                left: activeCropObject.left,
                top: activeCropObject.top,
                selectable: activeCropObject.selectable,
                evented: activeCropObject.evented,
                hasBorders: activeCropObject.hasBorders,
                hasControls: activeCropObject.hasControls,
                lockMovementX: activeCropObject.lockMovementX,
                lockMovementY: activeCropObject.lockMovementY,
                lockRotation: activeCropObject.lockRotation,
                lockScalingX: activeCropObject.lockScalingX,
                lockScalingY: activeCropObject.lockScalingY,
                isPdfBackground: activeCropObject.isPdfBackground,
                excludeFromExport: activeCropObject.excludeFromExport,
                objectCaching: activeCropObject.objectCaching
            });

            img.scaleToWidth(displayW);
            const croppedAR = img.width / img.height;
            const origAR = displayW / displayH;
            if (Math.abs(croppedAR - origAR) > 0.05) {
                img.scaleToHeight(displayH);
            }

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
            showToast('Crop applied successfully!');
        }, { crossOrigin: 'anonymous' });
    } catch (error) {
        console.error('Crop error:', error);
        showToast('Failed to apply crop: ' + error.message, 3500);
    }
}
