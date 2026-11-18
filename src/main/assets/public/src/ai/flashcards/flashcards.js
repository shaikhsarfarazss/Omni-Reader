// ============================================================
// INTERACTIVE AI FLASHCARDS RENDERER
// ============================================================

let _flashcardFlipped = false;

function renderFlashcards() {
    const content = document.getElementById('modal-content');
    const modalFooter = document.getElementById('modal-footer');
    if (modalFooter) modalFooter.style.display = 'none';
    if (!content) return;

    const { cards, currentIndex, known, review } = _aiState.flashcards;

    if (!cards || cards.length === 0) {
        content.className = 'overflow-y-auto min-h-[200px] p-6';
        content.innerHTML = `<div class="text-center text-gray-500 py-8 font-semibold">Could not generate flashcards from this text. Please try again.</div>`;
        return;
    }

    if (currentIndex >= cards.length) {
        content.className = 'overflow-y-auto min-h-[200px] p-6';
        content.innerHTML = `
            <div class="flex flex-col items-center text-center py-6 gap-4">
                <div class="w-20 h-20 rounded-3xl bg-pink-50 text-pink-600 flex items-center justify-center text-3xl shadow-inner">
                    <i class="fas fa-layer-group"></i>
                </div>
                <h4 class="text-2xl font-black text-gray-900">Deck Complete!</h4>
                <p class="text-sm text-gray-500 font-semibold">
                    Known: <span class="text-green-600 font-black">${known.length}</span> &middot;
                    Review: <span class="text-amber-600 font-black">${review.length}</span>
                </p>
                <button onclick="restartFlashcards()" class="mt-2 px-6 py-3 bg-primary-gradient text-white rounded-2xl font-bold text-sm shadow-premium active-scale">
                    <i class="fas fa-rotate-right mr-2"></i> Study Again
                </button>
            </div>
        `;
        return;
    }

    const card = cards[currentIndex];
    _flashcardFlipped = false;

    content.className = 'overflow-y-auto min-h-[200px] p-6 w-full';
    content.innerHTML = `
        <div class="w-full max-w-md mx-auto flex flex-col items-center gap-5">
            <div class="w-full flex items-center justify-between text-xs font-bold text-gray-400 uppercase tracking-wider">
                <span>Card ${currentIndex + 1} of ${cards.length}</span>
                <span>Tap card to flip</span>
            </div>
            <div class="flashcard-scene" onclick="flipFlashcard()">
                <div id="flashcard-inner" class="flashcard-card">
                    <div class="flashcard-face flashcard-front">
                        <span class="text-[10px] font-black uppercase tracking-widest text-pink-500 mb-3">Front</span>
                        <div class="text-base font-extrabold leading-snug">${escapeHtml(card.front)}</div>
                    </div>
                    <div class="flashcard-face flashcard-back">
                        <span class="text-[10px] font-black uppercase tracking-widest text-pink-600 mb-3">Answer</span>
                        <div class="text-sm font-bold leading-relaxed">${escapeHtml(card.back)}</div>
                    </div>
                </div>
            </div>
            <div class="flex items-center justify-between w-full gap-3">
                <button onclick="prevFlashcard()" ${currentIndex === 0 ? 'disabled' : ''}
                    class="px-4 py-2.5 rounded-xl bg-gray-100 text-gray-600 text-xs font-bold disabled:opacity-40">
                    <i class="fas fa-chevron-left"></i>
                </button>
                <button onclick="markFlashcard(false)" class="flex-1 py-2.5 rounded-xl bg-amber-50 text-amber-700 border border-amber-200 text-xs font-bold active-scale">
                    Needs Review
                </button>
                <button onclick="markFlashcard(true)" class="flex-1 py-2.5 rounded-xl bg-green-50 text-green-700 border border-green-200 text-xs font-bold active-scale">
                    Got It ✓
                </button>
            </div>
        </div>
    `;
}

function flipFlashcard() {
    const inner = document.getElementById('flashcard-inner');
    if (!inner) return;
    _flashcardFlipped = !_flashcardFlipped;
    inner.classList.toggle('is-flipped', _flashcardFlipped);
}

function markFlashcard(isKnown) {
    const state = _aiState.flashcards;
    if (isKnown) state.known.push(state.currentIndex);
    else state.review.push(state.currentIndex);
    state.currentIndex++;
    renderFlashcards();
}

function prevFlashcard() {
    const state = _aiState.flashcards;
    if (state.currentIndex > 0) {
        state.currentIndex--;
        renderFlashcards();
    }
}

function restartFlashcards() {
    _aiState.flashcards.currentIndex = 0;
    _aiState.flashcards.known = [];
    _aiState.flashcards.review = [];
    renderFlashcards();
}
