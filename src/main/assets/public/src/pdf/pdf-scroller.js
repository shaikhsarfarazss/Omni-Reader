// ============================================================
// PDF FAST SCROLLER COMPONENT
// ============================================================

function initFastScroller() {
    const view = document.getElementById('pdf-viewport-container');
    const scrollHost = document.getElementById('pdf-scroll-host');
    const scroller = document.getElementById('fast-scroller');
    const handle = document.getElementById('fast-scroller-handle');
    const indicator = document.getElementById('fast-scroller-indicator');
    if (!view || !scrollHost || !scroller || !handle || !indicator) return;

    let isDraggingHandle = false;
    let lastPage = -1;
    let hideTimer = null;

    function showScroller() {
        scroller.classList.add('visible');
        clearTimeout(hideTimer);
        hideTimer = setTimeout(() => scroller.classList.remove('visible'), 2000);
    }

    function getPageAtScrollPos(scrollTop, maxScroll, numPages) {
        if (!numPages || maxScroll <= 0) return 1;
        const ratio = scrollTop / maxScroll;
        return Math.min(Math.max(Math.ceil(ratio * numPages), 1), numPages);
    }

    function updateHandlePosition(scrollTop, maxScroll, containerH) {
        const ratio = maxScroll > 0 ? scrollTop / maxScroll : 0;
        const trackH = Math.max(1, containerH - 56);
        const topPos = Math.max(0, Math.min(ratio * trackH, trackH));
        handle.style.top = topPos + 'px';
    }

    function updateIndicator(page, total) {
        if (page !== lastPage) {
            indicator.textContent = `${page} / ${total}`;
            if (lastPage !== -1 && window.navigator?.vibrate) {
                window.navigator.vibrate(8);
            }
            lastPage = page;
        }
    }

    scrollHost.addEventListener('scroll', () => {
        if (isDraggingHandle || !pdfDoc) return;
        const scrollTop = scrollHost.scrollTop;
        const maxScroll = scrollHost.scrollHeight - scrollHost.clientHeight;
        const containerH = view.clientHeight;
        updateHandlePosition(scrollTop, maxScroll, containerH);
        updateIndicator(getPageAtScrollPos(scrollTop, maxScroll, pdfDoc.numPages), pdfDoc.numPages);
        showScroller();
    }, { passive: true });

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
        const trackH = Math.max(1, containerH - 56);
        const ratio = Math.max(0, Math.min((relativeY - 28) / trackH, 1));
        const maxScroll = scrollHost.scrollHeight - scrollHost.clientHeight;
        scrollHost.scrollTop = ratio * maxScroll;
        updateHandlePosition(scrollHost.scrollTop, maxScroll, containerH);
        updateIndicator(getPageAtScrollPos(scrollHost.scrollTop, maxScroll, pdfDoc.numPages), pdfDoc.numPages);
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
}
