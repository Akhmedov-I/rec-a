"use client";

import { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import { useAuth } from '@/context/AuthContext';
import { db } from '@/lib/db';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { Building2, Save, Loader2, Settings as SettingsIcon } from 'lucide-react';

export default function SettingsPage() {
    const { profile, companyName: ctxCompanyName, setCompanyName: setCtxCompanyName, companyDescription: ctxCompanyDescription, setCompanyDescription: setCtxCompanyDescription } = useAuth();
    const [companyName, setCompanyName] = useState('');
    const [companyDescription, setCompanyDescription] = useState('');
    const [loading, setLoading] = useState(true);
    const [savingCompany, setSavingCompany] = useState(false);

    useEffect(() => {
        if (!profile) {
            setLoading(false);
            return;
        }

        if (profile.role !== 'admin' || !profile.companyId) {
            setLoading(false);
            return;
        }

        if (ctxCompanyName !== null || ctxCompanyDescription !== null) {
            setCompanyName(ctxCompanyName || '');
            setCompanyDescription(ctxCompanyDescription || '');
            setLoading(false);
        } else {
            const fetchCompany = async () => {
                try {
                    const docRef = doc(db, 'companies', profile.companyId!);
                    const snap = await getDoc(docRef);
                    if (snap.exists()) {
                        setCompanyName(snap.data().name || '');
                        setCompanyDescription(snap.data().description || '');
                        setCtxCompanyName(snap.data().name || null);
                        setCtxCompanyDescription(snap.data().description || null);
                    }
                } catch (error) {
                    console.error(error);
                } finally {
                    setLoading(false);
                }
            };
            fetchCompany();
        }
    }, [profile, ctxCompanyName, setCtxCompanyName]);

    const handleSaveCompany = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!profile?.companyId || profile.role !== 'admin') return;

        setSavingCompany(true);
        try {
            await updateDoc(doc(db, 'companies', profile.companyId), {
                name: companyName,
                description: companyDescription
            });
            setCtxCompanyName(companyName);
            setCtxCompanyDescription(companyDescription);
            toast.success('Настройки компании успешно сохранены!');
        } catch (error) {
            console.error(error);
            toast.error('Ошибка при сохранении.');
        } finally {
            setSavingCompany(false);
        }
    };

    if (loading) return <div className="flex justify-center items-center h-64"><Loader2 className="w-12 h-12 animate-spin text-blue-600" /></div>;

    if (profile?.role !== 'admin') {
        return <div className="p-8 text-center text-gray-500">У вас нет доступа к настройкам компании.</div>;
    }

    return (
        <div className="max-w-3xl mx-auto space-y-8 animate-fade-in-up">
            <div className="flex items-center gap-5 mb-10">
                <div className="p-4 bg-gradient-to-br from-blue-600 to-indigo-600 text-white rounded-3xl shadow-lg shadow-blue-500/30">
                    <SettingsIcon className="w-10 h-10" />
                </div>
                <div>
                    <h1 className="text-4xl font-black text-gray-900 tracking-tight">Настройки</h1>
                    <p className="text-gray-500 mt-2 text-lg font-medium">Управление компанией</p>
                </div>
            </div>

            <form onSubmit={handleSaveCompany} className="bg-white p-10 rounded-[2rem] shadow-xl shadow-gray-200/40 border border-gray-100 space-y-8 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-blue-500 to-cyan-500"></div>
                <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                    <Building2 className="w-6 h-6 text-blue-500" />
                    Настройки компании
                </h2>

                <div>
                    <label className="block text-sm font-bold text-gray-700 mb-3">Название компании</label>
                    <input
                        type="text"
                        required
                        value={companyName}
                        onChange={e => setCompanyName(e.target.value)}
                        className="w-full px-6 py-4 bg-gray-50 border border-gray-200 rounded-2xl focus:bg-white focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none text-gray-900 font-bold text-lg"
                    />
                </div>

                <div>
                    <label className="block text-sm font-bold text-gray-700 mb-3">Описание компании</label>
                    <textarea
                        value={companyDescription}
                        onChange={e => {
                            setCompanyDescription(e.target.value);
                            e.target.style.height = 'auto';
                            e.target.style.height = `${e.target.scrollHeight}px`;
                        }}
                        placeholder="Краткое описание компании, сфера деятельности, преимущества (будет использоваться ИИ при генерации заявок)"
                        className="w-full px-6 py-4 bg-gray-50 border border-gray-200 rounded-2xl focus:bg-white focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none text-gray-900 font-medium text-base overflow-hidden"
                        style={{
                            minHeight: '120px',
                            height: 'auto'
                        }}
                        ref={(el) => {
                            if (el) {
                                el.style.height = 'auto';
                                el.style.height = el.scrollHeight + 'px';
                            }
                        }}
                    />
                </div>

                <div className="pt-6 border-t border-gray-100 flex justify-end">
                    <button
                        type="submit"
                        disabled={savingCompany || !companyName.trim()}
                        className="flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-bold text-lg rounded-2xl hover:from-blue-700 hover:to-cyan-700 shadow-xl shadow-blue-500/30 transition-all disabled:opacity-70 disabled:cursor-not-allowed hover:-translate-y-1"
                    >
                        {savingCompany ? <Loader2 className="w-6 h-6 animate-spin" /> : <Save className="w-6 h-6" />}
                        Сохранить компанию
                    </button>
                </div>
            </form>
        </div>
    );
}
