// ============================================================
// INTERACTIVE AI QUIZ RENDERER
// ============================================================

function renderQuiz() {
    const content = document.getElementById('modal-content');
    const modalFooter = document.getElementById('modal-footer');
    if (modalFooter) modalFooter.style.display = 'none';
    if (!content) return;

    const { questions, currentIndex, score, answered, userAnswer } = _aiState.quiz;

    if (!questions || questions.length === 0) {
        content.className = 'overflow-y-auto min-h-[200px] p-6';
        content.innerHTML = `<div class="text-center text-gray-500 py-8 font-semibold">Could not generate quiz questions from this text. Please try again.</div>`;
        return;
    }

    if (currentIndex >= questions.length) {
        const pct = Math.round((score / questions.length) * 100);
        content.className = 'overflow-y-auto min-h-[200px] p-6';
        content.innerHTML = `
            <div class="flex flex-col items-center text-center py-6 gap-4">
                <div class="w-20 h-20 rounded-3xl bg-pink-50 text-pink-600 flex items-center justify-center text-3xl shadow-inner">
                    <i class="fas fa-trophy"></i>
                </div>
                <h4 class="text-2xl font-black text-gray-900">Quiz Complete!</h4>
                <p class="text-sm text-gray-500 font-semibold">You scored <span class="text-pink-600 font-black">${score} / ${questions.length}</span> (${pct}%)</p>
                <button onclick="restartQuiz()" class="mt-2 px-6 py-3 bg-primary-gradient text-white rounded-2xl font-bold text-sm shadow-premium active-scale">
                    <i class="fas fa-rotate-right mr-2"></i> Try Again
                </button>
            </div>
        `;
        return;
    }

    const q = questions[currentIndex];
    const progressPct = Math.round(((currentIndex + 1) / questions.length) * 100);

    content.className = 'overflow-y-auto min-h-[200px] p-6 w-full';
    content.innerHTML = `
        <div class="w-full max-w-xl mx-auto flex flex-col gap-4">
            <div class="flex items-center justify-between text-xs font-bold text-gray-400 uppercase tracking-wider">
                <span>Question ${currentIndex + 1} of ${questions.length}</span>
                <span>Score: ${score}</span>
            </div>
            <div class="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div class="h-full bg-primary-gradient transition-all duration-300" style="width:${progressPct}%"></div>
            </div>
            <div class="text-base font-extrabold text-gray-900 leading-snug mt-1">${escapeHtml(q.question)}</div>
            <div class="flex flex-col gap-2.5 mt-1">
                ${q.options.map((opt, idx) => {
                    let cls = 'bg-gray-50 border-gray-200 text-gray-800 hover:border-pink-300';
                    if (answered) {
                        if (idx === q.answer) cls = 'bg-green-50 border-green-500 text-green-800 font-bold';
                        else if (idx === userAnswer) cls = 'bg-red-50 border-red-400 text-red-700';
                        else cls = 'bg-gray-50 border-gray-100 text-gray-400';
                    }
                    const letter = String.fromCharCode(65 + idx);
                    return `
                        <button onclick="selectQuizOption(${idx})" ${answered ? 'disabled' : ''}
                            class="w-full text-left p-3.5 rounded-2xl border-2 transition-all flex items-center gap-3 text-sm ${cls}">
                            <span class="w-7 h-7 rounded-lg bg-white border border-gray-200 flex items-center justify-center text-xs font-black flex-shrink-0">${letter}</span>
                            <span class="flex-1">${escapeHtml(opt)}</span>
                        </button>
                    `;
                }).join('')}
            </div>
            ${answered && q.explanation ? `
                <div class="p-3.5 rounded-2xl bg-indigo-50 border border-indigo-100 text-xs text-indigo-900 leading-relaxed">
                    <strong>Explanation:</strong> ${escapeHtml(q.explanation)}
                </div>
            ` : ''}
            ${answered ? `
                <button onclick="nextQuizQuestion()" class="self-end px-6 py-2.5 bg-primary-gradient text-white rounded-xl font-bold text-sm shadow-premium active-scale">
                    ${currentIndex + 1 >= questions.length ? 'Finish' : 'Next Question'} <i class="fas fa-arrow-right ml-1.5"></i>
                </button>
            ` : ''}
        </div>
    `;
}

function selectQuizOption(idx) {
    const state = _aiState.quiz;
    if (state.answered) return;
    state.answered = true;
    state.userAnswer = idx;
    const q = state.questions[state.currentIndex];
    if (q && idx === q.answer) state.score++;
    renderQuiz();
}

function nextQuizQuestion() {
    const state = _aiState.quiz;
    state.currentIndex++;
    state.answered = false;
    state.userAnswer = null;
    renderQuiz();
}

function restartQuiz() {
    _aiState.quiz.currentIndex = 0;
    _aiState.quiz.score = 0;
    _aiState.quiz.answered = false;
    _aiState.quiz.userAnswer = null;
    renderQuiz();
}
