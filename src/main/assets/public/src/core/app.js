// ============================================================
// APPLICATION BOOTSTRAP & EVENT WIRING
// ============================================================

window.addEventListener('DOMContentLoaded', () => {
    console.log('OmniReader App Initializing...');

    checkPdfJs();
    updateApiKeyUI();
    initPlayerDrag();
    initColorGrids();
    initShapePanel();
    initFastScroller();
    initOCRResizing();

    const penIcon = document.querySelector('#tool-draw i.fa-pencil-alt');
    if (penIcon) penIcon.style.color = currentPenColor;
    const hiIcon = document.querySelector('#tool-highlighter i.fa-highlighter');
    if (hiIcon) hiIcon.style.color = currentHighlighterColor;

    setTimeout(() => TTSEngine.init(), 300);

    // Load saved text if any
    try {
        const savedText = localStorage.getItem('OMNI_SAVED_TEXT');
        const textEditor = document.getElementById('text-editor');
        if (savedText && textEditor) {
            textEditor.value = savedText;
            reRenderTextWithSpans();
        }
    } catch (e) {}

    // File upload handler (supports both .pdf and .txt)
    const fileUpload = document.getElementById('file-upload');
    if (fileUpload) {
        fileUpload.onchange = async (e) => {
            const file = e.target.files && e.target.files[0];
            if (!file) return;

            if (file.name.toLowerCase().endsWith('.txt') || file.type === 'text/plain') {
                const text = await file.text();
                const editor = document.getElementById('text-editor');
                if (editor) editor.value = text;
                try { localStorage.setItem('OMNI_SAVED_TEXT', text); } catch (err) {}
                hideDashboard();
                switchMode('text');
                toggleTextEdit(false);
                return;
            }

            await renderPdf(file);
            hideDashboard();
            switchMode('pdf');
        };
    }

    const handleContainerClick = (e) => {
        if (currentMode === 'text' && isTextEditing) return;
        const isWord = e.target.closest('.word-span') || e.target.closest('.text-word-span');
        if (!isWord) deselectAll();
    };

    const pdfViewport = document.getElementById('pdf-viewport-container');
    const textDisplay = document.getElementById('text-reader-display');
    if (pdfViewport) pdfViewport.addEventListener('mousedown', handleContainerClick);
    if (textDisplay) textDisplay.addEventListener('mousedown', handleContainerClick);

    document.addEventListener('touchend', () => {
        if (currentMode === 'edit') return;
        if (currentMode === 'text' && isTextEditing) return;
        setTimeout(handleSelection, 150);
    });

    const textEditor = document.getElementById('text-editor');
    if (textEditor) {
        textEditor.addEventListener('input', (e) => {
            try { localStorage.setItem('OMNI_SAVED_TEXT', e.target.value); } catch (err) {}
        });
    }

    window.addEventListener('resize', () => {
        if (currentMode === 'pdf' && pdfDoc) {
            applyPdfScale();
        }
    });

    // Android Hardware Back Button Handler (Capacitor)
    const CapApp = window.CapacitorApp
        || (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App);
    if (CapApp && CapApp.addListener) {
        try {
            CapApp.addListener('backButton', () => {
                const chatView = document.getElementById('chat-view');
                if (chatView && !chatView.classList.contains('hidden')) {
                    closeChatView();
                    return;
                }
                const aiModal = document.getElementById('ai-modal');
                if (aiModal && !aiModal.classList.contains('hidden')) {
                    closeModal();
                    return;
                }
                const cropModal = document.getElementById('crop-modal');
                if (cropModal && !cropModal.classList.contains('hidden')) {
                    closeCropModal();
                    return;
                }

                const dashboard = document.getElementById('dashboard-view');
                const isOnDashboard = dashboard && !dashboard.classList.contains('opacity-0') && dashboard.style.display !== 'none';

                if (!isOnDashboard) {
                    if (currentMode === 'text' && isTextEditing) {
                        toggleTextEdit(false);
                    } else if (currentMode === 'edit') {
                        switchMode('pdf');
                    } else {
                        showDashboard();
                    }
                } else if (CapApp.exitApp) {
                    CapApp.exitApp();
                }
            });
        } catch (err) {
            console.warn('Back button registration failed:', err);
        }
    }
});
