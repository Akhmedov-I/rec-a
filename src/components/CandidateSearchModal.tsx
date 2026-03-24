"use client";

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { db } from '@/lib/db';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { Search, X, User, Star } from 'lucide-react';

type Hit = {
    id: string;
    fullName: string;
    requisitionId?: string;
    reqTitle?: string;
    aiRating?: number;
    status?: string;
};

const statusLabel: Record<string, string> = {
    new: 'Новый', testing: 'Тестирование', interview: 'Интервью',
    offer: 'Оффер', accepted: 'Принят', rejected: 'Отказ', offer_declined: 'Отказ от оффера',
};
const statusColor: Record<string, string> = {
    new: 'bg-blue-100 text-blue-700',
    testing: 'bg-yellow-100 text-yellow-700',
    interview: 'bg-purple-100 text-purple-700',
    offer: 'bg-emerald-100 text-emerald-700',
    accepted: 'bg-green-100 text-green-700',
    rejected: 'bg-red-100 text-red-700',
    offer_declined: 'bg-rose-100 text-rose-700',
};

export default function CandidateSearchModal({ onClose }: { onClose: () => void }) {
    const { profile } = useAuth();
    const router = useRouter();
    const [q, setQ] = useState('');
    const [all, setAll] = useState<Hit[]>([]);
    const [loading, setLoading] = useState(true);
    const inputRef = useRef<HTMLInputElement>(null);

    // Load all candidates once
    useEffect(() => {
        const load = async () => {
            if (!profile) return;
            try {
                const companyId = profile.companyId || profile.uid;
                // Load requisitions for title mapping
                const reqSnap = await getDocs(query(collection(db, 'requisitions'), where('companyId', '==', companyId)));
                const reqMap: Record<string, string> = {};
                reqSnap.docs.forEach(d => { reqMap[d.id] = (d.data().title as string) || '—'; });

                const candSnap = await getDocs(query(collection(db, 'candidates'), where('companyId', '==', companyId)));
                const hits: Hit[] = candSnap.docs.map(d => {
                    const data = d.data();
                    return {
                        id: d.id,
                        fullName: data.fullName || '—',
                        requisitionId: data.requisitionId,
                        reqTitle: data.requisitionId ? reqMap[data.requisitionId] : undefined,
                        aiRating: data.aiRating,
                        status: data.status,
                    };
                });
                hits.sort((a, b) => (b.aiRating ?? 0) - (a.aiRating ?? 0));
                setAll(hits);
            } finally {
                setLoading(false);
            }
        };
        load();
        setTimeout(() => inputRef.current?.focus(), 50);
    }, [profile]);

    const results = q.trim()
        ? all.filter(h => h.fullName.toLowerCase().includes(q.toLowerCase()) || h.reqTitle?.toLowerCase().includes(q.toLowerCase()))
        : all.slice(0, 20);

    const handleSelect = (hit: Hit) => {
        if (hit.requisitionId) {
            router.push(`/ru/dashboard/requisitions/${hit.requisitionId}#cand-${hit.id}`);
        } else {
            router.push(`/ru/dashboard/candidates`);
        }
        onClose();
    };

    return (
        <div className="fixed inset-0 z-[200] flex items-start justify-center pt-16 px-4"
            style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)' }}
            onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden" style={{ maxHeight: '75vh', display: 'flex', flexDirection: 'column' }}>
                {/* Search input */}
                <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
                    <Search className="w-5 h-5 text-blue-500 shrink-0" />
                    <input
                        ref={inputRef}
                        value={q}
                        onChange={e => setQ(e.target.value)}
                        placeholder="Поиск кандидата по имени или вакансии..."
                        className="flex-1 text-base outline-none text-gray-800 placeholder-gray-400"
                    />
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Results */}
                <div className="overflow-y-auto flex-1">
                    {loading ? (
                        <div className="py-10 text-center text-gray-400 text-sm">Загрузка...</div>
                    ) : results.length === 0 ? (
                        <div className="py-10 text-center text-gray-400 text-sm">Ничего не найдено</div>
                    ) : (
                        <ul className="divide-y divide-gray-50">
                            {results.map(hit => {
                                const rating = hit.aiRating ?? 0;
                                const ratingColor = rating >= 75 ? 'text-emerald-600' : rating >= 50 ? 'text-blue-600' : rating >= 30 ? 'text-amber-500' : 'text-red-500';
                                return (
                                    <li key={hit.id}>
                                        <button
                                            onClick={() => handleSelect(hit)}
                                            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-blue-50/60 transition-colors text-left"
                                        >
                                            {/* Avatar */}
                                            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white text-sm font-bold shrink-0">
                                                {hit.fullName.charAt(0).toUpperCase()}
                                            </div>
                                            {/* Info */}
                                            <div className="flex-1 min-w-0">
                                                <div className="font-semibold text-gray-900 text-sm truncate">{hit.fullName}</div>
                                                {hit.reqTitle && <div className="text-xs text-gray-400 truncate">{hit.reqTitle}</div>}
                                            </div>
                                            {/* Rating */}
                                            <div className={`text-sm font-black ${ratingColor} shrink-0`}>
                                                <Star className="w-3 h-3 inline mr-0.5 fill-current" />{rating}%
                                            </div>
                                            {/* Status */}
                                            {hit.status && (
                                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${statusColor[hit.status] || 'bg-gray-100 text-gray-600'}`}>
                                                    {statusLabel[hit.status] || hit.status}
                                                </span>
                                            )}
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>

                {/* Footer */}
                {!loading && all.length > 0 && (
                    <div className="px-4 py-2 border-t border-gray-100 text-xs text-gray-400 text-right">
                        {q.trim() ? `${results.length} из ${all.length}` : `Показаны первые 20 из ${all.length}`} кандидатов
                    </div>
                )}
            </div>
        </div>
    );
}
