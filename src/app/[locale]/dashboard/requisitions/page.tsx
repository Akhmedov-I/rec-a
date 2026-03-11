"use client";

import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { db, Requisition, getRecruiters, UserProfile } from '@/lib/db';
import { collection, query, where, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { Link, useRouter } from '@/i18n/routing';
import { Plus, FileText, Clock, Users, CheckCircle, ChevronRight, Search, Loader2, Pencil, Trash2, Filter } from 'lucide-react';
import { toast } from 'react-hot-toast';
import ConfirmDialog from '@/components/ConfirmDialog';

type ReqWithStats = Requisition & {
    totalCandidates: number;
    activeCandidates: number;
    testedCandidates: number;
    creatorName: string;
};

export default function RequisitionsPage() {
    const { profile } = useAuth();
    const router = useRouter();
    const [requisitions, setRequisitions] = useState<ReqWithStats[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [recruiterFilter, setRecruiterFilter] = useState('all');
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [recruiters, setRecruiters] = useState<UserProfile[]>([]);
    const [confirmTarget, setConfirmTarget] = useState<ReqWithStats | null>(null);

    useEffect(() => {
        const fetchRequisitions = async () => {
            if (!profile) return;
            try {
                const reqsRef = collection(db, 'requisitions');
                let q;
                if (profile.role === 'private_recruiter') {
                    q = query(reqsRef, where('createdBy', '==', profile.uid));
                } else if (profile.role === 'recruiter') {
                    // Recruiter sees ONLY requisitions where they are assigned
                    q = query(reqsRef,
                        where('companyId', '==', profile.companyId),
                        where('assignedTo', '==', profile.uid)
                    );
                } else if (profile.companyId) {
                    q = query(reqsRef, where('companyId', '==', profile.companyId));
                } else { return; }

                const querySnapshot = await getDocs(q);
                const reqs: Requisition[] = [];
                querySnapshot.forEach((doc) => {
                    const data = doc.data() as Omit<Requisition, 'id'>;
                    reqs.push({ id: doc.id, ...data });
                });
                reqs.sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());

                const companyId = profile.companyId || profile.uid;
                const candQuery = query(collection(db, 'candidates'), where('companyId', '==', companyId));
                const candSnap = await getDocs(candQuery);

                const countMap: Record<string, { total: number; active: number; tested: number }> = {};
                candSnap.forEach(d => {
                    const c = d.data();
                    const rid = c.requisitionId;
                    if (!rid) return;
                    if (!countMap[rid]) countMap[rid] = { total: 0, active: 0, tested: 0 };
                    countMap[rid].total++;
                    if (c.status !== 'rejected') countMap[rid].active++;
                    if (['testing', 'interview', 'offer', 'accepted'].includes(c.status)) countMap[rid].tested++;
                });

                const userIds = [...new Set(reqs.map(r => r.createdBy).filter(Boolean))];
                const userMap: Record<string, string> = {};
                for (const uid of userIds) {
                    userMap[uid] = uid === profile.uid
                        ? (profile.displayName || profile.email || uid.slice(0, 8))
                        : uid.slice(0, 8) + '…';
                }

                setRequisitions(reqs.map(r => ({
                    ...r,
                    totalCandidates: countMap[r.id]?.total ?? 0,
                    activeCandidates: countMap[r.id]?.active ?? 0,
                    testedCandidates: countMap[r.id]?.tested ?? 0,
                    creatorName: userMap[r.createdBy] || '—',
                })));
            } catch (error) {
                console.error('Error fetching requisitions: ', error);
            } finally {
                setLoading(false);
            }
        };
        fetchRequisitions();

        // Load recruiter list for managers
        if (profile && ['admin', 'hrd', 'manager', 'requester', 'private_recruiter'].includes(profile.role) && (profile.companyId || profile.uid)) {
            getRecruiters(profile.companyId || profile.uid).then(setRecruiters);
        }
    }, [profile]);

    const handleDelete = (req: ReqWithStats) => {
        setConfirmTarget(req);
    };

    const confirmDelete = async () => {
        if (!confirmTarget) return;
        setDeletingId(confirmTarget.id);
        setConfirmTarget(null);
        try {
            await deleteDoc(doc(db, 'requisitions', confirmTarget.id));
            setRequisitions(prev => prev.filter(r => r.id !== confirmTarget.id));
            toast.success('Заявка удалена');
        } catch {
            toast.error('Ошибка удаления');
        } finally {
            setDeletingId(null);
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'open': return 'bg-blue-100 text-blue-700 border-blue-200';
            case 'in_progress': return 'bg-amber-100 text-amber-700 border-amber-200';
            case 'offer': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
            case 'hired': return 'bg-teal-100 text-teal-700 border-teal-300';
            case 'closed': return 'bg-gray-100 text-gray-500 border-gray-200';
            case 'paused': return 'bg-yellow-100 text-yellow-700 border-yellow-200';
            default: return 'bg-gray-100 text-gray-500 border-gray-200';
        }
    };

    const getStatusText = (status: string) => {
        switch (status) {
            case 'open': return 'Открыта';
            case 'in_progress': return 'В работе';
            case 'offer': return 'Оффер';
            case 'hired': return 'Закрыта (найм)';
            case 'closed': return 'Закрыта';
            case 'paused': return 'Приостановлена';
            default: return status;
        }
    };

    // Icon for mobile cards
    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'hired': return '✅';
            case 'paused': return '⏸';
            case 'closed': return '🔒';
            case 'offer': return '📄';
            default: return '';
        }
    };

    const canSeeAllReqs = profile && ['admin', 'hrd', 'manager', 'requester', 'private_recruiter'].includes(profile.role);

    // Recruiter options from Firestore users
    const recruiterOptions = useMemo(() => {
        return recruiters.map(r => ({
            uid: r.uid,
            name: r.displayName || r.email || r.uid,
        }));
    }, [recruiters]);

    const filtered = useMemo(() => {
        return requisitions.filter(r => {
            if (search && !r.title.toLowerCase().includes(search.toLowerCase())) return false;
            if (statusFilter !== 'all' && r.status !== statusFilter) return false;
            if (recruiterFilter !== 'all' && r.assignedTo !== recruiterFilter) return false;
            return true;
        });
    }, [requisitions, search, statusFilter, recruiterFilter]);

    return (
        <div>
            <ConfirmDialog
                isOpen={!!confirmTarget}
                title="Удалить заявку?"
                message={`Заявка «${confirmTarget?.title}» будет удалена безвозвратно. Это действие нельзя отменить.`}
                confirmLabel="Удалить"
                cancelLabel="Отмена"
                variant="danger"
                onConfirm={confirmDelete}
                onCancel={() => setConfirmTarget(null)}
            />
            {/* Header */}
            <div className="flex flex-wrap justify-between items-start gap-3 mb-6">
                <div>
                    <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Заявки на подбор</h1>
                    <p className="text-sm text-gray-500 mt-1">{requisitions.length} заявок всего</p>
                </div>
                <Link
                    href="/dashboard/requisitions/create"
                    className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition font-semibold text-sm shadow-sm shadow-blue-200 whitespace-nowrap"
                >
                    <Plus className="w-4 h-4 flex-shrink-0" />
                    <span className="hidden xs:inline">Создать заявку</span>
                    <span className="xs:hidden">Создать</span>
                </Link>
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3 mb-5">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                        type="text"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Поиск по названию..."
                        className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white"
                    />
                </div>
                <div className="relative">
                    <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                    <select
                        value={statusFilter}
                        onChange={e => setStatusFilter(e.target.value)}
                        className="select-field select-field-icon w-full sm:w-56"
                    >
                        <option value="all">Все статусы</option>
                        <option value="open">Открыта</option>
                        <option value="in_progress">В работе</option>
                        <option value="offer">Оффер</option>
                        <option value="hired">Закрыта (найм)</option>
                        <option value="closed">Закрыта</option>
                        <option value="paused">Приостановлена</option>
                    </select>
                </div>
                {/* Recruiter filter — shown only to admin/hrd/manager */}
                {canSeeAllReqs && (
                    <div className="relative">
                        <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                        <select
                            value={recruiterFilter}
                            onChange={e => setRecruiterFilter(e.target.value)}
                            className="select-field select-field-icon w-full sm:w-52"
                        >
                            <option value="all">Все рекрутеры</option>
                            {recruiterOptions.map(r => (
                                <option key={r.uid} value={r.uid}>{r.name}</option>
                            ))}
                        </select>
                    </div>
                )}
            </div>

            {loading ? (
                <div className="text-center py-16 text-gray-400">
                    <Loader2 className="w-8 h-8 mx-auto mb-3 animate-spin text-blue-400" />
                    <p className="font-medium">Загрузка заявок...</p>
                </div>
            ) : filtered.length === 0 ? (
                <div className="text-center py-16 bg-white rounded-2xl shadow-sm border">
                    <FileText className="mx-auto h-12 w-12 text-gray-300 mb-3" />
                    <h3 className="text-sm font-semibold text-gray-900">Нет заявок</h3>
                    <p className="mt-1 text-sm text-gray-500">
                        {search || statusFilter !== 'all' ? 'Ничего не найдено по фильтрам.' : 'Начните с создания новой заявки на подбор.'}
                    </p>
                </div>
            ) : (
                <>
                    {/* ── MOBILE: Card list (< md) ── */}
                    <div className="md:hidden space-y-3">
                        {filtered.map((req, idx) => (
                            <div key={req.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                                <Link href={`/dashboard/requisitions/${req.id}`} className="block p-4">
                                    <div className="flex items-start justify-between gap-2 mb-2">
                                        <div className="flex-1 min-w-0">
                                            <span className="text-xs text-gray-400 font-mono mr-1">#{idx + 1}</span>
                                            <span className="text-sm font-bold text-gray-900 leading-tight">{req.title}</span>
                                            {(req as any).department && (
                                                <p className="text-xs text-gray-400 mt-0.5">{(req as any).department}</p>
                                            )}
                                        </div>
                                        <span className={`flex-shrink-0 px-2.5 py-1 rounded-full text-xs font-semibold border whitespace-nowrap ${getStatusColor(req.status)}`}>
                                            {getStatusIcon(req.status)} {getStatusText(req.status)}
                                        </span>
                                    </div>
                                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                                        <span><Users className="w-3 h-3 inline mr-1" />{req.totalCandidates} канд.</span>
                                        <span className={req.activeCandidates > 0 ? 'text-blue-600 font-semibold' : ''}>{req.activeCandidates} актив.</span>
                                        <span className={req.testedCandidates > 0 ? 'text-indigo-600 font-semibold' : ''}>{req.testedCandidates} на тесте+</span>
                                        <span><Clock className="w-3 h-3 inline mr-1" />{new Date(req.createdAt.toDate()).toLocaleDateString('ru-RU')}</span>
                                        {req.assignedToName && <span className="text-blue-600 font-semibold">• {req.assignedToName}</span>}
                                    </div>
                                </Link>
                                <div className="flex items-center justify-end gap-1 px-3 pb-3">
                                    <Link href={`/dashboard/requisitions/${req.id}`}
                                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg hover:bg-blue-50 text-blue-600 text-xs font-semibold transition-colors">
                                        <ChevronRight className="w-3.5 h-3.5" /> Открыть
                                    </Link>
                                    <Link href={`/dashboard/requisitions/${req.id}/edit`}
                                        className="flex items-center justify-center w-7 h-7 rounded-lg hover:bg-amber-100 text-gray-400 hover:text-amber-600 transition-colors">
                                        <Pencil className="w-3.5 h-3.5" />
                                    </Link>
                                    <button onClick={() => handleDelete(req)} disabled={deletingId === req.id}
                                        className="flex items-center justify-center w-7 h-7 rounded-lg hover:bg-red-100 text-gray-400 hover:text-red-600 transition-colors disabled:opacity-50">
                                        {deletingId === req.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* ── DESKTOP: Table (≥ md) ── */}
                    <div className="hidden md:block bg-white shadow-sm rounded-2xl border overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-100">
                                <thead className="bg-gray-50/80">
                                    <tr>
                                        <th className="px-4 py-3.5 text-left text-xs font-bold text-gray-400 uppercase tracking-wider w-8">#</th>
                                        <th className="px-4 py-3.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Название</th>
                                        <th className="px-4 py-3.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Статус</th>
                                        <th className="px-4 py-3.5 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">
                                            <Users className="w-3.5 h-3.5 inline mr-1" />Канд.
                                        </th>
                                        <th className="px-4 py-3.5 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Актив.</th>
                                        <th className="px-4 py-3.5 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Тест+</th>
                                        <th className="px-4 py-3.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                                            <Clock className="w-3.5 h-3.5 inline mr-1" />Создана
                                        </th>
                                        <th className="px-4 py-3.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                                            <Users className="w-3.5 h-3.5 inline mr-1" />Рекрутер
                                        </th>
                                        <th className="px-4 py-3.5 w-24 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Действия</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {filtered.map((req, idx) => (
                                        <tr key={req.id} className="hover:bg-blue-50/30 transition-colors group">
                                            <td className="px-4 py-4 text-xs text-gray-400 font-mono whitespace-nowrap">{idx + 1}</td>
                                            <td className="px-4 py-4">
                                                <Link href={`/dashboard/requisitions/${req.id}`} className="block">
                                                    <p className="text-sm font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">{req.title}</p>
                                                    {(req as any).department && <p className="text-xs text-gray-400 mt-0.5">{(req as any).department}</p>}
                                                </Link>
                                            </td>
                                            <td className="px-4 py-4 whitespace-nowrap">
                                                <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${getStatusColor(req.status)}`}>
                                                    {getStatusText(req.status)}
                                                </span>
                                            </td>
                                            <td className="px-4 py-4 text-center whitespace-nowrap">
                                                <span className="text-sm font-bold text-gray-800">{req.totalCandidates}</span>
                                            </td>
                                            <td className="px-4 py-4 text-center whitespace-nowrap">
                                                <span className={`text-sm font-semibold ${req.activeCandidates > 0 ? 'text-blue-600' : 'text-gray-400'}`}>
                                                    {req.activeCandidates}
                                                </span>
                                            </td>
                                            <td className="px-4 py-4 text-center whitespace-nowrap">
                                                <span className={`text-sm font-semibold ${req.testedCandidates > 0 ? 'text-indigo-600' : 'text-gray-400'}`}>
                                                    {req.testedCandidates}
                                                </span>
                                            </td>
                                            <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                                                {new Date(req.createdAt.toDate()).toLocaleDateString('ru-RU')}
                                            </td>
                                            <td className="px-4 py-4 whitespace-nowrap">
                                                {req.assignedToName
                                                    ? <span className="text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-1 rounded-lg">{req.assignedToName}</span>
                                                    : <span className="text-xs text-gray-400">—</span>
                                                }
                                            </td>
                                            <td className="px-4 py-4">
                                                <div className="flex items-center justify-center gap-1">
                                                    <Link href={`/dashboard/requisitions/${req.id}`}
                                                        className="flex items-center justify-center w-7 h-7 rounded-lg hover:bg-blue-100 text-gray-400 hover:text-blue-600 transition-colors"
                                                        title="Открыть">
                                                        <ChevronRight className="w-4 h-4" />
                                                    </Link>
                                                    <Link href={`/dashboard/requisitions/${req.id}/edit`}
                                                        className="flex items-center justify-center w-7 h-7 rounded-lg hover:bg-amber-100 text-gray-400 hover:text-amber-600 transition-colors"
                                                        title="Редактировать">
                                                        <Pencil className="w-3.5 h-3.5" />
                                                    </Link>
                                                    <button
                                                        onClick={() => handleDelete(req)}
                                                        disabled={deletingId === req.id}
                                                        className="flex items-center justify-center w-7 h-7 rounded-lg hover:bg-red-100 text-gray-400 hover:text-red-600 transition-colors disabled:opacity-50"
                                                        title="Удалить">
                                                        {deletingId === req.id
                                                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                            : <Trash2 className="w-3.5 h-3.5" />}
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
