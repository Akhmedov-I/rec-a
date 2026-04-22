import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { doc, updateDoc, Timestamp } from 'firebase/firestore';

export async function POST(req: NextRequest) {
    try {
        const { testSession } = await req.json();
        if (!testSession || !testSession.blockResults) {
            return NextResponse.json({ error: 'blockResults required' }, { status: 400 });
        }

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) return NextResponse.json({ error: 'No API key' }, { status: 500 });

        const results = testSession.blockResults as Array<{
            blockName: string;
            score: number;
            maxScore: number;
            answers: number[];
            questions: Array<{ question: string; options: string[]; correctAnswer: number }>;
        }>;

        // Block 1 = Personality (no scoring, just pattern)
        const block1 = results[0];
        const block2 = results[1];
        const block3 = results[2];

        // ── Block 1: psychotype inference from answer distribution ──
        const b1Answers = (block1?.answers || []) as number[];
        const counts = [0, 0, 0, 0];
        b1Answers.forEach(a => { if (a >= 0 && a <= 3) counts[a]++; });
        const total1 = counts.reduce((s, c) => s + c, 0);

        // Build personality description from answer pattern:
        // 0 = инициативный/активный (гипертим), 1 = эмоциональный/ориентированный на людей (демонстративный/паранойяльный)
        // 2 = педантичный/осторожный (эпилептоид/тревожный), 3 = независимый/аналитичный (шизоид)
        const pct = (i: number) => total1 > 0 ? Math.round((counts[i] / total1) * 100) : 0;
        const personalityBreakdown = `Инициативность/активность: ${pct(0)}%, Эмпатия/коммуникабельность: ${pct(1)}%, Педантизм/осторожность: ${pct(2)}%, Независимость/аналитичность: ${pct(3)}%`;

        // Dominant psychotype
        const dominantIdx = counts.indexOf(Math.max(...counts));
        const psychotypeMap: Record<number, string> = {
            0: 'Гипертим (активный, лидерский, инициативный)',
            1: 'Демонстративный/Паранойяльный (коммуникабельный, ориентирован на людей)',
            2: 'Эпилептоид/Тревожный (педантичный, ответственный, методичный)',
            3: 'Шизоид (независимый, аналитичный, нестандартное мышление)',
        };
        const max = Math.max(...counts);
        const nearMax = counts.filter(c => c >= max - 1).length >= 2;
        const psychotype = nearMax ? 'Смешанный тип (адаптивный)' : (psychotypeMap[dominantIdx] || 'Не определён');

        // Map Block 1 answers to actual option texts for AI context
        const b1AnswerTexts = (block1?.questions || []).slice(0, 10).map((q, i) => {
            const chosen = b1Answers[i];
            return `В: ${q.question} → О: ${chosen >= 0 ? (q.options[chosen] || 'Нет ответа') : 'Нет ответа'}`;
        }).join('\n');

        // ── Block 2 & 3 scores ──
        const b2Pct = block2?.maxScore > 0 ? Math.round((block2.score / block2.maxScore) * 100) : null;
        const b3Pct = block3?.maxScore > 0 ? Math.round((block3.score / block3.maxScore) * 100) : null;

        const scoreLabel = (pct: number | null) =>
            pct === null ? 'не пройден' :
                pct >= 80 ? `${pct}% — высокий уровень` :
                    pct >= 60 ? `${pct}% — выше среднего` :
                        pct >= 40 ? `${pct}% — средний уровень` :
                            `${pct}% — ниже среднего`;

        const prompt = `Ты — HR-психолог и аналитик. Напиши КРАТКИЙ (не более 5 предложений на каждый пункт) отчёт для рекрутера. Будь конкретным, без воды.

Кандидат: ${testSession.candidateName || 'Не указан'}
Должность: ${testSession.position || 'Не указана'}

═══ БЛОК 1 — ЛИЧНОСТНЫЙ ПРОФИЛЬ ═══
Определённый психотип: ${psychotype}
Распределение ответов: ${personalityBreakdown}
Конкретные ответы кандидата:
${b1AnswerTexts || 'Нет данных'}

═══ БЛОК 2 — ЛОГИКА И АНАЛИТИКА ═══
Результат: ${scoreLabel(b2Pct)}

═══ БЛОК 3 — ПРОФЕССИОНАЛЬНЫЕ ЗНАНИЯ ═══
Результат: ${scoreLabel(b3Pct)}

НАПИШИ 3 КОРОТКИХ БЛОКА:

1. ЛИЧНОСТНЫЙ ПРОФИЛЬ:
На основе ответов кандидата опиши его характер и стиль поведения (2-3 предложения). Скажи, подходит ли этот психотип для должности "${testSession.position || 'данной должности'}" и почему (1-2 предложения).

2. ЛОГИКА И ПРОФЕССИОНАЛЬНЫЕ ЗНАНИЯ:
Дай короткий комментарий (1-2 предложения) по каждому из блоков 2 и 3. Укажи уровень и ключевой вывод.

3. ИТОГ:
Одно предложение — рекомендация: приглашать на собеседование или нет.`;

        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
        const resp = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0.4, maxOutputTokens: 1024 },
            }),
        });

        const data = await resp.json();
        const aiText = data?.candidates?.[0]?.content?.parts?.[0]?.text || 'Анализ завершён.';

        // Overall score: only blocks 2 and 3 contribute (block 1 is personality – not scored)
        const scoredBlocks = [block2, block3].filter(b => b?.maxScore > 0);
        const totalScore = scoredBlocks.reduce((s, b) => s + b.score, 0);
        const totalMax = scoredBlocks.reduce((s, b) => s + b.maxScore, 0);
        const overallPct = totalMax > 0 ? Math.round((totalScore / totalMax) * 100) : 0;

        await updateDoc(doc(db, 'tests', testSession.id), {
            status: 'completed',
            completedAt: Timestamp.now(),
            blockResults: results,
            aiRecommendation: aiText,
            psychotype,
            personalityBreakdown,
            overallScore: overallPct,
            block2Score: b2Pct ?? 0,
            block3Score: b3Pct ?? 0,
        });

        // ── Recalculate candidate AI rating combining CV + test results ──
        let combinedRating: number | null = null;
        if (testSession.candidateId) {
            try {
                const { getDoc } = await import('firebase/firestore');
                const candSnap = await getDoc(doc(db, 'candidates', testSession.candidateId));
                if (candSnap.exists()) {
                    const cvRating = (candSnap.data().aiRating as number) ?? 50;
                    // Weighted: 60% CV-based, 40% test performance (blocks 2+3)
                    combinedRating = Math.round(cvRating * 0.6 + overallPct * 0.4);
                    await updateDoc(doc(db, 'candidates', testSession.candidateId), {
                        aiRating: combinedRating,
                        aiRatingCv: cvRating,       // preserve original CV-only score
                        aiRatingTest: overallPct,    // store test score separately
                        testRatingUpdated: true,
                    });
                }
            } catch (e) {
                console.error('Could not update candidate rating:', e);
            }
        }

        return NextResponse.json({ aiRecommendation: aiText, psychotype, overallScore: overallPct, combinedRating });
    } catch (err) {
        console.error('Error submitting test:', err);
        try {
            const { testSession } = await req.clone().json().catch(() => ({ testSession: null }));
            if (testSession?.id) {
                await updateDoc(doc(db, 'tests', testSession.id), {
                    status: 'completed',
                    completedAt: Timestamp.now(),
                    blockResults: testSession.blockResults || [],
                    aiRecommendation: 'Ошибка генерации отчёта.',
                });
            }
        } catch { /* ignore */ }
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
