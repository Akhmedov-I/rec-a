"use client";

import { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import { useAuth } from '@/context/AuthContext';
import { db } from '@/lib/db';
import { doc, updateDoc } from 'firebase/firestore';
import { Save, Loader2, User, Lock, Shield } from 'lucide-react';
import { updatePassword, updateProfile } from 'firebase/auth';

export default function ProfilePage() {
    const { profile, user } = useAuth();
    const [displayName, setDisplayName] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [savingProfile, setSavingProfile] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (profile) {
            setDisplayName(profile.displayName || user?.displayName || '');
            setLoading(false);
        }
    }, [profile, user]);

    const handleSaveProfile = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!profile || !user) return;

        setSavingProfile(true);
        try {
            await updateDoc(doc(db, 'users', user.uid), {
                displayName: displayName
            });

            await updateProfile(user, { displayName });

            if (newPassword && user.providerData.some(p => p.providerId === 'password')) {
                await updatePassword(user, newPassword);
                setNewPassword('');
                toast.success('Профиль и пароль успешно обновлены!');
            } else {
                toast.success('Профиль успешно обновлен!');
            }
        } catch (error: any) {
            console.error(error);
            if (error.code === 'auth/requires-recent-login') {
                toast.error('В целях безопасности, для изменения пароля необходимо выйти и войти снова.');
            } else {
                toast.error('Ошибка при обновлении профиля.');
            }
        } finally {
            setSavingProfile(false);
        }
    };

    if (loading) return <div className="flex justify-center items-center h-64"><Loader2 className="w-12 h-12 animate-spin text-blue-600" /></div>;

    const isEmailUser = user?.providerData.some(p => p.providerId === 'password');

    return (
        <div className="max-w-3xl mx-auto space-y-8 animate-fade-in-up">
            <div className="flex items-center gap-5 mb-10">
                <div className="p-4 bg-gradient-to-br from-indigo-600 to-purple-600 text-white rounded-3xl shadow-lg shadow-indigo-500/30">
                    <User className="w-10 h-10" />
                </div>
                <div>
                    <h1 className="text-4xl font-black text-gray-900 tracking-tight">Мой профиль</h1>
                    <p className="text-gray-500 mt-2 text-lg font-medium">Управление личными данными</p>
                </div>
            </div>

            <form onSubmit={handleSaveProfile} className="bg-white p-10 rounded-[2rem] shadow-xl shadow-gray-200/40 border border-gray-100 space-y-8 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-indigo-500 to-purple-500"></div>
                <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                    <User className="w-6 h-6 text-indigo-500" />
                    Личный профиль
                </h2>

                <div className="space-y-5">
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-3">Ваша роль в системе</label>
                        <div className="w-full px-6 py-4 bg-gray-100/80 border border-gray-200 rounded-2xl text-indigo-600 font-black text-lg capitalize cursor-not-allowed shadow-inner flex items-center gap-3">
                            <Shield className="w-5 h-5 text-indigo-400" />
                            {profile?.role?.replace('_', ' ')}
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-3">Ваше имя (Отображаемое)</label>
                        <input
                            type="text"
                            required
                            value={displayName}
                            onChange={e => setDisplayName(e.target.value)}
                            className="w-full px-6 py-4 bg-gray-50 border border-gray-200 rounded-2xl focus:bg-white focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none text-gray-900 font-bold text-lg"
                        />
                    </div>

                    {isEmailUser && (
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
                                <Lock className="w-4 h-4" />
                                Новый пароль (оставьте пустым, если не хотите менять)
                            </label>
                            <input
                                type="password"
                                value={newPassword}
                                onChange={e => setNewPassword(e.target.value)}
                                minLength={6}
                                className="w-full px-6 py-4 bg-gray-50 border border-gray-200 rounded-2xl focus:bg-white focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none text-gray-900 font-bold text-lg"
                                placeholder="••••••••"
                            />
                        </div>
                    )}
                </div>

                <div className="pt-6 border-t border-gray-100 flex justify-end">
                    <button
                        type="submit"
                        disabled={savingProfile || !displayName.trim()}
                        className="flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold text-lg rounded-2xl hover:from-indigo-700 hover:to-purple-700 shadow-xl shadow-indigo-500/30 transition-all disabled:opacity-70 disabled:cursor-not-allowed hover:-translate-y-1"
                    >
                        {savingProfile ? <Loader2 className="w-6 h-6 animate-spin" /> : <Save className="w-6 h-6" />}
                        Сохранить профиль
                    </button>
                </div>
            </form>
        </div>
    );
}
