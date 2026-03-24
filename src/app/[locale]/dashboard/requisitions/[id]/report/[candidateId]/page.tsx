"use client";

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { doc, getDoc, query, collection, where, getDocs } from 'firebase/firestore';
import { db, Requisition, Candidate, BlockResult } from '@/lib/db';

/* ─────────────────────────────────────────────────────────────────────────── */
/* Helpers                                                                      */
/* ─────────────────────────────────────────────────────────────────────────── */
const today = () => {
    const d = new Date();
    return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

type TestQuestion = { question: string; options: string[]; correctAnswer: number };
type TestSession = {
    status: string;
    blockResults?: BlockResult[];
    aiRecommendation?: string;
    overallScore?: number;
    psychotype?: string;
    // Full question lists per block (for Q&A page)
    b1Questions?: TestQuestion[];
    b2Questions?: TestQuestion[];
    b3Questions?: TestQuestion[];
    b1Answers?: number[];
    b2Answers?: number[];
    b3Answers?: number[];
};

/* ─────────────────────────────────────────────────────────────────────────── */
export default function CandidateReportPage() {
    const params = useParams();
    const reqId = params.id as string;
    const candidateId = params.candidateId as string;

    const [requisition, setRequisition] = useState<Requisition | null>(null);
    const [candidate, setCandidate] = useState<Candidate | null>(null);
    const [testSession, setTestSession] = useState<TestSession | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const load = async () => {
            try {
                const [reqSnap, candSnap] = await Promise.all([
                    getDoc(doc(db, 'requisitions', reqId)),
                    getDoc(doc(db, 'candidates', candidateId)),
                ]);
                if (reqSnap.exists()) setRequisition({ id: reqSnap.id, ...reqSnap.data() } as Requisition);
                if (candSnap.exists()) setCandidate({ id: candSnap.id, ...candSnap.data() } as Candidate);

                // Load test session — always pick the LATEST test for this candidate
                const tq = query(collection(db, 'tests'), where('candidateId', '==', candidateId));
                const tSnap = await getDocs(tq);
                if (!tSnap.empty) {
                    // Sort by createdAt desc in JS to get the latest test (no composite index needed)
                    const sorted = tSnap.docs.slice().sort((a, b) => {
                        const ta = a.data().createdAt?.toMillis?.() ?? 0;
                        const tb = b.data().createdAt?.toMillis?.() ?? 0;
                        return tb - ta;
                    });
                    const t = sorted[0].data();
                    const br = (t.blockResults || []) as Array<{ questions: TestQuestion[]; answers: number[]; score: number; maxScore: number; blockName: string }>;
                    setTestSession({
                        status: t.status,
                        blockResults: t.blockResults,
                        aiRecommendation: t.aiRecommendation,
                        overallScore: t.overallScore,
                        psychotype: t.psychotype,
                        b1Questions: br[0]?.questions ?? [],
                        b2Questions: br[1]?.questions ?? [],
                        b3Questions: br[2]?.questions ?? [],
                        b1Answers: br[0]?.answers ?? [],
                        b2Answers: br[1]?.answers ?? [],
                        b3Answers: br[2]?.answers ?? [],
                    });
                }
            } catch (e) { console.error(e); }
            finally { setLoading(false); }
        };
        load();
    }, [reqId, candidateId]);

    if (loading) return (
        <div className="flex items-center justify-center min-h-screen">
            <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full" />
        </div>
    );

    if (!requisition || !candidate) return (
        <div className="p-10 text-center text-gray-500">Данные не найдены</div>
    );

    const reqSalary = requisition.salaryMin || requisition.salaryMax
        ? `${requisition.salaryMin ? 'от ' + requisition.salaryMin.toLocaleString('ru-RU') : ''} ${requisition.salaryMax ? 'до ' + requisition.salaryMax.toLocaleString('ru-RU') : ''} сум`
        : 'Не указана';

    const testScore = testSession?.overallScore ?? null;
    const blockResults = testSession?.blockResults ?? [];
    // BlockResult uses blockName (string), not blockIndex — detect by position
    const block1 = blockResults[0] ?? null; // Personality
    const block2 = blockResults[1] ?? null; // Logic
    const block3 = blockResults[2] ?? null; // Professional

    // Helper: count answered (non -1), correct from score comparisons
    const getStats = (b: BlockResult | null) => ({
        answered: b ? b.answers.filter(a => a !== -1).length : 0,
        total: b ? b.questions.length : 0,
        correct: b ? b.score : 0,
    });

    return (
        <>
            {/* Print styles */}
            <style>{`
                @media print {
                    @page { size: A4; margin: 15mm 15mm 15mm 15mm; }
                    .no-print { display: none !important; }
                    .page-break { page-break-after: always; break-after: page; }
                    body { font-size: 11pt; }
                    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                }
                @media screen {
                    .report-wrapper { max-width: 210mm; margin: 0 auto; padding: 20px; background: white; min-height: 100vh; }
                }
            `}</style>

            {/* Print button */}
            <div className="no-print fixed top-4 right-4 z-50 flex gap-2">
                <button
                    onClick={() => window.print()}
                    className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold shadow-lg transition-all"
                >
                    🖨️ Распечатать
                </button>
                <button
                    onClick={() => window.close()}
                    className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 text-gray-600 rounded-xl text-sm font-bold shadow transition-all"
                >
                    ✕ Закрыть
                </button>
            </div>

            <div className="report-wrapper">
                {/* ════════════════════════════════════════════════════════════
                    PAGE 1 — Requisition Info + Candidate Profile
                ════════════════════════════════════════════════════════════ */}
                <div>
                    {/* Header */}
                    <div style={{ borderBottom: '2px solid #1d4ed8', paddingBottom: '10px', marginBottom: '16px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div>
                                <h1 style={{ fontSize: '20pt', fontWeight: 900, color: '#1e3a8a', margin: 0 }}>Отчёт по кандидату</h1>
                                <p style={{ fontSize: '10pt', color: '#6b7280', margin: '4px 0 0' }}>Подготовлен: {today()} · Конфиденциально</p>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: '9pt', color: '#6b7280' }}>Документ №</div>
                                <div style={{ fontSize: '13pt', fontWeight: 700, color: '#1e3a8a', fontFamily: 'monospace' }}>
                                    {candidateId.slice(0, 8).toUpperCase()}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* BLOCK A — Заявка на подбор */}
                    <section style={{ marginBottom: '16px' }}>
                        <h2 style={{ fontSize: '11pt', fontWeight: 800, color: '#1e40af', textTransform: 'uppercase', letterSpacing: '0.06em', borderLeft: '4px solid #3b82f6', paddingLeft: '8px', margin: '0 0 10px' }}>
                            Заявка на подбор
                        </h2>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10pt' }}>
                            <tbody>
                                <tr>
                                    <td style={{ padding: '5px 8px', background: '#f1f5f9', fontWeight: 700, width: '35%', borderRadius: '4px' }}>Должность</td>
                                    <td style={{ padding: '5px 8px', fontWeight: 600 }}>{requisition.title}</td>
                                </tr>
                                <tr>
                                    <td style={{ padding: '5px 8px', background: '#f1f5f9', fontWeight: 700 }}>Зарплатный диапазон</td>
                                    <td style={{ padding: '5px 8px' }}>{reqSalary}</td>
                                </tr>
                                <tr>
                                    <td style={{ padding: '5px 8px', background: '#f1f5f9', fontWeight: 700 }}>График работы</td>
                                    <td style={{ padding: '5px 8px' }}>{requisition.workTypes?.join(', ') || '—'}</td>
                                </tr>
                                {requisition.requirements?.responsibilities?.length ? (
                                    <tr>
                                        <td style={{ padding: '5px 8px', background: '#f1f5f9', fontWeight: 700, verticalAlign: 'top' }}>Обязанности</td>
                                        <td style={{ padding: '5px 8px' }}>
                                            {requisition.requirements.responsibilities.map((r, i) => (
                                                <div key={i} style={{ marginBottom: '2px' }}>• {r}</div>
                                            ))}
                                        </td>
                                    </tr>
                                ) : null}
                                {requisition.requirements?.softSkills?.length ? (
                                    <tr>
                                        <td style={{ padding: '5px 8px', background: '#f1f5f9', fontWeight: 700, verticalAlign: 'top' }}>Soft Skills</td>
                                        <td style={{ padding: '5px 8px' }}>{requisition.requirements.softSkills.join(', ')}</td>
                                    </tr>
                                ) : null}
                                {requisition.requirements?.psychoType?.length ? (
                                    <tr>
                                        <td style={{ padding: '5px 8px', background: '#f1f5f9', fontWeight: 700, verticalAlign: 'top' }}>Психотип</td>
                                        <td style={{ padding: '5px 8px' }}>{requisition.requirements.psychoType.join(', ')}</td>
                                    </tr>
                                ) : null}
                            </tbody>
                        </table>
                    </section>

                    {/* BLOCK B — Кандидат */}
                    <section style={{ marginBottom: '16px' }}>
                        <h2 style={{ fontSize: '11pt', fontWeight: 800, color: '#065f46', textTransform: 'uppercase', letterSpacing: '0.06em', borderLeft: '4px solid #10b981', paddingLeft: '8px', margin: '0 0 10px' }}>
                            Информация о кандидате
                        </h2>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '10px' }}>
                            <InfoCell label="ФИО" value={candidate.fullName} />
                            <InfoCell label="AI рейтинг (резюме)" value={`${candidate.aiRating ?? 0}%`} highlight={true} />
                            <InfoCell label="Рекоменд. роль" value={(candidate as any).aiRecommendedRole || '—'} />
                            <InfoCell label="Опыт / Сфера" value={`${candidate.aiExperience || '—'} · ${candidate.aiField || '—'}`} />
                        </div>
                        {/* Resume download link */}
                        {(candidate as any).resumeUrl && (
                            <div style={{ marginBottom: '8px' }}>
                                <a
                                    href={(candidate as any).resumeUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    style={{
                                        display: 'inline-flex', alignItems: 'center', gap: '6px',
                                        padding: '5px 12px', background: '#eff6ff', border: '1px solid #bfdbfe',
                                        borderRadius: '8px', fontSize: '9.5pt', fontWeight: 700,
                                        color: '#1d4ed8', textDecoration: 'none',
                                    }}
                                >
                                    📄 Скачать резюме (оригинал)
                                </a>
                            </div>
                        )}
                        {candidate.aiStrengths && (
                            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px', padding: '8px 10px', marginBottom: '6px' }}>
                                <div style={{ fontSize: '9pt', fontWeight: 700, color: '#166534', marginBottom: '3px' }}>💪 СИЛЬНЫЕ СТОРОНЫ</div>
                                <div style={{ fontSize: '10pt' }}>{candidate.aiStrengths}</div>
                            </div>
                        )}
                        {candidate.aiWeaknesses && (
                            <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '6px', padding: '8px 10px', marginBottom: '6px' }}>
                                <div style={{ fontSize: '9pt', fontWeight: 700, color: '#92400e', marginBottom: '3px' }}>⚠️ ЗОНЫ РАЗВИТИЯ</div>
                                <div style={{ fontSize: '10pt' }}>{candidate.aiWeaknesses}</div>
                            </div>
                        )}
                        {candidate.aiMatchAnalysis && (
                            <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '6px', padding: '8px 10px', marginBottom: '6px' }}>
                                <div style={{ fontSize: '9pt', fontWeight: 700, color: '#1e40af', marginBottom: '3px' }}>🎯 СООТВЕТСТВИЕ ВАКАНСИИ</div>
                                <div style={{ fontSize: '10pt' }}>{candidate.aiMatchAnalysis}</div>
                            </div>
                        )}
                    </section>

                    {/* Interview info if scheduled */}
                    {(candidate as any).interviewDate && (
                        <div style={{ background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: '6px', padding: '8px 10px', marginBottom: '6px' }}>
                            <div style={{ fontSize: '9pt', fontWeight: 700, color: '#6b21a8', marginBottom: '3px' }}>📅 НАЗНАЧЕННОЕ ИНТЕРВЬЮ</div>
                            <div style={{ fontSize: '10pt', fontWeight: 600 }}>{(candidate as any).interviewDate}</div>
                            {(candidate as any).interviewNotes && <div style={{ fontSize: '10pt', color: '#374151', marginTop: '4px' }}>{(candidate as any).interviewNotes}</div>}
                        </div>
                    )}
                </div>

                {/* Page break */}
                <div className="page-break" />

                {/* ════════════════════════════════════════════════════════════
                    PAGE 2 — Test Results + Interview Fields
                ════════════════════════════════════════════════════════════ */}
                <div style={{ paddingTop: '8mm' }}>
                    <div style={{ borderBottom: '2px solid #1d4ed8', paddingBottom: '8px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between' }}>
                        <h1 style={{ fontSize: '16pt', fontWeight: 900, color: '#1e3a8a', margin: 0 }}>Результаты тестирования</h1>
                        <div style={{ fontSize: '10pt', fontWeight: 700, color: '#6b7280', alignSelf: 'flex-end' }}>{candidate.fullName} · {today()}</div>
                    </div>

                    {testSession ? (
                        <section style={{ marginBottom: '14px' }}>
                            {/* Overall score */}
                            {testScore !== null && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '12px', background: '#f8fafc', borderRadius: '8px', padding: '10px 14px', border: '1px solid #e2e8f0' }}>
                                    <div>
                                        <div style={{ fontSize: '9pt', color: '#6b7280', fontWeight: 600 }}>ОБЩИЙ БАЛЛ (Блоки 2+3)</div>
                                        <div style={{ fontSize: '22pt', fontWeight: 900, color: testScore >= 70 ? '#166534' : testScore >= 50 ? '#92400e' : '#991b1b', lineHeight: 1 }}>{testScore}%</div>
                                    </div>
                                    {testSession.psychotype && (
                                        <div style={{ borderLeft: '1px solid #e2e8f0', paddingLeft: '16px' }}>
                                            <div style={{ fontSize: '9pt', color: '#6b7280', fontWeight: 600 }}>ПСИХОТИП</div>
                                            <div style={{ fontSize: '13pt', fontWeight: 700, color: '#4f46e5' }}>{testSession.psychotype}</div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Block results */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '10px' }}>
                                <BlockSummary
                                    title="Блок 1 · Личностный профиль"
                                    color="#7c3aed" bg="#f5f3ff" border="#ddd6fe"
                                    note="Нет правильных/неправильных ответов"
                                    {...getStats(block1)} noScore
                                />
                                <BlockSummary
                                    title="Блок 2 · Логика и аналитика"
                                    color="#1d4ed8" bg="#eff6ff" border="#bfdbfe"
                                    {...getStats(block2)}
                                />
                                <BlockSummary
                                    title="Блок 3 · Профессиональные знания"
                                    color="#065f46" bg="#f0fdf4" border="#bbf7d0"
                                    {...getStats(block3)}
                                />
                            </div>

                            {/* AI recommendation */}
                            {testSession.aiRecommendation && (
                                <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '10px 12px', marginBottom: '10px' }}>
                                    <div style={{ fontSize: '9pt', fontWeight: 700, color: '#4f46e5', marginBottom: '5px' }}>🤖 AI-АНАЛИЗ ПО ТЕСТУ</div>
                                    <div style={{ fontSize: '10pt', lineHeight: '1.5', whiteSpace: 'pre-wrap' }}>{testSession.aiRecommendation}</div>
                                </div>
                            )}
                        </section>
                    ) : (
                        <div style={{ textAlign: 'center', padding: '20px', color: '#9ca3af', fontSize: '10pt', border: '1px dashed #e5e7eb', borderRadius: '8px', marginBottom: '14px' }}>
                            Тестирование не пройдено
                        </div>
                    )}

                    {/* ──────────────────── FIELDS FOR INTERVIEWER ──────────────────── */}
                    <section style={{ marginTop: '10px' }}>
                        <h2 style={{ fontSize: '11pt', fontWeight: 800, color: '#6b21a8', textTransform: 'uppercase', letterSpacing: '0.06em', borderLeft: '4px solid #9333ea', paddingLeft: '8px', margin: '0 0 10px' }}>
                            Очное интервью — для заполнения заявителем
                        </h2>

                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10pt', marginBottom: '10px' }}>
                            <tbody>
                                <tr>
                                    <td style={{ padding: '6px 8px', background: '#faf5ff', fontWeight: 700, width: '40%' }}>Запрашиваемая зарплата</td>
                                    <td style={{ padding: '6px 8px', borderBottom: '1px dotted #9ca3af', minWidth: '200px' }}>
                                        {(candidate as any).interviewSalary || ''}
                                        &nbsp;
                                    </td>
                                </tr>
                                <tr>
                                    <td style={{ padding: '6px 8px', background: '#faf5ff', fontWeight: 700 }}>Готовность к выходу</td>
                                    <td style={{ padding: '6px 8px', borderBottom: '1px dotted #9ca3af' }}>&nbsp;</td>
                                </tr>
                                <tr>
                                    <td style={{ padding: '6px 8px', background: '#faf5ff', fontWeight: 700 }}>Уровень владения ПК</td>
                                    <td style={{ padding: '6px 8px', borderBottom: '1px dotted #9ca3af' }}>&nbsp;</td>
                                </tr>
                            </tbody>
                        </table>

                        {/* Comments field */}
                        <div style={{ marginBottom: '10px' }}>
                            <div style={{ fontSize: '9pt', fontWeight: 700, color: '#374151', marginBottom: '4px' }}>КОММЕНТАРИЙ ИНТЕРВЬЮЕРА</div>
                            {(candidate as any).interviewNotes ? (
                                <div style={{ border: '1px solid #e5e7eb', borderRadius: '6px', padding: '8px 10px', minHeight: '48px', fontSize: '10pt', background: '#f9fafb' }}>
                                    {(candidate as any).interviewNotes}
                                </div>
                            ) : (
                                <div style={{ border: '1px solid #e5e7eb', borderRadius: '6px', padding: '8px 10px', minHeight: '64px', background: '#fafafa' }}></div>
                            )}
                        </div>

                        <div style={{ marginBottom: '14px' }}>
                            <div style={{ fontSize: '9pt', fontWeight: 700, color: '#374151', marginBottom: '4px' }}>ДОПОЛНИТЕЛЬНЫЕ ЗАМЕЧАНИЯ</div>
                            <div style={{ border: '1px solid #e5e7eb', borderRadius: '6px', padding: '8px 10px', minHeight: '48px', background: '#fafafa' }}></div>
                        </div>

                        {/* Signature line */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginTop: '16px' }}>
                            <div>
                                <div style={{ borderTop: '1px solid #374151', paddingTop: '4px', fontSize: '9pt', color: '#6b7280' }}>Подпись заявителя / руководителя</div>
                            </div>
                            <div>
                                <div style={{ borderTop: '1px solid #374151', paddingTop: '4px', fontSize: '9pt', color: '#6b7280' }}>Дата и решение: принять / отклонить</div>
                            </div>
                        </div>
                    </section>
                </div>

                {/* ════ PAGE 3 — Detailed Q&A ════ */}
                {testSession && (
                    <>
                        <div className="page-break" />
                        <div style={{ paddingTop: '8mm' }}>
                            <div style={{ borderBottom: '2px solid #1d4ed8', paddingBottom: '8px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between' }}>
                                <h1 style={{ fontSize: '16pt', fontWeight: 900, color: '#1e3a8a', margin: 0 }}>Детальные ответы</h1>
                                <div style={{ fontSize: '10pt', fontWeight: 700, color: '#6b7280', alignSelf: 'flex-end' }}>{candidate.fullName} · {today()}</div>
                            </div>
                            <QABlock
                                title="Блок 1 · Личностный профиль"
                                color="#7c3aed" bg="#f5f3ff" border="#ddd6fe"
                                questions={testSession.b1Questions ?? []}
                                answers={testSession.b1Answers ?? []}
                                isPersonality
                            />
                            <QABlock
                                title="Блок 2 · Логика и аналитическое мышление"
                                color="#1d4ed8" bg="#eff6ff" border="#bfdbfe"
                                questions={testSession.b2Questions ?? []}
                                answers={testSession.b2Answers ?? []}
                            />
                            <QABlock
                                title="Блок 3 · Профессиональные знания"
                                color="#065f46" bg="#f0fdf4" border="#bbf7d0"
                                questions={testSession.b3Questions ?? []}
                                answers={testSession.b3Answers ?? []}
                            />
                        </div>
                    </>
                )}
            </div>
        </>
    );
}

/* ─── Sub-components ──────────────────────────────────────────────────────── */
function InfoCell({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
    return (
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '6px 10px' }}>
            <div style={{ fontSize: '8pt', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
            <div style={{ fontSize: '11pt', fontWeight: highlight ? 900 : 600, color: highlight ? '#1d4ed8' : '#111827', marginTop: '2px' }}>{value}</div>
        </div>
    );
}

function BlockSummary({
    title, color, bg, border, answered, total, correct, noScore, note
}: {
    title: string; color: string; bg: string; border: string;
    answered: number; total: number; correct?: number; noScore?: boolean; note?: string;
}) {
    const pct = total > 0 && !noScore && correct !== undefined ? Math.round((correct / total) * 100) : null;
    return (
        <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: '6px', padding: '8px 10px' }}>
            <div style={{ fontSize: '8.5pt', fontWeight: 700, color, marginBottom: '5px' }}>{title}</div>
            {note && <div style={{ fontSize: '8pt', color: '#6b7280', fontStyle: 'italic', marginBottom: '4px' }}>{note}</div>}
            <div style={{ fontSize: '9pt', color: '#374151' }}>Отвечено: <strong>{answered}/{total}</strong></div>
            {pct !== null && (
                <div style={{ fontSize: '9pt', color }}>Правильно: <strong>{correct}/{total} ({pct}%)</strong></div>
            )}
            {noScore && <div style={{ fontSize: '9pt', color: '#9ca3af' }}>Баллы не начисляются</div>}
        </div>
    );
}

function QABlock({
    title, color, bg, border, questions, answers, isPersonality
}: {
    title: string; color: string; bg: string; border: string;
    questions: Array<{ question: string; options: string[]; correctAnswer: number }>;
    answers: number[];
    isPersonality?: boolean;
}) {
    if (!questions || questions.length === 0) return null;
    return (
        <div style={{ marginBottom: '14px' }}>
            <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: '6px', padding: '6px 10px', marginBottom: '8px' }}>
                <span style={{ fontSize: '9pt', fontWeight: 800, color }}>{title}</span>
                {isPersonality && <span style={{ fontSize: '8pt', color: '#6b7280', marginLeft: '8px', fontStyle: 'italic' }}>(ответы не оцениваются, отражают психотип)</span>}
            </div>
            {questions.map((q, qi) => {
                const chosen = answers[qi] ?? -1;
                const correct = q.correctAnswer ?? -1;
                return (
                    <div key={qi} style={{ marginBottom: '8px', pageBreakInside: 'avoid' }}>
                        <div style={{ fontSize: '9pt', fontWeight: 700, color: '#111827', marginBottom: '4px' }}>
                            {qi + 1}. {q.question}
                        </div>
                        <div style={{ paddingLeft: '12px' }}>
                            {(q.options || []).map((opt, oi) => {
                                const isChosen = chosen === oi;
                                const isCorrect = correct === oi;
                                let optBg = 'transparent';
                                let optBorder = '1px solid #e5e7eb';
                                let optColor = '#374151';
                                let prefix = '';
                                if (!isPersonality) {
                                    if (isChosen && isCorrect) { optBg = '#f0fdf4'; optBorder = '1.5px solid #22c55e'; optColor = '#166534'; prefix = '✅ '; }
                                    else if (isChosen && !isCorrect) { optBg = '#fef2f2'; optBorder = '1.5px solid #ef4444'; optColor = '#991b1b'; prefix = '❌ '; }
                                    else if (isCorrect) { optBg = '#f0fdf4'; optBorder = '1px solid #bbf7d0'; optColor = '#166534'; prefix = '✓ '; }
                                } else {
                                    if (isChosen) { optBg = '#eff6ff'; optBorder = '1.5px solid #3b82f6'; optColor = '#1d4ed8'; prefix = '● '; }
                                }
                                return (
                                    <div key={oi} style={{ background: optBg, border: optBorder, borderRadius: '4px', padding: '3px 7px', marginBottom: '2px', fontSize: '8.5pt', color: optColor, fontWeight: isChosen ? 700 : 400 }}>
                                        {prefix}{String.fromCharCode(65 + oi)}. {opt}
                                    </div>
                                );
                            })}
                            {chosen === -1 && <div style={{ fontSize: '8pt', color: '#9ca3af', fontStyle: 'italic' }}>— вопрос пропущен</div>}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
