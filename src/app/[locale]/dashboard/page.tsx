"use client";

import { useAuth } from '@/context/AuthContext';
import {
    Briefcase, Clock, CheckCircle, AlertCircle,
    Users, FileText, Award, User, BarChart3
} from 'lucide-react';
import { useEffect, useState, useMemo } from 'react';
import { getRequisitions, getRecruiters, Requisition, UserProfile } from '@/lib/db';
import { Link } from '@/i18n/routing';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RecruiterStat {
    name: string;
    total: number;
    inProgress: number;
    hired: number;
    closed: number;
    avgDays: number | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function avgDays(reqs: Requisition[]): string {
    const closed = reqs.filter(r => (r.status === 'closed' || r.status === 'hired') && r.closedAt);
    if (!closed.length) return '—';
    const total = closed.reduce((acc, r) => {
        const days = (r.closedAt!.toMillis() - r.createdAt.toMillis()) / 86400000;
        return acc + Math.max(1, days);
    }, 0);
    return `${Math.round(total / closed.length)} дн.`;
}

const STATUS_LABEL: Record<string, string> = {
    open: 'Открыта', in_progress: 'В работе', offer: 'Оффер',
    hired: 'Закрыта (найм)', closed: 'Закрыта', paused: 'На паузе',
    testing: 'Тестирование', interview: 'Интервью',
};

const STATUS_COLORS: Record<string, string> = {
    open: 'bg-blue-100 text-blue-700', in_progress: 'bg-amber-100 text-amber-700',
    offer: 'bg-emerald-100 text-emerald-700', hired: 'bg-teal-100 text-teal-700 ring-1 ring-teal-300',
    closed: 'bg-gray-100 text-gray-600', paused: 'bg-yellow-100 text-yellow-700',
    testing: 'bg-indigo-100 text-indigo-700', interview: 'bg-purple-100 text-purple-700',
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function DashboardPage() {
    const { profile } = useAuth();
    const [allReqs, setAllReqs] = useState<Requisition[]>([]);
    const [statusFilter, setStatusFilter] = useState('all');
    const [recruiterFilter, setRecruiterFilter] = useState('all');

    const isManager = profile && ['admin', 'hrd', 'manager', 'requester'].includes(profile.role);
    const isRecruiter = profile?.role === 'recruiter' || profile?.role === 'private_recruiter';

    const [recruiters, setRecruiters] = useState<UserProfile[]>([]);

    useEffect(() => {
        if (!profile?.companyId) return;
        getRequisitions(profile.companyId).then(setAllReqs);
        // Load recruiter+hrd list for managers
        if (profile && ['admin', 'hrd', 'manager', 'requester'].includes(profile.role)) {
            getRecruiters(profile.companyId).then(setRecruiters);
        }
    }, [profile?.companyId]);

    // For recruiter: only their own reqs
    const myReqs = useMemo(() => {
        if (!profile) return [];
        if (isRecruiter) return allReqs.filter(r => r.assignedTo === profile.uid || r.createdBy === profile.uid);
        return allReqs;
    }, [allReqs, profile, isRecruiter]);

    // Stats computed from the recruiter's own reqs (or all for managers)
    const stats = useMemo(() => ({
        total: myReqs.length,
        inProgress: myReqs.filter(r => ['open', 'in_progress'].includes(r.status)).length,
        offer: myReqs.filter(r => r.status === 'offer').length,
        hired: myReqs.filter(r => r.status === 'hired').length,
        pausedOrClosed: myReqs.filter(r => ['paused', 'closed'].includes(r.status)).length,
        avgTime: avgDays(myReqs),
    }), [myReqs]);

    // Per-recruiter breakdown (only for managers)
    const recruiterStats = useMemo((): RecruiterStat[] => {
        if (!isManager) return [];
        const map: Record<string, { name: string; reqs: Requisition[] }> = {};
        for (const r of allReqs) {
            if (!r.assignedTo) continue;
            const key = r.assignedTo;
            if (!map[key]) map[key] = { name: r.assignedToName || r.assignedTo.slice(0, 8), reqs: [] };
            map[key].reqs.push(r);
        }
        return Object.values(map).map(({ name, reqs }) => {
            const closed = reqs.filter(r => (r.status === 'closed' || r.status === 'hired') && r.closedAt);
            const totalMs = closed.reduce((a, r) => a + (r.closedAt!.toMillis() - r.createdAt.toMillis()), 0);
            return {
                name,
                total: reqs.length,
                inProgress: reqs.filter(r => ['open', 'in_progress', 'offer'].includes(r.status)).length,
                hired: reqs.filter(r => r.status === 'hired').length,
                closed: reqs.filter(r => r.status === 'closed').length,
                avgDays: closed.length ? Math.round(totalMs / closed.length / 86400000) : null,
            };
        }).sort((a, b) => b.total - a.total);
    }, [allReqs, isManager]);

    // Unique recruiter names for filter — from actual Firestore users list
    const recruiterOptions = useMemo(() => {
        return recruiters.map(r => ({
            uid: r.uid,
            name: r.displayName || r.email || r.uid,
        }));
    }, [recruiters]);

    // Filtered list for the bottom card list
    const filteredReqs = useMemo(() => {
        return myReqs.filter(r => {
            if (statusFilter === 'all') return true;
            if (statusFilter === 'in_progress') return ['open', 'in_progress'].includes(r.status);
            return r.status === statusFilter;
        }).filter(r => {
            if (!isManager || recruiterFilter === 'all') return true;
            return r.assignedTo === recruiterFilter;
        });
    }, [myReqs, statusFilter, recruiterFilter, isManager]);

    return (
        <div className="max-w-6xl mx-auto animate-fade-in-up space-y-8 pb-8">

            {/* Header */}
            <div>
                <h1 className="text-3xl font-black text-gray-900 mb-1">Аналитика</h1>
                <p className="text-gray-500">
                    {isRecruiter
                        ? `Ваши вакансии и эффективность — ${profile?.displayName || profile?.email}`
                        : 'Эффективность найма и статистика в реальном времени'}
                </p>
            </div>

            {/* Avg time to close */}
            <div className="grid grid-cols-1 gap-6">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-5 hover:shadow-md transition-all">
                    <div className="p-4 bg-blue-50 text-blue-600 rounded-2xl">
                        <Clock className="w-8 h-8" />
                    </div>
                    <div>
                        <p className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-1">
                            {isRecruiter ? 'Моё среднее время закрытия' : 'Среднее время закрытия вакансии'}
                        </p>
                        <p className="text-3xl font-black text-gray-900">{stats.avgTime}</p>
                    </div>
                </div>
            </div>

            {/* Status cards */}
            <div className="bg-white p-8 rounded-3xl shadow-xl shadow-gray-200/40 border border-gray-100 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-10 opacity-5 pointer-events-none">
                    <Briefcase className="w-48 h-48 text-blue-600" />
                </div>

                <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2 relative z-10">
                    <Briefcase className="w-6 h-6 text-blue-500" />
                    {isRecruiter ? 'Мои вакансии' : 'Статус вакансий'}
                </h2>

                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 relative z-10 mb-8">
                    {[
                        { key: 'all', label: 'Всего', count: stats.total, icon: Briefcase, color: 'gray' },
                        { key: 'in_progress', label: 'В работе', count: stats.inProgress, icon: Users, color: 'blue' },
                        { key: 'offer', label: 'Оффер', count: stats.offer, icon: Award, color: 'green' },
                        { key: 'hired', label: 'Закрыта (найм)', count: stats.hired, icon: CheckCircle, color: 'teal' },
                        { key: 'paused', label: 'На паузе / Завер.', count: stats.pausedOrClosed, icon: AlertCircle, color: 'orange' },
                    ].map(({ key, label, count, icon: Icon, color }) => {
                        const active = statusFilter === key;
                        const cls: Record<string, string> = {
                            gray: active ? 'bg-gray-800 text-white border-gray-800 shadow-md' : 'bg-gray-50 border-gray-100 hover:bg-gray-100 text-gray-900',
                            blue: active ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-500/30' : 'bg-blue-50/50 border-blue-100 hover:bg-blue-50 text-blue-900',
                            green: active ? 'bg-emerald-600 text-white border-emerald-600 shadow-md shadow-emerald-500/30' : 'bg-emerald-50/50 border-emerald-100 hover:bg-emerald-50 text-emerald-900',
                            teal: active ? 'bg-teal-600 text-white border-teal-600 shadow-md shadow-teal-500/30' : 'bg-teal-50/50 border-teal-100 hover:bg-teal-50 text-teal-900',
                            orange: active ? 'bg-orange-500 text-white border-orange-500 shadow-md shadow-orange-500/30' : 'bg-orange-50/50 border-orange-100 hover:bg-orange-50 text-orange-900',
                        };
                        const iconCls: Record<string, string> = {
                            gray: active ? 'text-gray-300' : 'text-gray-400', blue: active ? 'text-blue-200' : 'text-blue-500',
                            green: active ? 'text-emerald-200' : 'text-emerald-500', teal: active ? 'text-teal-200' : 'text-teal-500',
                            orange: active ? 'text-orange-200' : 'text-orange-500',
                        };
                        const labelCls: Record<string, string> = {
                            gray: active ? 'text-gray-300' : 'text-gray-500', blue: active ? 'text-blue-100' : 'text-blue-700',
                            green: active ? 'text-emerald-100' : 'text-emerald-700', teal: active ? 'text-teal-100' : 'text-teal-700',
                            orange: active ? 'text-orange-100' : 'text-orange-700',
                        };
                        return (
                            <button key={key} onClick={() => setStatusFilter(key)}
                                className={`p-4 rounded-2xl border transition-all text-left ${cls[color]}`}>
                                <div className="flex items-center justify-between mb-2">
                                    <p className={`text-xs font-bold uppercase tracking-wider ${labelCls[color]}`}>{label}</p>
                                    <Icon className={`w-4 h-4 ${iconCls[color]}`} />
                                </div>
                                <p className="text-3xl font-black">{count}</p>
                            </button>
                        );
                    })}
                </div>

                {/* Recruiter filter — manager only */}
                {isManager && (
                    <div className="flex items-center gap-3 mb-6 relative z-10">
                        <div className="relative">
                            <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                            <select
                                value={recruiterFilter}
                                onChange={e => setRecruiterFilter(e.target.value)}
                                className="select-field select-field-icon"
                            >
                                <option value="all">Все рекрутеры</option>
                                {recruiterOptions.map(r => <option key={r.uid} value={r.uid}>{r.name}</option>)}
                            </select>
                        </div>
                        {recruiterFilter !== 'all' && (
                            <button onClick={() => setRecruiterFilter('all')}
                                className="text-xs text-gray-400 hover:text-gray-600 underline">
                                сбросить
                            </button>
                        )}
                    </div>
                )}

                {/* Vacancy list */}
                <div className="relative z-10">
                    <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                        <FileText className="w-5 h-5 text-gray-500" />
                        Список вакансий
                    </h3>

                    {filteredReqs.length > 0 ? (
                        <div className="space-y-3">
                            {filteredReqs.map(req => (
                                <Link key={req.id} href={`/dashboard/requisitions/${req.id}`}
                                    className="block bg-white border border-gray-100 hover:border-blue-300 hover:shadow-md p-4 rounded-xl transition-all">
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                        <div className="min-w-0">
                                            <h4 className="font-bold text-gray-900">{req.title}</h4>
                                            <div className="flex flex-wrap gap-2 mt-1">
                                                {req.assignedToName && (
                                                    <span className="text-xs text-blue-600 font-semibold flex items-center gap-1">
                                                        <User className="w-3 h-3" />{req.assignedToName}
                                                    </span>
                                                )}
                                                <span className="text-xs text-gray-400">
                                                    {new Date(req.createdAt.toDate()).toLocaleDateString('ru-RU')}
                                                </span>
                                            </div>
                                        </div>
                                        <span className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-bold ${STATUS_COLORS[req.status] || 'bg-gray-100 text-gray-600'}`}>
                                            {STATUS_LABEL[req.status] || req.status}
                                        </span>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-10 bg-gray-50 rounded-xl border border-gray-100 border-dashed">
                            <Briefcase className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                            <p className="text-gray-500 font-medium">В этой категории пока нет вакансий</p>
                        </div>
                    )}
                </div>
            </div>

            {/* ── Per-Recruiter Table (admin / hrd / manager only) ── */}
            {isManager && (
                <div className="bg-white rounded-3xl shadow-xl shadow-gray-200/40 border border-gray-100 overflow-hidden">
                    <div className="p-6 border-b border-gray-100 flex items-center gap-3">
                        <div className="p-2.5 bg-purple-50 text-purple-600 rounded-xl">
                            <BarChart3 className="w-5 h-5" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-gray-900">Эффективность рекрутеров</h2>
                            <p className="text-xs text-gray-400 mt-0.5">По назначенным вакансиям</p>
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        {recruiterStats.length > 0 ? (
                            <table className="min-w-full divide-y divide-gray-100">
                                <thead className="bg-gray-50/80">
                                    <tr>
                                        <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Рекрутер</th>
                                        <th className="px-5 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Всего</th>
                                        <th className="px-5 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">В работе</th>
                                        <th className="px-5 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Закрыто (найм)</th>
                                        <th className="px-5 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Закрыто</th>
                                        <th className="px-5 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Ср. дней</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {recruiterStats.map(rec => (
                                        <tr key={rec.name} className="hover:bg-purple-50/30 transition-colors">
                                            <td className="px-5 py-3.5">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-8 h-8 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
                                                        {rec.name.slice(0, 2).toUpperCase()}
                                                    </div>
                                                    <span className="text-sm font-semibold text-gray-800">{rec.name}</span>
                                                </div>
                                            </td>
                                            <td className="px-5 py-3.5 text-center">
                                                <span className="text-sm font-bold text-gray-800">{rec.total}</span>
                                            </td>
                                            <td className="px-5 py-3.5 text-center">
                                                <span className={`text-sm font-semibold ${rec.inProgress > 0 ? 'text-blue-600' : 'text-gray-400'}`}>
                                                    {rec.inProgress}
                                                </span>
                                            </td>
                                            <td className="px-5 py-3.5 text-center">
                                                <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${rec.hired > 0 ? 'bg-teal-100 text-teal-700' : 'text-gray-400'}`}>
                                                    {rec.hired}
                                                </span>
                                            </td>
                                            <td className="px-5 py-3.5 text-center">
                                                <span className="text-sm text-gray-500">{rec.closed}</span>
                                            </td>
                                            <td className="px-5 py-3.5 text-center">
                                                {rec.avgDays !== null
                                                    ? <span className="text-sm font-semibold text-indigo-600">{rec.avgDays} дн.</span>
                                                    : <span className="text-gray-400 text-xs">—</span>
                                                }
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        ) : (
                            <div className="text-center py-12 px-6">
                                <div className="w-14 h-14 bg-purple-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                                    <BarChart3 className="w-7 h-7 text-purple-300" />
                                </div>
                                <p className="text-gray-600 font-semibold mb-1">Назначьте рекрутеров на заявки</p>
                                <p className="text-gray-400 text-sm">Статистика появится после назначения ответственных рекрутеров на заявки. Перейдите в «Заявки на подбор» → Редактировать заявку, чтобы назначить рекрутера.</p>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
