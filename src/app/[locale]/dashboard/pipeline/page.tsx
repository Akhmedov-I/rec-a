"use client";

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { db, Candidate, Requisition } from '@/lib/db';
import { collection, query, where, getDocs, doc, updateDoc, getDoc } from 'firebase/firestore';
import { Loader2, User, ChevronRight, FileText } from 'lucide-react';
import { toast } from 'react-hot-toast';

type CandidateWithReq = Candidate & { reqTitle?: string; reqStatus?: string; reqData?: Requisition };

const COLUMNS = [
    { id: 'new', title: 'Новые' },
    { id: 'testing', title: 'Тестирование' },
    { id: 'interview', title: 'Собеседование' },
    { id: 'offer', title: 'Оффер' }
];

export default function PipelinePage() {
    const { profile } = useAuth();
    const [candidates, setCandidates] = useState<CandidateWithReq[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedReq, setSelectedReq] = useState<string>('all');
    const [requisitions, setRequisitions] = useState<Requisition[]>([]);

    // Offer modal state
    const [offerModalOpen, setOfferModalOpen] = useState(false);
    const [selectedCandidate, setSelectedCandidate] = useState<CandidateWithReq | null>(null);
    const [offerConditions, setOfferConditions] = useState('');
    const [generatedOffer, setGeneratedOffer] = useState('');
    const [generatingOffer, setGeneratingOffer] = useState(false);

    useEffect(() => {
        const fetchData = async () => {
            if (!profile) return;
            try {
                // Get Requisitions
                const reqQuery = query(collection(db, 'requisitions'), where('companyId', '==', profile.companyId || profile.uid));
                const reqSnap = await getDocs(reqQuery);
                const reqs: Requisition[] = [];
                reqSnap.forEach(d => reqs.push({ id: d.id, ...d.data() } as Requisition));
                setRequisitions(reqs);

                // Get Candidates
                const candQuery = query(collection(db, 'candidates'), where('companyId', '==', profile.companyId || profile.uid));
                const candSnap = await getDocs(candQuery);
                const cands: CandidateWithReq[] = [];
                candSnap.forEach(d => {
                    const data = d.data() as Candidate;
                    const req = reqs.find(r => r.id === data.requisitionId);
                    cands.push({ id: d.id, ...data, reqTitle: req?.title, reqStatus: req?.status, reqData: req });
                });
                setCandidates(cands);

            } catch (error) {
                console.error("Error fetching pipeline", error);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [profile]);

    const handleStatusChange = async (candId: string, newStatus: Candidate['status']) => {
        try {
            await updateDoc(doc(db, 'candidates', candId), { status: newStatus });
            setCandidates(candidates.map(c => c.id === candId ? { ...c, status: newStatus } : c));
        } catch (error) {
            console.error("Error updating status", error);
            toast.error("Ошибка при обновлении статуса");
        }
    };

    const handleAcceptOffer = async (candId: string, reqId: string) => {
        try {
            // Mark candidate as accepted
            await updateDoc(doc(db, 'candidates', candId), { status: 'accepted' });

            // Close the requisition
            await updateDoc(doc(db, 'requisitions', reqId), { status: 'closed' });

            setCandidates(candidates.map(c => c.id === candId ? { ...c, status: 'accepted' } : c));
            setRequisitions(requisitions.map(r => r.id === reqId ? { ...r, status: 'closed' } : r));

            toast.success('Оффер принят! Заявка закрыта.');
            setOfferModalOpen(false);
        } catch (error) {
            console.error("Error accepting offer", error);
            toast.error("Ошибка при принятии оффера");
        }
    };

    const handleReject = async (candId: string) => {
        try {
            await updateDoc(doc(db, 'candidates', candId), { status: 'rejected' });
            setCandidates(candidates.map(c => c.id === candId ? { ...c, status: 'rejected' } : c));
            setOfferModalOpen(false);
        } catch (error) {
            console.error("Error rejecting", error);
            toast.error("Ошибка при отказе");
        }
    };

    const generateOffer = async () => {
        if (!selectedCandidate || !selectedCandidate.reqData) return;
        setGeneratingOffer(true);
        try {
            const res = await fetch(`/api/candidates/${selectedCandidate.id}/offer`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    candidate: selectedCandidate,
                    requisition: selectedCandidate.reqData,
                    conditions: offerConditions
                })
            });
            const data = await res.json();
            if (res.ok) {
                setGeneratedOffer(data.offerText);
                // Also move candidate to offer stage if not already
                if (selectedCandidate.status !== 'offer') {
                    handleStatusChange(selectedCandidate.id, 'offer');
                }
            } else {
                toast.error('Ошибка генерации: ' + data.error);
            }
        } catch (e) {
            console.error(e);
            toast.error('Ошибка сети при генерации');
        } finally {
            setGeneratingOffer(false);
        }
    };

    const filteredCandidates = candidates.filter(c =>
        (selectedReq === 'all' || c.requisitionId === selectedReq) &&
        !['accepted', 'rejected'].includes(c.status)
    );

    if (loading) return <div className="p-10 text-center">Загрузка воронки...</div>;

    return (
        <div className="flex flex-col h-full">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold text-gray-900">Воронка кандидатов (Pipeline)</h1>
                <select
                    value={selectedReq}
                    onChange={e => setSelectedReq(e.target.value)}
                    className="select-field"
                >
                    <option value="all">Все открытые заявки</option>
                    {requisitions.filter(r => r.status !== 'closed').map(r => (
                        <option key={r.id} value={r.id}>{r.title}</option>
                    ))}
                </select>
            </div>

            <div className="flex-1 flex gap-4 overflow-x-auto pb-4">
                {COLUMNS.map(col => {
                    const colCands = filteredCandidates.filter(c => c.status === col.id);
                    return (
                        <div key={col.id} className="w-80 flex-shrink-0 bg-gray-50 rounded-xl border flex flex-col h-[calc(100vh-12rem)]">
                            <div className="p-4 border-b bg-gray-100 rounded-t-xl font-medium text-gray-700 flex justify-between">
                                <span>{col.title}</span>
                                <span className="bg-gray-200 text-gray-700 px-2 py-0.5 rounded text-xs">{colCands.length}</span>
                            </div>
                            <div className="flex-1 p-3 overflow-y-auto space-y-3">
                                {colCands.map(cand => (
                                    <div key={cand.id} className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 cursor-move">
                                        <div className="flex justify-between items-start mb-2">
                                            <h4 className="font-semibold text-gray-900 text-sm">{cand.fullName}</h4>
                                            <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded">AI: {cand.aiRating}</span>
                                        </div>
                                        <p className="text-xs text-gray-500 mb-3 truncate">{cand.reqTitle}</p>

                                        <div className="flex justify-between items-center mt-4">
                                            <span className="text-xs text-gray-400 italic">Этап меняется через заявку</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Offer Modal */}
            {offerModalOpen && selectedCandidate && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col">
                        <div className="p-6 border-b">
                            <h2 className="text-xl font-bold">Оффер для {selectedCandidate.fullName}</h2>
                            <p className="text-sm text-gray-500">{selectedCandidate.reqTitle}</p>
                        </div>
                        <div className="p-6 overflow-y-auto flex-1">
                            {!generatedOffer ? (
                                <div className="space-y-4">
                                    <label className="block text-sm font-medium text-gray-700">Особые условия для кандидата (Опционально)</label>
                                    <textarea
                                        rows={3}
                                        value={offerConditions}
                                        onChange={e => setOfferConditions(e.target.value)}
                                        placeholder="Например: ЗП 200 000 руб, ДМС после испытательного срока..."
                                        className="w-full border rounded-lg p-3 text-sm"
                                    />
                                    <button
                                        onClick={generateOffer}
                                        disabled={generatingOffer}
                                        className="w-full py-3 bg-blue-600 text-white rounded-lg font-medium flex justify-center items-center disabled:opacity-50"
                                    >
                                        {generatingOffer ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <FileText className="w-5 h-5 mr-2" />}
                                        Сгенерировать Оффер (AI)
                                    </button>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <h3 className="font-medium">Текст оффера:</h3>
                                    <textarea
                                        rows={12}
                                        value={generatedOffer}
                                        onChange={e => setGeneratedOffer(e.target.value)}
                                        className="w-full border rounded-lg p-3 text-sm font-mono bg-gray-50"
                                    />
                                    <div className="flex gap-4">
                                        <button
                                            onClick={() => handleAcceptOffer(selectedCandidate.id, selectedCandidate.requisitionId)}
                                            className="flex-1 py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition"
                                        >
                                            Кандидат принял Оффер
                                        </button>
                                        <button
                                            onClick={() => handleReject(selectedCandidate.id)}
                                            className="flex-1 py-3 bg-red-100 text-red-700 rounded-lg font-medium hover:bg-red-200 transition"
                                        >
                                            Отказ
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="p-4 border-t flex justify-end">
                            <button onClick={() => setOfferModalOpen(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded">Закрыть</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
