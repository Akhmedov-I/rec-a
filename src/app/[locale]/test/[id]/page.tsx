"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import { db, TestSession, BlockResult } from '@/lib/db';
import { collection, query, where, getDocs, updateDoc, doc, Timestamp } from 'firebase/firestore';
import { useParams } from 'next/navigation';
import { Loader2, AlertCircle, CheckCircle, Clock, ChevronLeft, ChevronRight, Lock } from 'lucide-react';

/* ───────────────────────────────────────────────────────────
   Types
──────────────────────────────────────────────────────────── */
type Stage = 'loading' | 'invalid' | 'used' | 'intro' | 'testing' | 'completed';
type Lang = 'ru' | 'uz';

const T = {
    ru: {
        welcome: 'Добро пожаловать!',
        subtitle: 'Персональное тестирование для кандидата:',
        candidate: 'Кандидат',
        position: 'Должность',
        chooseLanguage: 'Выберите язык тестирования:',
        info3blocks: '3 блока по 10 вопросов',
        infoBlockTypes: 'Личностный профиль — Логика — Профессиональные знания',
        info10min: '10 минут на каждый блок',
        infoAutoEnd: 'По истечении времени блок завершается автоматически',
        infoOrder: 'Свободный порядок вопросов',
        infoOrderSub: 'В каждом блоке выбирайте любой вопрос, меняйте ответы до завершения блока.',
        start: 'Начать тестирование →',
        blockOf: (cur: number, total: number) => `Блок ${cur} из ${total}`,
        question: (cur: number, total: number) => `Вопрос ${cur} из ${total}`,
        timeLeft: 'Осталось',
        answered: (n: number, t: number) => `Отвечено: ${n}/${t}`,
        finishBlock: (isLast: boolean) => isLast ? 'Завершить тестирование ✓' : 'Завершить блок → Следующий',
        prev: 'Назад',
        next: 'Вперёд',
        thankyou: 'Тестирование завершено',
        thankyouSub: (name: string, company: string) =>
            `Спасибо, ${name}! Ваши результаты переданы рекрутеру компании ${company}.`,
        canClose: 'Вкладку можно закрыть.',
        invalidTitle: 'Ссылка недействительна',
        invalidSub: 'Тест не найден. Проверьте ссылку или запросите новую у рекрутера.',
        usedTitle: 'Тест уже пройден',
        usedSub: 'Эта ссылка уже была использована. Если вам нужна новая ссылка — обратитесь к рекрутеру.',
        unanswered: 'Не отвечен',
    },
    uz: {
        welcome: 'Xush kelibsiz!',
        subtitle: 'Nomzod uchun shaxsiy test:',
        candidate: 'Nomzod',
        position: 'Lavozim',
        chooseLanguage: 'Test tilini tanlang:',
        info3blocks: '3 blok, har birida 10 ta savol',
        infoBlockTypes: 'Shaxsiy profil — Mantiq — Kasbiy bilim',
        info10min: 'Har blokka 10 daqiqa',
        infoAutoEnd: 'Vaqt tugaganda blok avtomatik tugaydi',
        infoOrder: 'Savollar erkin tartibda',
        infoOrderSub: "Har bir blokda istalgan savolni tanlang, blok tugaguncha javoblarni o'zgartira olasiz.",
        start: 'Testni boshlash →',
        blockOf: (cur: number, total: number) => `${cur}-blok / ${total}`,
        question: (cur: number, total: number) => `${cur}-savol / ${total}`,
        timeLeft: 'Qoldi',
        answered: (n: number, t: number) => `Javob berildi: ${n}/${t}`,
        finishBlock: (isLast: boolean) => isLast ? 'Testni yakunlash ✓' : "Blokni yakunlash → Keyingisi",
        prev: 'Oldingi',
        next: 'Keyingi',
        thankyou: 'Test yakunlandi',
        thankyouSub: (name: string, company: string) =>
            `Rahmat, ${name}! Natijalaringiz ${company} rekruteriga yuborildi.`,
        canClose: "Tabni yopishingiz mumkin.",
        invalidTitle: 'Havola yaroqsiz',
        invalidSub: "Test topilmadi. Havolani tekshiring yoki rekruterdan yangi so'rang.",
        usedTitle: 'Test allaqachon topshirilgan',
        usedSub: "Bu havola allaqachon ishlatilgan. Yangi havola uchun rekruterga murojaat qiling.",
        unanswered: 'Javob berilmagan',
    },
};

/* ───────────────────────────────────────────────────────────
   Main component
──────────────────────────────────────────────────────────── */
export default function CandidateTestPage() {
    const params = useParams();
    const token = params.id as string;

    const [session, setSession] = useState<TestSession | null>(null);
    const [sessionDocId, setSessionDocId] = useState<string>('');
    const [stage, setStage] = useState<Stage>('loading');
    const [lang, setLang] = useState<Lang>('ru');

    // ── Test runtime state ─────────────────────────────────
    const [blockIndex, setBlockIndex] = useState(0);
    const [questionIndex, setQuestionIndex] = useState(0);
    const [answers, setAnswers] = useState<number[]>([]);
    const [timeLeft, setTimeLeft] = useState(10 * 60);
    const [collectedResults, setCollectedResults] = useState<BlockResult[]>([]);
    const [submitting, setSubmitting] = useState(false);
    const advancingRef = useRef(false);

    // For auto-save: hold current answers in a ref that beforeunload can access
    const answersRef = useRef<number[]>([]);
    const collectedResultsRef = useRef<BlockResult[]>([]);
    const blockIndexRef = useRef(0);
    const sessionRef = useRef<TestSession | null>(null);
    const sessionDocIdRef = useRef<string>('');

    // Keep refs in sync
    useEffect(() => { answersRef.current = answers; }, [answers]);
    useEffect(() => { collectedResultsRef.current = collectedResults; }, [collectedResults]);
    useEffect(() => { blockIndexRef.current = blockIndex; }, [blockIndex]);
    useEffect(() => { sessionRef.current = session; }, [session]);
    useEffect(() => { sessionDocIdRef.current = sessionDocId; }, [sessionDocId]);

    /* ── Load session ────────────────────────────────────── */
    useEffect(() => {
        const load = async () => {
            try {
                const q = query(collection(db, 'tests'), where('token', '==', token));
                const snap = await getDocs(q);
                if (snap.empty) { setStage('invalid'); return; }

                const sessDoc = snap.docs[0];
                const sess = { id: sessDoc.id, ...sessDoc.data() } as TestSession;
                setSession(sess);
                setSessionDocId(sessDoc.id);

                // #1: One-time link — only 'pending' shows the intro
                if (sess.status === 'completed' || sess.status === 'in_progress') {
                    setStage('used');
                    return;
                }
                setStage('intro');
            } catch (e) {
                console.error(e);
                setStage('invalid');
            }
        };
        load();
    }, [token]);

    /* ── #2 Auto-save on tab close (beforeunload) ─────────── */
    useEffect(() => {
        if (stage !== 'testing') return;

        const savePartial = () => {
            const sess = sessionRef.current;
            const docId = sessionDocIdRef.current;
            if (!sess || !docId) return;

            const currentBlock = sess.blocks[blockIndexRef.current];
            if (!currentBlock) return;

            const finalAnswers = answersRef.current;
            const currentResult: BlockResult = {
                blockName: currentBlock.name,
                score: 0,
                maxScore: currentBlock.questions?.length ?? 0,
                answers: finalAnswers,
                questions: currentBlock.questions ?? [],
            };
            currentBlock.questions?.forEach((q, i) => {
                if (finalAnswers[i] === q.correctAnswer) currentResult.score++;
            });

            const allResults = [...collectedResultsRef.current, currentResult];

            // Use sendBeacon for reliable fire-and-forget on tab close
            const payload = JSON.stringify({
                sessionId: docId,
                blockResults: allResults,
                totalBlocks: sess.blocks.length,
                completedBlocks: blockIndexRef.current,
            });
            navigator.sendBeacon('/api/testing/partial', new Blob([payload], { type: 'application/json' }));
        };

        window.addEventListener('beforeunload', savePartial);
        return () => window.removeEventListener('beforeunload', savePartial);
    }, [stage]);

    /* ── Anti-copy during test ─────────────────────────── */
    useEffect(() => {
        if (stage !== 'testing') return;
        const no = (e: Event) => e.preventDefault();
        document.addEventListener('contextmenu', no);
        document.addEventListener('copy', no);
        document.addEventListener('selectstart', no);
        return () => {
            document.removeEventListener('contextmenu', no);
            document.removeEventListener('copy', no);
            document.removeEventListener('selectstart', no);
        };
    }, [stage]);

    /* ── Advance / finish block ──────────────────────────── */
    const advanceBlock = useCallback(async (forcedAnswers?: number[]) => {
        if (!session || advancingRef.current) return;
        advancingRef.current = true;
        const finalAnswers = forcedAnswers ?? answers;
        const block = session.blocks[blockIndex];

        // Block 1 (index 0) = Личностный профиль — no right/wrong answers.
        // Score is not computed; only answer pattern is stored for AI analysis.
        const isPersonalityBlock = blockIndex === 0;

        const result: BlockResult = {
            blockName: block.name,
            score: 0,
            maxScore: isPersonalityBlock ? 0 : (block.questions?.length ?? 0), // 0 = not scored
            answers: finalAnswers,
            questions: block.questions ?? [],
        };

        if (!isPersonalityBlock) {
            // Only score blocks 2 and 3
            result.questions.forEach((q, i) => {
                if (finalAnswers[i] === q.correctAnswer) result.score++;
            });
        }

        const newResults = [...collectedResults, result];
        setCollectedResults(newResults);

        if (blockIndex < session.blocks.length - 1) {
            const next = blockIndex + 1;
            setBlockIndex(next);
            setQuestionIndex(0);
            setAnswers(new Array(session.blocks[next].questions?.length ?? 0).fill(-1));
            setTimeLeft(session.blocks[next].timeLimit * 60);
            advancingRef.current = false;
        } else {
            await submitTest(newResults);
        }
    }, [session, blockIndex, answers, collectedResults]);


    /* ── Timer ───────────────────────────────────────────── */
    useEffect(() => {
        if (stage !== 'testing') return;
        const timer = setInterval(() => {
            setTimeLeft(prev => {
                if (prev <= 1) { clearInterval(timer); advanceBlock(); return 0; }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(timer);
    }, [stage, blockIndex]); // eslint-disable-line react-hooks/exhaustive-deps

    /* ── Start test (#1: mark 'in_progress' immediately) ─── */
    const startTest = async () => {
        if (!session || !sessionDocId) return;
        // Mark as in_progress → link becomes one-time (won't show intro again)
        await updateDoc(doc(db, 'tests', sessionDocId), {
            status: 'in_progress',
            startedAt: Timestamp.now(),
        });
        setAnswers(new Array(session.blocks[0].questions?.length ?? 0).fill(-1));
        setTimeLeft(session.blocks[0].timeLimit * 60);
        setQuestionIndex(0);
        setStage('testing');
    };

    /* ── Submit (with partial results) ───────────────────── */
    const submitTest = async (results: BlockResult[]) => {
        if (!session || submitting) return;
        setSubmitting(true);
        setStage('completed');
        try {
            await fetch('/api/testing/submit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ testSession: { ...session, id: sessionDocId, blockResults: results } }),
            });
        } catch (e) {
            console.error('submit error', e);
        }
    };

    /* ── Answer select ───────────────────────────────────── */
    const selectAnswer = (qIdx: number, optIdx: number) => {
        setAnswers(prev => { const n = [...prev]; n[qIdx] = optIdx; return n; });
    };

    /* ── Helpers ─────────────────────────────────────────── */
    const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    const timeUrgent = timeLeft < 60;
    const t = T[lang];

    /* ═══════════════════════════════════════════════════════
       RENDER STATES
    ════════════════════════════════════════════════════════ */

    if (stage === 'loading') return (
        <div className="flex h-screen items-center justify-center bg-slate-50">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
    );

    if (stage === 'invalid') return (
        <div className="flex h-screen items-center justify-center bg-slate-50 px-4">
            <div className="bg-white p-8 rounded-2xl shadow-md max-w-md w-full text-center">
                <AlertCircle className="w-14 h-14 text-red-500 mx-auto mb-4" />
                <h2 className="text-xl font-bold text-gray-900 mb-2">{t.invalidTitle}</h2>
                <p className="text-gray-500 text-sm">{t.invalidSub}</p>
            </div>
        </div>
    );

    /* #1 — One-time link: show "already used" screen */
    if (stage === 'used') return (
        <div className="flex h-screen items-center justify-center bg-slate-50 px-4">
            <div className="bg-white p-8 rounded-2xl shadow-md max-w-md w-full text-center border border-amber-200">
                <Lock className="w-14 h-14 text-amber-500 mx-auto mb-4" />
                <h2 className="text-xl font-bold text-gray-900 mb-2">{t.usedTitle}</h2>
                <p className="text-gray-500 text-sm">{t.usedSub}</p>
            </div>
        </div>
    );

    if (stage === 'completed') return (
        <div className="flex h-screen items-center justify-center bg-slate-50 px-4">
            <div className="bg-white p-8 rounded-2xl shadow-md max-w-md w-full text-center border border-green-200">
                <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
                <h2 className="text-2xl font-bold text-gray-900 mb-2">{t.thankyou}</h2>
                <p className="text-gray-500 mt-2 text-sm">
                    {t.thankyouSub(session?.candidateName || '', session?.companyName || '')}
                </p>
                <p className="text-gray-400 text-xs mt-4">{t.canClose}</p>
            </div>
        </div>
    );

    /* ── INTRO screen ────────────────────────────────────── */
    if (stage === 'intro') return (
        <div className="min-h-screen bg-slate-50 flex flex-col">
            <header className="bg-white border-b px-6 py-4 flex items-center justify-between">
                <span className="font-semibold text-blue-600 text-base tracking-tight">Rec-A</span>
                <span className="font-bold text-gray-900 text-base">{session?.companyName}</span>
            </header>

            <div className="flex-1 flex items-center justify-center px-4 py-12">
                <div className="bg-white border border-gray-100 rounded-2xl shadow-sm max-w-xl w-full p-8">
                    <h1 className="text-2xl font-bold text-gray-900 mb-1">{t.welcome}</h1>
                    <p className="text-gray-500 mb-5 text-sm">{t.subtitle}</p>

                    {/* Language selector */}
                    <div className="mb-5 p-4 bg-indigo-50 border border-indigo-100 rounded-xl">
                        <p className="text-xs font-bold text-indigo-700 uppercase tracking-wider mb-2">{t.chooseLanguage}</p>
                        <div className="flex gap-3">
                            <button onClick={() => setLang('ru')}
                                className={`flex-1 py-2.5 rounded-xl font-bold text-sm border-2 transition-all ${lang === 'ru' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300'}`}>
                                🇷🇺 Русский
                            </button>
                            <button onClick={() => setLang('uz')}
                                className={`flex-1 py-2.5 rounded-xl font-bold text-sm border-2 transition-all ${lang === 'uz' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300'}`}>
                                🇺🇿 O'zbek
                            </button>
                        </div>
                    </div>

                    <div className="bg-blue-50 border border-blue-100 rounded-xl px-5 py-4 mb-5">
                        <p className="text-xs text-blue-600 font-bold uppercase tracking-wider mb-0.5">{t.candidate}</p>
                        <p className="text-lg font-bold text-blue-900">{session?.candidateName}</p>
                        <p className="text-sm text-blue-700 mt-0.5">{t.position}: {session?.position}</p>
                    </div>

                    <div className="space-y-2.5 mb-8 text-sm text-gray-600">
                        <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl">
                            <span className="text-xl">📋</span>
                            <div><p className="font-semibold text-gray-800">{t.info3blocks}</p><p className="text-gray-500">{t.infoBlockTypes}</p></div>
                        </div>
                        <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl">
                            <span className="text-xl">⏱️</span>
                            <div><p className="font-semibold text-gray-800">{t.info10min}</p><p className="text-gray-500">{t.infoAutoEnd}</p></div>
                        </div>
                        <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl">
                            <span className="text-xl">🔀</span>
                            <div><p className="font-semibold text-gray-800">{t.infoOrder}</p><p className="text-gray-500">{t.infoOrderSub}</p></div>
                        </div>
                    </div>

                    <button onClick={startTest}
                        className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-all text-base shadow-md shadow-blue-200">
                        {t.start}
                    </button>
                </div>
            </div>
        </div>
    );

    /* ── TESTING screen ──────────────────────────────────── */
    const currentBlock = session?.blocks[blockIndex];
    if (!currentBlock) return null;

    const questions = currentBlock.questions ?? [];
    const totalQ = questions.length;
    const answeredCount = answers.filter(a => a !== -1).length;
    const allAnswered = answeredCount === totalQ;
    const currentQ = questions[questionIndex];

    return (
        <div className="min-h-screen bg-slate-100 flex flex-col select-none" style={{ userSelect: 'none' }}>
            {/* ── Sticky header ── */}
            <header className="bg-white border-b sticky top-0 z-20 shadow-sm">
                <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                        <p className="text-xs text-gray-400 leading-tight">{t.blockOf(blockIndex + 1, session!.blocks.length)}</p>
                        <p className="text-sm font-bold text-gray-800 leading-tight truncate">{currentBlock.name}</p>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                        <span className="text-xs text-gray-500 hidden sm:inline">{t.answered(answeredCount, totalQ)}</span>
                        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-mono font-bold text-sm transition-colors ${timeUrgent ? 'bg-red-100 text-red-700 animate-pulse' : 'bg-gray-100 text-gray-700'}`}>
                            <Clock className="w-3.5 h-3.5" />
                            {fmtTime(timeLeft)}
                        </div>
                    </div>
                </div>
                {/* Progress bar */}
                <div className="h-1 bg-gray-100">
                    <div className="h-full bg-blue-500 transition-all duration-500"
                        style={{ width: `${(answeredCount / Math.max(1, totalQ)) * 100}%` }} />
                </div>
            </header>

            {/* ── Question navigation dots ── */}
            <div className="bg-white border-b">
                <div className="max-w-2xl mx-auto px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                        {questions.map((_, qi) => (
                            <button key={qi} onClick={() => setQuestionIndex(qi)}
                                className={`w-9 h-9 rounded-lg text-xs font-bold border-2 transition-all ${qi === questionIndex
                                    ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                                    : answers[qi] !== -1
                                        ? 'bg-green-50 text-green-700 border-green-300'
                                        : 'bg-gray-50 text-gray-500 border-gray-200 hover:border-blue-300'
                                    }`}>
                                {qi + 1}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* ── Single question ── */}
            <main className="flex-1 py-6 px-4">
                <div className="max-w-2xl mx-auto">
                    <div className={`bg-white rounded-2xl border p-6 shadow-sm mb-4 transition-all ${answers[questionIndex] !== -1 ? 'border-blue-200' : 'border-gray-200'}`}>
                        <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-3">
                            {t.question(questionIndex + 1, totalQ)}
                        </p>
                        <p className="text-base font-semibold text-gray-900 mb-5 leading-relaxed">
                            {currentQ?.question}
                        </p>
                        <div className="space-y-2.5">
                            {currentQ?.options.map((opt, oi) => (
                                <button key={oi} onClick={() => selectAnswer(questionIndex, oi)}
                                    className={`w-full flex items-center gap-3 p-4 border-2 rounded-xl text-left transition-all ${answers[questionIndex] === oi
                                        ? 'bg-blue-50 border-blue-400 text-blue-900 shadow-sm'
                                        : 'border-gray-200 bg-gray-50 hover:bg-white hover:border-blue-200 text-gray-700'
                                        }`}>
                                    <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black shrink-0 transition-colors ${answers[questionIndex] === oi ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-500'}`}>
                                        {['А', 'Б', 'В', 'Г'][oi]}
                                    </span>
                                    <span className="text-sm font-medium">{opt}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Navigation */}
                    <div className="flex items-center justify-between gap-3">
                        <button onClick={() => setQuestionIndex(i => Math.max(0, i - 1))}
                            disabled={questionIndex === 0}
                            className="flex items-center gap-1.5 px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all">
                            <ChevronLeft className="w-4 h-4" /> {t.prev}
                        </button>

                        {questionIndex < totalQ - 1 ? (
                            <button onClick={() => setQuestionIndex(i => Math.min(totalQ - 1, i + 1))}
                                className="flex items-center gap-1.5 px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-all">
                                {t.next} <ChevronRight className="w-4 h-4" />
                            </button>
                        ) : (
                            <button onClick={() => advanceBlock()}
                                disabled={advancingRef.current}
                                className={`flex-1 py-2.5 font-bold rounded-xl text-sm transition-all shadow-sm ${allAnswered ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-200' : 'bg-amber-500 hover:bg-amber-600 text-white'}`}>
                                {t.finishBlock(blockIndex === session!.blocks.length - 1)}
                                {!allAnswered && <span className="ml-2 text-amber-100 text-xs font-normal">({answeredCount}/{totalQ})</span>}
                            </button>
                        )}
                    </div>

                    {/* Always-visible finish button (not on last question) */}
                    {questionIndex !== totalQ - 1 && (
                        <div className="mt-3">
                            <button onClick={() => advanceBlock()}
                                disabled={advancingRef.current}
                                className={`w-full py-2.5 font-bold rounded-xl text-sm border-2 transition-all ${allAnswered ? 'border-blue-500 text-blue-600 bg-blue-50 hover:bg-blue-100' : 'border-gray-300 text-gray-400 bg-gray-50 hover:border-amber-400 hover:text-amber-600'}`}>
                                {t.finishBlock(blockIndex === session!.blocks.length - 1)}
                                {!allAnswered && <span className="ml-2 text-xs font-normal opacity-70">({answeredCount}/{totalQ})</span>}
                            </button>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}
