// ============================================================
// JSON EXTRACTION & AI STRUCTURED PARSERS
// ============================================================

function extractJSON(str) {
    if (!str || typeof str !== 'string') return null;
    const cleaned = str.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

    try {
        return JSON.parse(cleaned);
    } catch (e) { /* try substring extraction */ }

    const firstArr = cleaned.indexOf('[');
    const lastArr = cleaned.lastIndexOf(']');
    if (firstArr !== -1 && lastArr > firstArr) {
        try {
            return JSON.parse(cleaned.substring(firstArr, lastArr + 1));
        } catch (e) { /* try object */ }
    }

    const firstObj = cleaned.indexOf('{');
    const lastObj = cleaned.lastIndexOf('}');
    if (firstObj !== -1 && lastObj > firstObj) {
        try {
            const obj = JSON.parse(cleaned.substring(firstObj, lastObj + 1));
            if (Array.isArray(obj.questions)) return obj.questions;
            if (Array.isArray(obj.quiz)) return obj.quiz;
            if (Array.isArray(obj.flashcards)) return obj.flashcards;
            if (Array.isArray(obj.cards)) return obj.cards;
            return obj;
        } catch (e) {
            console.warn('extractJSON failed:', e);
        }
    }
    return null;
}

function normalizeQuizQuestions(arr) {
    if (!Array.isArray(arr)) return [];
    return arr.map((q) => {
        if (!q || typeof q !== 'object') return null;
        const question = String(q.question || q.q || '').trim();
        const options = Array.isArray(q.options) ? q.options.map(o => String(o)) : [];
        if (!question || options.length < 2) return null;

        let answerIdx = 0;
        if (typeof q.answer === 'number' && q.answer >= 0 && q.answer < options.length) {
            answerIdx = q.answer;
        } else if (typeof q.answer === 'string') {
            const letterMap = { A: 0, B: 1, C: 2, D: 3 };
            const upper = q.answer.trim().toUpperCase();
            if (upper in letterMap && letterMap[upper] < options.length) {
                answerIdx = letterMap[upper];
            } else {
                const foundIdx = options.findIndex(o => o.trim().toLowerCase() === q.answer.trim().toLowerCase());
                if (foundIdx >= 0) answerIdx = foundIdx;
            }
        }
        return {
            question,
            options,
            answer: answerIdx,
            explanation: String(q.explanation || '').trim()
        };
    }).filter(Boolean);
}

function fallbackParseQuiz(text) {
    if (!text) return [];
    const blocks = text.split(/\n(?=\d+[\.\)]\s)/);
    const results = [];
    for (const block of blocks) {
        const lines = block.trim().split('\n').map(l => l.trim()).filter(Boolean);
        if (lines.length < 3) continue;
        const question = lines[0].replace(/^\d+[\.\)]\s*/, '');
        const options = [];
        let answerIdx = 0;
        for (let i = 1; i < lines.length; i++) {
            const optMatch = lines[i].match(/^[A-Da-d][\.\)]\s*(.+)/);
            if (optMatch) options.push(optMatch[1]);
            const ansMatch = lines[i].match(/^(?:Answer|Correct)\s*:\s*([A-Da-d0-3])/i);
            if (ansMatch) {
                const v = ansMatch[1].toUpperCase();
                answerIdx = { A: 0, B: 1, C: 2, D: 3 }[v] ?? (parseInt(v, 10) || 0);
            }
        }
        if (question && options.length >= 2) {
            results.push({ question, options, answer: answerIdx, explanation: '' });
        }
    }
    return results;
}

function normalizeFlashcards(arr) {
    if (!Array.isArray(arr)) return [];
    return arr.map(c => {
        if (!c || typeof c !== 'object') return null;
        const front = String(c.front || c.term || c.question || '').trim();
        const back = String(c.back || c.definition || c.answer || '').trim();
        if (!front || !back) return null;
        return { front, back };
    }).filter(Boolean);
}

function fallbackParseFlashcards(text) {
    if (!text) return [];
    const cards = [];
    const pairs = text.split(/\n{2,}/);
    for (const p of pairs) {
        const frontMatch = p.match(/(?:Front|Term|Q)\s*:\s*(.+)/i);
        const backMatch = p.match(/(?:Back|Definition|A)\s*:\s*(.+)/i);
        if (frontMatch && backMatch) {
            cards.push({ front: frontMatch[1].trim(), back: backMatch[1].trim() });
        }
    }
    return cards;
}
