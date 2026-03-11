"use client";

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { db, Candidate, Requisition, TestSession } from '@/lib/db';
import { collection, query, where, getDocs, doc, addDoc, updateDoc, Timestamp, getDoc } from 'firebase/firestore';
import { Loader2, Plus, Copy, CheckCircle, ExternalLink } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { toast } from 'react-hot-toast';

export default function TestingDashboardPage() {
    const { profile, companyName } = useAuth();
    const [candidates, setCandidates] = useState<(Candidate & { reqTitle?: string, test?: TestSession })[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedCandidate, setSelectedCandidate] = useState<string | null>(null);
    const [generating, setGenerating] = useState(false);
    const [generatedLink, setGeneratedLink] = useState('');

    useEffect(() => {
        const fetchData = async () => {
            if (!profile) return;
            try {
                // Get Candidates
                const cQuery = query(collection(db, 'candidates'), where('companyId', '==', profile.companyId || profile.uid));
                const cSnap = await getDocs(cQuery);
                let cands: (Candidate & { reqTitle?: string, test?: TestSession })[] = [];

                cSnap.forEach(d => cands.push({ id: d.id, ...d.data() } as Candidate));

                // Enhance with Requisition titles and Test Sessions
                for (let c of cands) {
                    if (c.requisitionId) {
                        const reqDoc = await getDoc(doc(db, 'requisitions', c.requisitionId));
                        if (reqDoc.exists()) c.reqTitle = reqDoc.data().title;
                    }

                    const tQuery = query(collection(db, 'tests'), where('candidateId', '==', c.id));
                    const tSnap = await getDocs(tQuery);
                    if (!tSnap.empty) {
                        c.test = { id: tSnap.docs[0].id, ...tSnap.docs[0].data() } as TestSession;
                    }
                }

                cands.sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());
                setCandidates(cands);
            } catch (error) {
                console.error("Error fetching data:", error);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [profile]);

    const handleGenerateTest = async () => {
        if (!selectedCandidate) return;
        const cand = candidates.find(c => c.id === selectedCandidate);
        if (!cand) return;

        setGenerating(true);
        try {
            const token = uuidv4();

            const response = await fetch('/api/testing/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    candidateName: cand.fullName,
                    position: cand.reqTitle || cand.aiRecommendedRole || 'Специалист',
                    requisitionId: cand.requisitionId
                })
            });

            const data = await response.json();

            if (response.ok) {
                const newTest = {
                    candidateId: cand.id,
                    requisitionId: cand.requisitionId,
                    companyId: cand.companyId,
                    token,
                    candidateName: cand.fullName,
                    companyName: companyName || 'Компания',
                    position: cand.reqTitle || cand.aiRecommendedRole || 'Специалист',
                    blocks: data.blocks,
                    status: 'pending' as const,
                    createdAt: Timestamp.now()
                };

                const testRef = await addDoc(collection(db, 'tests'), newTest);
                await updateDoc(doc(db, 'candidates', cand.id), { status: 'testing' });

                const link = `${window.location.origin}/ru/test/${token}`;
                setGeneratedLink(link);

                setCandidates(candidates.map(c =>
                    c.id === cand.id ? { ...c, status: 'testing', test: { id: testRef.id, ...newTest } as TestSession } : c
                ));
                toast.success('Тест создан! Ссылка готова.');
            } else {
                toast.error('Ошибка генерации теста: ' + data.error);
            }
        } catch (error) {
            console.error('Error generating test:', error);
            toast.error('Произошла ошибка при генерации теста');
        } finally {
            setGenerating(false);
        }
    };

    const copyToClipboard = () => {
        navigator.clipboard.writeText(generatedLink);
        toast.success('Ссылка скопирована!');
    };

    return (
        <div className="max-w-6xl mx-auto">
            <h1 className="text-2xl font-bold text-gray-900 mb-6">Центр тестирования кандидатов</h1>

            <div className="flex flex-col md:flex-row gap-6">
                {/* Candidates List */}
                <div className="w-full md:w-1/2 bg-white rounded-xl shadow-sm border overflow-hidden">
                    <div className="p-4 border-b bg-gray-50 font-medium">Выберите кандидата для тестирования</div>
                    {loading ? (
                        <div className="p-8 text-center text-gray-500">Загрузка...</div>
                    ) : candidates.length === 0 ? (
                        <div className="p-8 text-center text-gray-500">Кандидаты не найдены</div>
                    ) : (
                        <ul className="divide-y divide-gray-200 max-h-[600px] overflow-y-auto">
                            {candidates.map(cand => (
                                <li
                                    key={cand.id}
                                    className={`p-4 cursor-pointer hover:bg-gray-50 transition ${selectedCandidate === cand.id ? 'bg-blue-50 border-l-4 border-blue-500' : ''}`}
                                    onClick={() => setSelectedCandidate(cand.id)}
                                >
                                    <div className="flex justify-between">
                                        <div>
                                            <p className="font-semibold text-gray-900">{cand.fullName}</p>
                                            <p className="text-sm text-gray-500">{cand.reqTitle}</p>
                                        </div>
                                        <div className="text-right">
                                            <span className={`px-2 py-1 text-xs rounded-full ${cand.status === 'testing' ? 'bg-yellow-100 text-yellow-800' : cand.test?.status === 'completed' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                                                {cand.test?.status === 'completed' ? 'Тест пройден' : cand.status === 'testing' ? 'Ожидает тест' : cand.status}
                                            </span>
                                            {cand.test && cand.test.status === 'completed' && (
                                                <a href={`/dashboard/testing/${cand.test.id}`} className="block mt-2 text-xs text-blue-600 hover:underline">Смотреть отчет</a>
                                            )}
                                        </div>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                {/* Test Generation Config */}
                <div className="w-full md:w-1/2 space-y-6">
                    {selectedCandidate ? (
                        <div className="bg-white p-6 rounded-xl shadow-sm border">
                            <h2 className="text-lg font-medium text-gray-900 mb-4">Настройка тестирования</h2>

                            {candidates.find(c => c.id === selectedCandidate)?.test ? (
                                <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-800">
                                    <p className="font-medium flex items-center mb-2"><CheckCircle className="w-5 h-5 mr-2" /> Тест уже сгенерирован</p>
                                    <div className="flex items-center space-x-2 bg-white p-2 border rounded mt-2">
                                        <input
                                            type="text"
                                            readOnly
                                            value={`${window.location.origin}/ru/test/${candidates.find(c => c.id === selectedCandidate)?.test?.token}`}
                                            className="flex-1 text-sm bg-transparent outline-none"
                                        />
                                        <button onClick={() => {
                                            navigator.clipboard.writeText(`${window.location.origin}/ru/test/${candidates.find(c => c.id === selectedCandidate)?.test?.token}`);
                                            toast.success('Скопировано!');
                                        }} className="p-2 bg-gray-100 hover:bg-gray-200 rounded text-gray-600"><Copy className="w-4 h-4" /></button>
                                    </div>
                                    <p className="text-xs text-gray-500 mt-2">Статус: {candidates.find(c => c.id === selectedCandidate)?.test?.status}</p>
                                </div>
                            ) : (
                                <>
                                    <div className="mb-4">
                                        <p className="text-sm text-gray-600 mb-3">Тест содержит 3 фиксированных блока по 10 вопросов (~10 минут на блок):</p>
                                        <ul className="space-y-2">
                                            {['🧠 Блок 1: Психотип и личностный профиль', '📊 Блок 2: Логика и аналитическое мышление', '💼 Блок 3: Профессиональные знания по должности'].map((b, i) => (
                                                <li key={i} className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-100 rounded-lg">
                                                    <span className="text-sm font-medium text-blue-900">{b}</span>
                                                </li>
                                            ))}
                                        </ul>
                                        <p className="text-xs text-amber-600 mt-3 bg-amber-50 border border-amber-100 rounded-lg p-2">
                                            ⚠️ Ссылка одноразовая — кандидат может войти только один раз. После выхода потребуется новая ссылка.
                                        </p>
                                    </div>

                                    <button
                                        onClick={handleGenerateTest}
                                        disabled={generating}
                                        className="w-full flex justify-center items-center py-3 px-4 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-blue-300 transition"
                                    >
                                        {generating ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Plus className="w-5 h-5 mr-2" />}
                                        {generating ? 'Генерация вопросов AI...' : 'Создать тест и получить ссылку'}
                                    </button>

                                    {generatedLink && (
                                        <div className="mt-6 p-4 border border-green-200 bg-green-50 rounded-lg">
                                            <p className="text-sm text-green-800 font-medium mb-2">Тест успешно создан!</p>
                                            <div className="flex items-center space-x-2">
                                                <input type="text" readOnly value={generatedLink} className="flex-1 p-2 border rounded bg-white text-sm" />
                                                <button onClick={copyToClipboard} className="p-2 bg-blue-600 text-white rounded hover:bg-blue-700"><Copy className="w-5 h-5" /></button>
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    ) : (
                        <div className="bg-gray-50 border border-dashed rounded-xl h-64 flex items-center justify-center text-gray-500">
                            Выберите кандидата слева
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
