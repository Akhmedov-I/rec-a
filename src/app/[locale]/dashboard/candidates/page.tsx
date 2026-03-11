"use client";

import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { db, Candidate, Requisition } from '@/lib/db';
import { collection, query, where, getDocs, deleteDoc, doc } from 'firebase/firestore';
import {
    Search, Filter, Download, Trash2, Star, FileDown, Calendar,
    Database, ChevronUp, ChevronDown, ChevronsUpDown, User, Briefcase
} from 'lucide-react';
import ConfirmDialog from '@/components/ConfirmDialog';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

type CandWithReq = Candidate & {
    reqTitle?: string;
    aiField?: string;       // profession / area extracted from aiAnalysis
    aiRoleRec?: string;     // recommended company role extracted from aiAnalysis
};

const RATING_OPTIONS = [
    { label: 'Любой рейтинг', value: 'all' },
    { label: '≥ 90%', value: '90' },
    { label: '≥ 75%', value: '75' },
    { label: '≥ 50%', value: '50' },
    { label: '< 50%', value: 'low' },
];

function formatDate(ts: any): string {
    if (!ts) return '—';
    try {
        const d: Date = ts.toDate ? ts.toDate() : new Date(ts);
        return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch { return '—'; }
}

function ratingBadge(rating: number) {
    if (rating >= 75) return 'text-green-700 bg-green-50 border-green-200';
    if (rating >= 50) return 'text-yellow-700 bg-yellow-50 border-yellow-200';
    return 'text-red-700 bg-red-50 border-red-200';
}

function statusLabel(s: string) {
    const m: Record<string, string> = {
        new: 'Новый', testing: 'Тестирование', interview: 'Интервью',
        offer: 'Оффер', accepted: 'Принят', rejected: 'Отказ'
    };
    return m[s] || s;
}

function statusColor(s: string) {
    const m: Record<string, string> = {
        new: 'bg-blue-100 text-blue-700',
        testing: 'bg-indigo-100 text-indigo-700',
        interview: 'bg-purple-100 text-purple-700',
        offer: 'bg-emerald-100 text-emerald-700',
        accepted: 'bg-green-100 text-green-700',
        rejected: 'bg-red-100 text-red-700',
    };
    return m[s] || 'bg-gray-100 text-gray-700';
}

/** Try to extract a short field/profession string from the AI analysis JSON or text. */
function parseAiField(analysis?: string): string {
    if (!analysis) return '—';
    // Analysis is stored as plain text (the 'analysis' field of the JSON), not the full JSON.
    // Try to detect profession keywords in the text itself as a best-effort.
    return '—';
}

type SortKey = 'fullName' | 'reqTitle' | 'aiRating' | 'status' | 'createdAt';
type SortDir = 'asc' | 'desc';

export default function CandidatesPage() {
    const { profile } = useAuth();
    const [candidates, setCandidates] = useState<CandWithReq[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [ratingFilter, setRatingFilter] = useState('all');
    const [vacancyFilter, setVacancyFilter] = useState('all');
    const [roleFilter, setRoleFilter] = useState('all');
    const [sortKey, setSortKey] = useState<SortKey>('createdAt');
    const [sortDir, setSortDir] = useState<SortDir>('desc');
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [confirmDialog, setConfirmDialog] = useState<{ isOpen: boolean; candidate: CandWithReq | null }>({
        isOpen: false,
        candidate: null,
    });

    useEffect(() => {
        const fetchCands = async () => {
            if (!profile) return;
            try {
                const reqQuery = query(
                    collection(db, 'requisitions'),
                    where('companyId', '==', profile.companyId || profile.uid)
                );
                const reqSnap = await getDocs(reqQuery);
                const reqMap: Record<string, string> = {};
                reqSnap.forEach(d => { reqMap[d.id] = d.data().title; });

                const candQuery = query(
                    collection(db, 'candidates'),
                    where('companyId', '==', profile.companyId || profile.uid)
                );
                const candSnap = await getDocs(candQuery);

                const cands: CandWithReq[] = [];
                candSnap.forEach(d => {
                    const data = d.data() as Candidate;
                    cands.push({
                        id: d.id,
                        ...data,
                        reqTitle: reqMap[data.requisitionId] || 'Неизвестно',
                        aiField: parseAiField(data.aiAnalysis),
                        aiRoleRec: (data as any).aiRecommendedRole || '',
                    });
                });

                setCandidates(cands);
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };
        fetchCands();
    }, [profile]);

    const handleDelete = async (cand: CandWithReq) => {
        setConfirmDialog({ isOpen: true, candidate: cand });
    };

    const confirmDelete = async () => {
        const cand = confirmDialog.candidate;
        if (!cand) return;
        setConfirmDialog({ isOpen: false, candidate: null });
        setDeletingId(cand.id);
        try {
            await deleteDoc(doc(db, 'candidates', cand.id));
            setCandidates(prev => prev.filter(c => c.id !== cand.id));
        } catch {
            alert('Не удалось удалить кандидата.');
        } finally {
            setDeletingId(null);
        }
    };

    const handleSort = (key: SortKey) => {
        if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        else { setSortKey(key); setSortDir('asc'); }
    };

    const uniqueVacancies = useMemo(() => {
        const s = new Set<string>();
        candidates.forEach(c => { if (c.reqTitle) s.add(c.reqTitle); });
        return Array.from(s).sort();
    }, [candidates]);

    const uniqueRoles = useMemo(() => {
        const s = new Set<string>();
        candidates.forEach(c => {
            const r = (c as any).aiRecommendedRole || c.aiRoleRec;
            if (r && r !== '—' && r.trim()) s.add(r.trim());
        });
        return Array.from(s).sort();
    }, [candidates]);

    const filtered = useMemo(() => {
        let list = candidates.filter(c => {
            if (searchTerm && !c.fullName.toLowerCase().includes(searchTerm.toLowerCase())) return false;
            if (statusFilter !== 'all' && c.status !== statusFilter) return false;
            if (vacancyFilter !== 'all' && c.reqTitle !== vacancyFilter) return false;
            if (roleFilter !== 'all') {
                const cRole = ((c as any).aiRecommendedRole || c.aiRoleRec || '').trim();
                if (cRole !== roleFilter) return false;
            }
            const rating = c.aiRating ?? 0;
            if (ratingFilter === '90' && rating < 90) return false;
            if (ratingFilter === '75' && rating < 75) return false;
            if (ratingFilter === '50' && rating < 50) return false;
            if (ratingFilter === 'low' && rating >= 50) return false;
            return true;
        });

        list.sort((a, b) => {
            let va: any, vb: any;
            if (sortKey === 'createdAt') { va = a.createdAt?.toMillis?.() ?? 0; vb = b.createdAt?.toMillis?.() ?? 0; }
            else if (sortKey === 'aiRating') { va = a.aiRating ?? 0; vb = b.aiRating ?? 0; }
            else if (sortKey === 'fullName') { va = a.fullName; vb = b.fullName; }
            else if (sortKey === 'reqTitle') { va = a.reqTitle ?? ''; vb = b.reqTitle ?? ''; }
            else if (sortKey === 'status') { va = a.status; vb = b.status; }

            if (va < vb) return sortDir === 'asc' ? -1 : 1;
            if (va > vb) return sortDir === 'asc' ? 1 : -1;
            return 0;
        });

        return list;
    }, [candidates, searchTerm, statusFilter, vacancyFilter, roleFilter, ratingFilter, sortKey, sortDir]);

    const exportToPDF = () => {
        const jsPDFDoc = new jsPDF({ orientation: 'landscape' });
        jsPDFDoc.text('Candidate Database Report', 14, 15);
        const columns = ['#', 'Кандидат', 'Вакансия', 'AI Рейтинг', 'Статус', 'Дата загрузки'];
        const rows = filtered.map((c, i) => [
            i + 1,
            c.fullName,
            c.reqTitle || '—',
            `${c.aiRating ?? 0}%`,
            statusLabel(c.status),
            formatDate(c.createdAt),
        ]);
        (jsPDFDoc as any).autoTable({ head: [columns], body: rows, startY: 22 });
        jsPDFDoc.save(`candidates_db_${Date.now()}.pdf`);
    };

    const SortIcon = ({ k }: { k: SortKey }) => {
        if (sortKey !== k) return <ChevronsUpDown className="w-3.5 h-3.5 text-gray-300 ml-1" />;
        return sortDir === 'asc'
            ? <ChevronUp className="w-3.5 h-3.5 text-blue-500 ml-1" />
            : <ChevronDown className="w-3.5 h-3.5 text-blue-500 ml-1" />;
    };

    return (
        <div>
            {/* Header */}
            <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-gradient-to-br from-blue-500 to-indigo-600 text-white rounded-xl shadow-md">
                        <Database className="w-5 h-5" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-black text-gray-900">База кандидатов</h1>
                        <p className="text-sm text-gray-500 mt-0.5">
                            {loading ? '...' : `${filtered.length} из ${candidates.length} кандидатов`}
                        </p>
                    </div>
                </div>
                <button
                    onClick={exportToPDF}
                    className="flex items-center gap-2 px-4 py-2 bg-white border shadow-sm text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium transition-all"
                >
                    <Download className="w-4 h-4" /> Экспорт PDF
                </button>
            </div>

            {/* Filter Bar */}
            <div className="bg-white p-4 rounded-xl shadow-sm border mb-5 flex flex-col lg:flex-row gap-3">
                {/* Search */}
                <div className="flex-1 relative">
                    <Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Поиск по имени кандидата..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm outline-none"
                    />
                </div>

                {/* Vacancy filter */}
                <div className="relative min-w-[180px]">
                    <Briefcase className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" />
                    <select
                        value={vacancyFilter}
                        onChange={e => setVacancyFilter(e.target.value)}
                        className="select-field select-field-icon w-full"
                    >
                        <option value="all">Все вакансии</option>
                        {uniqueVacancies.map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                </div>

                {/* Role filter */}
                <div className="relative min-w-[180px]">
                    <User className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" />
                    <select
                        value={roleFilter}
                        onChange={e => setRoleFilter(e.target.value)}
                        className="select-field select-field-icon w-full"
                    >
                        <option value="all">Все роли</option>
                        {uniqueRoles.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                </div>

                {/* Status filter */}
                <div className="relative min-w-[170px]">
                    <Filter className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" />
                    <select
                        value={statusFilter}
                        onChange={e => setStatusFilter(e.target.value)}
                        className="select-field select-field-icon w-full"
                    >
                        <option value="all">Все статусы</option>
                        <option value="new">Новые</option>
                        <option value="testing">Тестирование</option>
                        <option value="interview">Собеседование</option>
                        <option value="offer">Оффер</option>
                        <option value="accepted">Принят</option>
                        <option value="rejected">Отказ</option>
                    </select>
                </div>

                {/* Rating filter */}
                <div className="relative min-w-[170px]">
                    <Star className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" />
                    <select
                        value={ratingFilter}
                        onChange={e => setRatingFilter(e.target.value)}
                        className="select-field select-field-icon w-full"
                    >
                        {RATING_OPTIONS.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Table */}
            {loading ? (
                <div className="text-center py-16 text-gray-400">
                    <Database className="w-8 h-8 mx-auto mb-3 opacity-30 animate-pulse" />
                    <p className="font-medium">Загрузка базы кандидатов...</p>
                </div>
            ) : (
                <div className="bg-white shadow-sm rounded-xl border overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-100">
                            <thead className="bg-gray-50/80">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase tracking-wider w-12">#</th>

                                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider cursor-pointer select-none"
                                        onClick={() => handleSort('fullName')}>
                                        <span className="flex items-center">Кандидат <SortIcon k="fullName" /></span>
                                    </th>

                                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider cursor-pointer select-none"
                                        onClick={() => handleSort('reqTitle')}>
                                        <span className="flex items-center">Вакансия <SortIcon k="reqTitle" /></span>
                                    </th>

                                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                                        Рекоменд. роль
                                    </th>

                                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider cursor-pointer select-none"
                                        onClick={() => handleSort('aiRating')}>
                                        <span className="flex items-center">AI Рейтинг <SortIcon k="aiRating" /></span>
                                    </th>

                                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider cursor-pointer select-none"
                                        onClick={() => handleSort('status')}>
                                        <span className="flex items-center">Статус <SortIcon k="status" /></span>
                                    </th>

                                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider cursor-pointer select-none"
                                        onClick={() => handleSort('createdAt')}>
                                        <span className="flex items-center"><Calendar className="w-3.5 h-3.5 mr-1" />Дата <SortIcon k="createdAt" /></span>
                                    </th>

                                    <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">CV</th>
                                    <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Удалить</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {filtered.length === 0 ? (
                                    <tr>
                                        <td colSpan={9} className="px-6 py-14 text-center text-gray-400">
                                            <User className="w-8 h-8 mx-auto mb-2 opacity-30" />
                                            <p className="font-medium">Ничего не найдено</p>
                                            <p className="text-sm mt-1">Попробуйте изменить фильтры</p>
                                        </td>
                                    </tr>
                                ) : filtered.map((cand, idx) => (
                                    <tr key={cand.id} className="hover:bg-blue-50/30 transition-colors">
                                        {/* # */}
                                        <td className="px-4 py-3.5 text-xs text-gray-400 font-mono">{idx + 1}</td>

                                        {/* Candidate */}
                                        <td className="px-4 py-3.5">
                                            <div className="flex items-center gap-2.5">
                                                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
                                                    {cand.fullName.charAt(0).toUpperCase()}
                                                </div>
                                                <div>
                                                    <div className="text-sm font-semibold text-gray-900 whitespace-nowrap">{cand.fullName}</div>
                                                    <div className="text-xs text-gray-400 font-mono">{cand.id.slice(0, 8)}…</div>
                                                </div>
                                            </div>
                                        </td>

                                        {/* Vacancy */}
                                        <td className="px-4 py-3.5">
                                            <span className="text-sm text-gray-700 font-medium">{cand.reqTitle || '—'}</span>
                                        </td>

                                        {/* Recommended role — #11 */}
                                        <td className="px-4 py-3.5 max-w-[160px]">
                                            {(cand as any).aiRecommendedRole ? (
                                                <span
                                                    title={(cand as any).aiRecommendedRole}
                                                    className="block text-xs font-semibold text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-full border border-indigo-100 overflow-hidden text-ellipsis whitespace-nowrap cursor-default"
                                                >
                                                    {(cand as any).aiRecommendedRole}
                                                </span>
                                            ) : (
                                                <span className="text-xs text-gray-300 italic">—</span>
                                            )}
                                        </td>


                                        {/* AI Rating */}
                                        <td className="px-4 py-3.5 whitespace-nowrap">
                                            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border ${ratingBadge(cand.aiRating ?? 0)}`}>
                                                <Star className="w-3 h-3 fill-current" />
                                                {cand.aiRating ?? 0}%
                                            </span>
                                        </td>

                                        {/* Status */}
                                        <td className="px-4 py-3.5 whitespace-nowrap">
                                            <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${statusColor(cand.status)}`}>
                                                {statusLabel(cand.status)}
                                            </span>
                                        </td>

                                        {/* Date */}
                                        <td className="px-4 py-3.5 whitespace-nowrap text-sm text-gray-500">
                                            {formatDate(cand.createdAt)}
                                        </td>

                                        {/* CV Download */}
                                        <td className="px-4 py-3.5 text-center">
                                            {cand.resumeUrl ? (
                                                <a
                                                    href={cand.resumeUrl}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    title="Скачать / Просмотреть резюме"
                                                    className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-blue-600 hover:bg-blue-50 transition-colors"
                                                >
                                                    <FileDown className="w-4 h-4" />
                                                </a>
                                            ) : (
                                                <span className="text-gray-300 text-xs">—</span>
                                            )}
                                        </td>

                                        {/* Delete */}
                                        <td className="px-4 py-3.5 text-center">
                                            <button
                                                onClick={() => handleDelete(cand)}
                                                disabled={deletingId === cand.id}
                                                title="Удалить кандидата"
                                                className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-30"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Footer summary */}
                    {filtered.length > 0 && (
                        <div className="px-5 py-3 bg-gray-50 border-t flex items-center justify-between text-xs text-gray-400">
                            <span>Показано {filtered.length} записей</span>
                            <span className="flex items-center gap-3">
                                <span className="flex items-center gap-1">
                                    <span className="w-2 h-2 rounded-full bg-green-400 inline-block"></span> ≥75%: {filtered.filter(c => (c.aiRating ?? 0) >= 75).length}
                                </span>
                                <span className="flex items-center gap-1">
                                    <span className="w-2 h-2 rounded-full bg-yellow-400 inline-block"></span> 50–74%: {filtered.filter(c => (c.aiRating ?? 0) >= 50 && (c.aiRating ?? 0) < 75).length}
                                </span>
                                <span className="flex items-center gap-1">
                                    <span className="w-2 h-2 rounded-full bg-red-400 inline-block"></span> &lt;50%: {filtered.filter(c => (c.aiRating ?? 0) < 50).length}
                                </span>
                            </span>
                        </div>
                    )}
                </div>
            )}

            <ConfirmDialog
                isOpen={confirmDialog.isOpen}
                title="Удалить кандидата?"
                message={`Вы уверены, что хотите удалить кандидата "${confirmDialog.candidate?.fullName}"? Это действие нельзя отменить.`}
                confirmLabel="Удалить"
                cancelLabel="Отмена"
                variant="danger"
                onConfirm={confirmDelete}
                onCancel={() => setConfirmDialog({ isOpen: false, candidate: null })}
            />
        </div>
    );
}
