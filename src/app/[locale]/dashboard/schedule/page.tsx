"use client";

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { db } from '@/lib/db';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { useRouter } from '@/i18n/routing';
import { Calendar, User, Briefcase, Loader2, ChevronRight, Clock, CheckCircle, XCircle, AlertCircle } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────
interface InterviewEntry {
    candidateId: string;
    candidateName: string;
    candidateStatus: string;
    interviewDate: string;          // raw string "YYYY-MM-DD HH:MM" or "YYYY-MM-DD"
    interviewOutcome?: string;
    interviewNotes?: string;
    interviewSalary?: string;
    interviewConditions?: string;
    requisitionId: string;
    requisitionTitle: string;
    requisitionPosition: string;
    recruiterName?: string;
    recruiterId?: string;
    interviewerName?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const DAY_NAMES_RU = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
const MONTH_NAMES_RU = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];

function parseDate(str: string): Date | null {
    if (!str) return null;
    const d = new Date(str.replace(' ', 'T'));
    return isNaN(d.getTime()) ? null : d;
}

function formatDateKey(d: Date) {
    return d.toISOString().split('T')[0]; // "YYYY-MM-DD"
}

function formatDisplayDate(d: Date) {
    return `${d.getDate()} ${MONTH_NAMES_RU[d.getMonth()]} ${d.getFullYear()}`;
}

function formatTime(str: string) {
    const parts = str.split(' ');
    return parts.length > 1 ? parts[1].substring(0, 5) : null;
}

function outcomeInfo(outcome?: string) {
    if (outcome === 'passed') return { label: 'Прошёл', color: 'text-emerald-700 bg-emerald-50', icon: CheckCircle };
    if (outcome === 'failed') return { label: 'Не прошёл', color: 'text-red-700 bg-red-50', icon: XCircle };
    return { label: 'Ожидается', color: 'text-amber-700 bg-amber-50', icon: AlertCircle };
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function SchedulePage() {
    const { profile } = useAuth();
    const router = useRouter();
    const [entries, setEntries] = useState<InterviewEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<'all' | 'upcoming' | 'past'>('upcoming');

    useEffect(() => {
        if (!profile) return;
        loadInterviews();
    }, [profile]);

    const loadInterviews = async () => {
        setLoading(true);
        try {
            // 1. Fetch all candidates with interviewDate set, filtered by company
            const candQ = query(
                collection(db, 'candidates'),
                where('companyId', '==', profile!.companyId),
            );
            const candSnap = await getDocs(candQ);

            // Filter only those with interviewDate
            const candsWithInterview = candSnap.docs
                .map(d => ({ id: d.id, ...d.data() } as any))
                .filter((c: any) => c.interviewDate);

            if (candsWithInterview.length === 0) {
                setEntries([]);
                setLoading(false);
                return;
            }

            // 2. Collect unique requisition IDs
            const reqIds = [...new Set(candsWithInterview.map((c: any) => c.requisitionId).filter(Boolean))] as string[];

            // 3. Fetch those requisitions
            const reqMap: Record<string, any> = {};
            for (const rid of reqIds) {
                const snap = await getDocs(query(collection(db, 'requisitions'), where('__name__', '==', rid)));
                if (!snap.empty) reqMap[rid] = { id: snap.docs[0].id, ...snap.docs[0].data() };
            }

            // 4. Fetch recruiter profiles for requisitions
            const recruiterIds = [...new Set(Object.values(reqMap).map((r: any) => r.recruiterId).filter(Boolean))] as string[];
            const recruiterMap: Record<string, string> = {};
            if (recruiterIds.length > 0) {
                const profQ = query(collection(db, 'users'), where('uid', 'in', recruiterIds.slice(0, 10)));
                const profSnap = await getDocs(profQ);
                profSnap.docs.forEach(d => {
                    const u = d.data() as any;
                    recruiterMap[u.uid] = u.displayName || u.email || u.uid;
                });
            }

            // 5. Build entries
            const built: InterviewEntry[] = candsWithInterview.map((c: any) => {
                const req = reqMap[c.requisitionId];
                return {
                    candidateId: c.id,
                    candidateName: c.fullName || 'Без имени',
                    candidateStatus: c.status || '',
                    interviewDate: c.interviewDate,
                    interviewOutcome: c.interviewOutcome,
                    interviewNotes: c.interviewNotes,
                    interviewSalary: c.interviewSalary,
                    interviewConditions: c.interviewConditions,
                    requisitionId: c.requisitionId || '',
                    requisitionTitle: req?.title || 'Неизвестная заявка',
                    requisitionPosition: req?.position || req?.title || '',
                    recruiterId: req?.recruiterId,
                    // Prefer candidate's assigned interviewerName, fallback to requisition recruiter
                    interviewerName: c.interviewerName || null,
                    recruiterName: c.interviewerName
                        ? c.interviewerName
                        : req?.recruiterId ? (recruiterMap[req.recruiterId] || 'Рекрутер') : 'Не назначен',
                };
            });

            // Sort by date ascending
            built.sort((a, b) => {
                const da = parseDate(a.interviewDate)?.getTime() ?? 0;
                const db2 = parseDate(b.interviewDate)?.getTime() ?? 0;
                return da - db2;
            });

            setEntries(built);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    // ── Filtering ─────────────────────────────────────────────────────────────
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const filtered = entries.filter(e => {
        const d = parseDate(e.interviewDate);
        if (!d) return false;
        if (filter === 'upcoming') return d >= now;
        if (filter === 'past') return d < now;
        return true;
    });

    // ── Group by date ─────────────────────────────────────────────────────────
    const grouped: Record<string, InterviewEntry[]> = {};
    filtered.forEach(e => {
        const d = parseDate(e.interviewDate);
        if (!d) return;
        const key = formatDateKey(d);
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(e);
    });
    const sortedKeys = Object.keys(grouped).sort();

    // ── Navigate to requisition and open results panel ─────────────────────────
    const openResults = (entry: InterviewEntry) => {
        if (!entry.requisitionId) return;
        router.push(`/dashboard/requisitions/${entry.requisitionId}?candidate=${entry.candidateId}&action=results` as any);
    };

    // ─────────────────────────────────────────────────────────────────────────
    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-gradient-to-br from-violet-500 to-indigo-600 rounded-xl shadow-md">
                        <Calendar className="w-6 h-6 text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-black text-gray-900">Расписание интервью</h1>
                        <p className="text-sm text-gray-500 mt-0.5">Все назначенные интервью по заявкам</p>
                    </div>
                </div>

                {/* Filter tabs */}
                <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
                    {([['upcoming', 'Предстоящие'], ['past', 'Прошедшие'], ['all', 'Все']] as const).map(([val, label]) => (
                        <button key={val} onClick={() => setFilter(val)}
                            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${filter === val ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                            {label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Loading */}
            {loading && (
                <div className="flex justify-center py-20">
                    <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
                </div>
            )}

            {/* Empty state */}
            {!loading && sortedKeys.length === 0 && (
                <div className="text-center py-20 bg-white rounded-2xl border border-gray-100 shadow-sm">
                    <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500 font-semibold">Нет запланированных интервью</p>
                    <p className="text-gray-400 text-sm mt-1">Назначьте интервью из страницы заявки на подбор</p>
                </div>
            )}

            {/* Calendar groups */}
            {!loading && sortedKeys.map(dateKey => {
                const d = new Date(dateKey + 'T00:00:00');
                const dayName = DAY_NAMES_RU[d.getDay()];
                const displayDate = formatDisplayDate(d);
                const isToday = formatDateKey(d) === formatDateKey(new Date());
                const isPast = d < now;

                return (
                    <div key={dateKey}>
                        {/* Date header */}
                        <div className={`flex items-center gap-3 mb-3 px-1`}>
                            <div className={`flex flex-col items-center justify-center w-14 h-14 rounded-2xl font-black shadow-sm ${isToday ? 'bg-violet-600 text-white' : isPast ? 'bg-gray-100 text-gray-500' : 'bg-indigo-50 text-indigo-700'}`}>
                                <span className="text-xl leading-none">{d.getDate()}</span>
                                <span className="text-[10px] uppercase tracking-wide leading-none mt-0.5">{MONTH_NAMES_RU[d.getMonth()].slice(0, 3)}</span>
                            </div>
                            <div>
                                <p className={`font-black text-base ${isToday ? 'text-violet-700' : isPast ? 'text-gray-400' : 'text-gray-800'}`}>
                                    {dayName} {isToday && <span className="text-xs bg-violet-100 text-violet-600 px-2 py-0.5 rounded-full ml-1">Сегодня</span>}
                                </p>
                                <p className="text-xs text-gray-400">{displayDate}</p>
                            </div>
                            <div className="flex-1 h-px bg-gray-100 ml-2" />
                            <span className="text-xs text-gray-400 font-semibold">{grouped[dateKey].length} интервью</span>
                        </div>

                        {/* Entries */}
                        <div className="space-y-3 pl-4">
                            {grouped[dateKey].map((entry, i) => {
                                const time = formatTime(entry.interviewDate);
                                const oi = outcomeInfo(entry.interviewOutcome);
                                const OutcomeIcon = oi.icon;
                                const needsResult = !entry.interviewOutcome || entry.interviewOutcome === 'pending';

                                return (
                                    <div key={`${entry.candidateId}-${i}`}
                                        className={`relative bg-white border-2 rounded-2xl p-4 shadow-sm transition-all hover:shadow-md group ${isPast && !needsResult ? 'border-gray-100 opacity-80' : needsResult && !isPast ? 'border-violet-200 hover:border-violet-400' : needsResult && isPast ? 'border-amber-200 hover:border-amber-400' : 'border-gray-100'}`}>

                                        {/* Left accent bar */}
                                        <div className={`absolute left-0 top-3 bottom-3 w-1 rounded-full ${entry.interviewOutcome === 'passed' ? 'bg-emerald-400' : entry.interviewOutcome === 'failed' ? 'bg-red-400' : isPast ? 'bg-amber-400' : 'bg-violet-400'}`} />

                                        <div className="flex items-start gap-4 flex-wrap pl-3">
                                            {/* Time badge */}
                                            <div className="flex flex-col items-center min-w-[52px]">
                                                {time ? (
                                                    <>
                                                        <Clock className="w-3.5 h-3.5 text-gray-400 mb-0.5" />
                                                        <span className="text-sm font-black text-gray-800">{time}</span>
                                                    </>
                                                ) : (
                                                    <span className="text-xs text-gray-400 italic">Без времени</span>
                                                )}
                                            </div>

                                            {/* Divider */}
                                            <div className="w-px bg-gray-100 self-stretch" />

                                            {/* Candidate info */}
                                            <div className="flex-1 min-w-0 space-y-1.5">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <div className="flex items-center gap-1.5">
                                                        <User className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                                                        <span className="font-black text-gray-900 text-sm">{entry.candidateName}</span>
                                                    </div>
                                                    <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${oi.color}`}>
                                                        <OutcomeIcon className="w-3 h-3" />
                                                        {oi.label}
                                                    </span>
                                                </div>

                                                <div className="flex items-center gap-1.5 text-xs text-gray-500">
                                                    <Briefcase className="w-3.5 h-3.5 text-gray-300 shrink-0" />
                                                    <span className="font-semibold text-gray-700 truncate">{entry.requisitionTitle}</span>
                                                    {entry.requisitionPosition && entry.requisitionPosition !== entry.requisitionTitle && (
                                                        <span className="text-gray-400">· {entry.requisitionPosition}</span>
                                                    )}
                                                </div>

                                                <div className="flex items-center gap-1.5 text-xs text-gray-400">
                                                    <User className="w-3 h-3 shrink-0" />
                                                    <span>Интервьюер: <span className="font-semibold text-gray-600">{entry.recruiterName}</span></span>
                                                </div>

                                                {/* Results preview if filled */}
                                                {entry.interviewOutcome && entry.interviewOutcome !== 'pending' && (entry.interviewNotes || entry.interviewSalary) && (
                                                    <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                                                        {entry.interviewSalary && (
                                                            <span className="bg-gray-50 border border-gray-100 rounded-lg px-2 py-1 font-semibold text-gray-600">💰 {entry.interviewSalary}</span>
                                                        )}
                                                        {entry.interviewConditions && (
                                                            <span className="bg-gray-50 border border-gray-100 rounded-lg px-2 py-1 font-semibold text-gray-600">🏢 {entry.interviewConditions}</span>
                                                        )}
                                                        {entry.interviewNotes && (
                                                            <span className="bg-gray-50 border border-gray-100 rounded-lg px-2 py-1 text-gray-500 max-w-xs truncate">💬 {entry.interviewNotes}</span>
                                                        )}
                                                    </div>
                                                )}
                                            </div>

                                            {/* Action button */}
                                            <div className="flex flex-col items-end gap-2 shrink-0">
                                                {entry.requisitionId && (
                                                    <button
                                                        onClick={() => openResults(entry)}
                                                        className={`flex items-center gap-1.5 px-3 py-2 rounded-xl font-semibold text-xs transition-all ${needsResult
                                                            ? 'bg-violet-600 text-white hover:bg-violet-700 shadow-sm'
                                                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                                            }`}>
                                                        {needsResult ? '✅ Внести результаты' : '📋 Открыть карточку'}
                                                        <ChevronRight className="w-3.5 h-3.5" />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
