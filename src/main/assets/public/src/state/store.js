// ============================================================
// GLOBAL APPLICATION STATE STORE
// ============================================================

// Standard local endpoint (10.0.2.2 for Android emulator -> host PC, localhost for browser/device)
const DEFAULT_OLLAMA_URL = (typeof window !== 'undefined' && window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform())
    ? 'http://10.0.2.2:11434'
    : 'http://localhost:11434';
const DEFAULT_OLLAMA_MODEL = 'gemma3:4b';

let AI_CONFIG = (() => {
    try {
        const raw = localStorage.getItem('AI_CONFIG');
        if (raw) return JSON.parse(raw);
    } catch (e) {
        console.warn('Corrupted AI_CONFIG in localStorage, resetting:', e);
    }
    return null;
})() || {
    activeProvider: 'ollama',
    ollamaModel: DEFAULT_OLLAMA_MODEL,
    keys: { gemini: '', openai: '', claude: '', deepseek: '', meta: '', ollama: DEFAULT_OLLAMA_URL }
};

if (!AI_CONFIG.keys) AI_CONFIG.keys = {};
if (!AI_CONFIG.keys.ollama || AI_CONFIG.keys.ollama.trim() === '') {
    AI_CONFIG.keys.ollama = DEFAULT_OLLAMA_URL;
}
if (!AI_CONFIG.ollamaModel || AI_CONFIG.ollamaModel.trim() === '') {
    AI_CONFIG.ollamaModel = DEFAULT_OLLAMA_MODEL;
}
const _hasAnyOtherKey = ['gemini', 'openai', 'claude', 'deepseek', 'meta']
    .some(p => AI_CONFIG.keys[p] && AI_CONFIG.keys[p].length > 10);
if (!_hasAnyOtherKey && !AI_CONFIG.activeProvider) {
    AI_CONFIG.activeProvider = 'ollama';
}
try {
    localStorage.setItem('AI_CONFIG', JSON.stringify(AI_CONFIG));
} catch (e) { /* ignore storage quota errors */ }

const _aiState = {
    quiz: { questions: [], currentIndex: 0, score: 0, answered: false, userAnswer: null },
    flashcards: { cards: [], currentIndex: 0, known: [], review: [] },
    rawMarkdown: ''
};

let chatHistory = (() => {
    try {
        const raw = sessionStorage.getItem('chatHistory');
        if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) return parsed;
        }
    } catch (e) { /* ignore */ }
    return [];
})();

// Core TTS & Reader State Variables
let availableVoices = [];
let webVoicesCache = [];
let ttsBackend = null; // 'native' | 'web'

let pdfDoc = null;
let isPlaying = false;
let speed = 1.0;
let currentVoice = null;
let isLooping = false;
let currentMode = 'pdf';

let pdfWords = [];
let textWords = [];
let pdfActiveIndex = -1;
let textActiveIndex = -1;
let isSelectionReading = false;
let selectionWordIndices = [];
let activeSelectedText = '';
let utteranceWordMap = [];
let readerTokenMeta = { pdf: [], text: [], modal: [] };
let lastHighlightedEl = null;
let isTextEditing = true;
let lastPdfFile = null;
let isTwoPage = false;
let twoPageOption = 1;
let isSplitView = false;

// Editor & Panning State
let fabricCanvas = null;
let editorTool = 'select';
let editorHistory = [];
let redoStack = [];
let activeShapeType = null;
let isDrawingShape = false;
let drawingObject = null;
let shapeStartPoint = null;
let isDragging = false;
let lastPosX = 0;
let lastPosY = 0;
let lastEraserX = 0;
let lastEraserY = 0;

// Player Bar Drag State
let isPlayerMinimized = false;
let isPlayerDragging = false;
let playerDragStartX = 0;
let playerDragStartY = 0;
let playerInitialX = 0;
let playerInitialY = 0;
let lastPlayerTap = 0;

function updateWordCountBadge(count) {
    const numEl = document.getElementById('word-count-num');
    if (numEl) numEl.innerText = String(count);
    const badgeEl = document.getElementById('word-count-badge');
    if (badgeEl) badgeEl.innerText = `${count} Words`;
}
