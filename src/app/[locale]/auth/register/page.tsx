"use client";

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { createUserWithEmailAndPassword, signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { db } from '@/lib/db';
import { doc, setDoc, Timestamp, collection, query, where, getDocs, deleteDoc, getDoc } from 'firebase/firestore';
import {
    Mail, Lock, Chrome, Building2, UserCircle, Sparkles, Loader2,
    Eye, EyeOff, CheckCircle2, Users, Brain, FileText, Workflow, PieChart,
    Database, Zap, LayoutDashboard, MessageSquare, BarChart3
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

function RegisterForm() {
    const searchParams = useSearchParams();
    const inviteId = searchParams.get('invite');
    const isInvited = !!inviteId;

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [companyName, setCompanyName] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);

    const createUserInFirestore = async (uid: string, userEmail: string, displayName: string, type: 'company' | 'private', cName?: string) => {
        const invitesRef = collection(db, 'invites');
        const q = query(invitesRef, where('email', '==', userEmail.toLowerCase()));
        const inviteSnap = await getDocs(q);

        let assignedRole = 'admin';
        let assignedCompany: string | null = `company_${uuidv4().slice(0, 8)}`;

        if (!inviteSnap.empty) {
            const inviteData = inviteSnap.docs[0].data();
            assignedRole = inviteData.role;
            assignedCompany = inviteData.companyId;
            await deleteDoc(inviteSnap.docs[0].ref);
        }

        await setDoc(doc(db, 'users', uid), {
            uid,
            email: userEmail.toLowerCase(),
            displayName,
            role: assignedRole,
            companyId: assignedCompany,
            createdAt: Timestamp.now(),
        });

        if (assignedRole === 'admin' && assignedCompany) {
            await setDoc(doc(db, 'companies', assignedCompany), {
                id: assignedCompany,
                name: cName || `Компания ${displayName}`,
                createdAt: Timestamp.now(),
            });
        }
    };

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (password !== confirmPassword) {
            setError('Пароли не совпадают.');
            return;
        }
        if (password.length < 6) {
            setError('Пароль должен содержать минимум 6 символов.');
            return;
        }
        if (!isInvited && !companyName.trim()) {
            setError('Введите название компании.');
            return;
        }

        setLoading(true);
        try {
            const { user } = await createUserWithEmailAndPassword(auth, email, password);
            await createUserInFirestore(
                user.uid,
                user.email!,
                user.email!.split('@')[0],
                'company',
                companyName.trim() || undefined
            );
            window.location.href = '/ru/dashboard';
        } catch (err: any) {
            const code = err?.code || '';
            if (code === 'auth/email-already-in-use') {
                setError('Этот email уже зарегистрирован. Войдите в систему.');
            } else if (code === 'auth/weak-password') {
                setError('Слишком слабый пароль. Минимум 6 символов.');
            } else {
                setError(err.message || 'Ошибка регистрации. Попробуйте ещё раз.');
            }
            setLoading(false);
        }
    };

    const handleGoogleRegister = async () => {
        setError('');
        setLoading(true);
        try {
            const provider = new GoogleAuthProvider();
            const result = await signInWithPopup(auth, provider);

            const userRef = doc(db, 'users', result.user.uid);
            const userSnap = await getDoc(userRef);

            if (!userSnap.exists()) {
                await createUserInFirestore(
                    result.user.uid,
                    result.user.email!,
                    result.user.displayName || result.user.email!.split('@')[0],
                    'company',
                    companyName.trim() || `Компания ${result.user.displayName || 'Новая'}`
                );
            }

            window.location.href = '/ru/dashboard';
        } catch (err: any) {
            console.error(err);
            setError(err.message || 'Ошибка регистрации через Google');
            setLoading(false);
        }
    };

    return (
        <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-4 relative overflow-hidden bg-gradient-to-br from-blue-50 via-indigo-50/50 to-white">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1000px] h-[1000px] bg-blue-400/10 rounded-full blur-3xl -z-10 animate-pulse" style={{ animationDuration: '6s' }}></div>
            <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-indigo-400/10 rounded-full blur-3xl -z-10"></div>
            <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-purple-400/10 rounded-full blur-3xl -z-10"></div>

            <div className="container mx-auto flex flex-col lg:flex-row items-stretch justify-center gap-6 lg:gap-8 relative z-10 max-w-[1400px]">

                {/* Left Side - Private Recruiter features */}
                <div className="hidden lg:flex flex-1 max-w-[380px] flex-col justify-center animate-fade-in-up order-2 lg:order-1" style={{ animationDelay: '0.1s' }}>
                    <div className="bg-white/60 backdrop-blur-xl p-8 rounded-[2rem] shadow-xl border border-white/80 h-full flex flex-col justify-center transform transition-all duration-500 hover:shadow-2xl hover:bg-white/80 hover:-translate-y-1">
                        <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl flex items-center justify-center mb-6 shadow-lg shadow-blue-500/20">
                            <UserCircle className="w-7 h-7 text-white" />
                        </div>
                        <h3 className="text-2xl font-black text-gray-900 mb-3 tracking-tight">Частный рекрутер</h3>
                        <p className="text-gray-600 leading-relaxed mb-6 font-medium text-sm">Мощная ATS для индивидуальной работы. Автоматизируйте рутину и закрывайте вакансии быстрее.</p>
                        <ul className="space-y-3.5">
                            {[
                                { icon: Database, label: 'Умная база кандидатов', desc: 'Единое хранилище с мгновенным поиском' },
                                { icon: Zap, label: 'Автоматизация рутины', desc: 'Парсинг резюме и автозаполнение карточек' },
                                { icon: LayoutDashboard, label: 'Визуальная воронка', desc: 'Интерактивная канбан-доска для кандидатов' },
                                { icon: MessageSquare, label: 'Шаблоны писем', desc: 'Быстрая отправка фидбеков и офферов в 1 клик' },
                                { icon: BarChart3, label: 'Аналитика эффективности', desc: 'Детальная статистика конверсии и времени найма' },
                            ].map(({ icon: Icon, label, desc }) => (
                                <li key={label} className="flex items-start group">
                                    <div className="bg-blue-100 p-2 rounded-lg mr-4 mt-0.5 group-hover:bg-blue-600 transition-colors duration-300">
                                        <Icon className="w-4 h-4 text-blue-600 group-hover:text-white transition-colors duration-300" />
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-gray-900 text-sm">{label}</h4>
                                        <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>

                {/* Center - Registration Form */}
                <div className="w-full max-w-md bg-white/95 backdrop-blur-xl p-8 sm:p-10 rounded-[2rem] shadow-2xl border border-white/80 relative z-10 animate-fade-in-up flex flex-col justify-center shrink-0 order-1 lg:order-2">
                    <div className="text-center mb-8">
                        <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-xl shadow-blue-500/30 transform transition hover:scale-105">
                            <Sparkles className="w-8 h-8 text-white" />
                        </div>
                        <h2 className="text-3xl font-black text-gray-900 tracking-tight">Rec-A</h2>
                        <p className="text-gray-500 mt-2 font-medium">
                            {isInvited ? 'Вас пригласили в систему' : 'Создайте аккаунт'}
                        </p>
                        {isInvited && (
                            <div className="mt-3 px-4 py-2 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700 font-medium">
                                ✅ Ваша роль уже назначена. Просто зарегистрируйтесь.
                            </div>
                        )}
                    </div>

                    <form className="space-y-4" onSubmit={handleRegister}>
                        {error && (
                            <div className="bg-red-50 text-red-600 p-4 rounded-2xl text-sm font-semibold border border-red-100 flex items-center gap-3">
                                <span className="w-2 h-2 bg-red-600 rounded-full animate-pulse flex-shrink-0"></span>
                                {error}
                            </div>
                        )}

                        {!isInvited && (
                            <div className="relative group">
                                <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 group-focus-within:text-indigo-600 transition-colors" />
                                <input
                                    type="text"
                                    required
                                    className="w-full pl-12 pr-4 py-3.5 bg-gray-50 border border-gray-200 rounded-2xl focus:bg-white focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none text-gray-900 font-semibold"
                                    placeholder="Название компании"
                                    value={companyName}
                                    onChange={(e) => setCompanyName(e.target.value)}
                                />
                            </div>
                        )}

                        <div className="relative group">
                            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 group-focus-within:text-blue-600 transition-colors" />
                            <input
                                type="email"
                                required
                                className="w-full pl-12 pr-4 py-3.5 bg-gray-50 border border-gray-200 rounded-2xl focus:bg-white focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none text-gray-900 font-semibold"
                                placeholder="Email адрес"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                            />
                        </div>

                        <div className="relative group">
                            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 group-focus-within:text-blue-600 transition-colors" />
                            <input
                                type={showPassword ? 'text' : 'password'}
                                required
                                className="w-full pl-12 pr-12 py-3.5 bg-gray-50 border border-gray-200 rounded-2xl focus:bg-white focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none text-gray-900 font-semibold"
                                placeholder="Пароль (мин. 6 символов)"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                            />
                            <button type="button" onClick={() => setShowPassword(p => !p)} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                            </button>
                        </div>

                        <div className="relative group">
                            <CheckCircle2 className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 group-focus-within:text-blue-600 transition-colors" />
                            <input
                                type={showConfirmPassword ? 'text' : 'password'}
                                required
                                className="w-full pl-12 pr-12 py-3.5 bg-gray-50 border border-gray-200 rounded-2xl focus:bg-white focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none text-gray-900 font-semibold"
                                placeholder="Подтвердите пароль"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                            />
                            <button type="button" onClick={() => setShowConfirmPassword(p => !p)} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                                {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                            </button>
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full flex justify-center items-center py-3.5 px-4 border border-transparent text-lg font-bold rounded-2xl text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 focus:outline-none focus:ring-4 focus:ring-blue-500/50 shadow-xl shadow-blue-500/30 transition-all disabled:opacity-70 disabled:cursor-not-allowed hover:-translate-y-0.5"
                        >
                            {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : 'Создать аккаунт'}
                        </button>

                        <div className="relative py-1">
                            <div className="absolute inset-0 flex items-center">
                                <div className="w-full border-t border-gray-200" />
                            </div>
                            <div className="relative flex justify-center text-sm">
                                <span className="px-4 bg-white text-gray-400 font-bold tracking-widest uppercase text-xs">Или</span>
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={handleGoogleRegister}
                            disabled={loading}
                            className="w-full flex justify-center items-center py-3.5 px-4 bg-white border-2 border-gray-200 rounded-2xl text-base font-bold text-gray-800 hover:bg-gray-50 hover:border-gray-300 focus:outline-none focus:ring-4 focus:ring-gray-100 transition-all disabled:opacity-70 shadow-sm hover:-translate-y-0.5"
                        >
                            <Chrome className="w-6 h-6 mr-3 text-blue-500" />
                            Зарегистрироваться через Google
                        </button>

                        <p className="text-center text-sm text-gray-500 font-medium">
                            Уже есть аккаунт?{' '}
                            <a href="login" className="text-blue-600 font-bold hover:underline">
                                Войти
                            </a>
                        </p>
                    </form>
                </div>

                {/* Right side - Company features */}
                <div className="hidden lg:flex flex-1 max-w-[380px] flex-col justify-center animate-fade-in-up order-3" style={{ animationDelay: '0.2s' }}>
                    <div className="bg-white/60 backdrop-blur-xl p-8 rounded-[2rem] shadow-xl border border-white/80 h-full flex flex-col justify-center transform transition-all duration-500 hover:shadow-2xl hover:bg-white/80 hover:-translate-y-1">
                        <div className="w-14 h-14 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center mb-6 shadow-lg shadow-indigo-500/20">
                            <Building2 className="w-7 h-7 text-white" />
                        </div>
                        <h3 className="text-2xl font-black text-gray-900 mb-3 tracking-tight">Корпоративный</h3>
                        <p className="text-gray-600 leading-relaxed mb-6 font-medium text-sm">Комплексное решение для команд. Управление заявками, ролями и продвинутая аналитика.</p>
                        <ul className="space-y-3.5">
                            {[
                                { icon: Users, label: 'Командная работа', desc: 'Совместный доступ, роли и обсуждения', color: 'indigo' },
                                { icon: Brain, label: 'AI Скрининг', desc: 'Умный скоринг и авто-ранжирование откликов', color: 'indigo' },
                                { icon: FileText, label: 'Управление заявками', desc: 'Маршруты согласования и SLA нанимающих', color: 'indigo' },
                                { icon: Workflow, label: 'Кастомные процессы', desc: 'Индивидуальные воронки под каждую вакансию', color: 'indigo' },
                                { icon: PieChart, label: 'Продвинутые отчеты', desc: 'Метрики команды, воронка и ROI источников', color: 'indigo' },
                            ].map(({ icon: Icon, label, desc }) => (
                                <li key={label} className="flex items-start group">
                                    <div className="bg-indigo-100 p-2 rounded-lg mr-4 mt-0.5 group-hover:bg-indigo-600 transition-colors duration-300">
                                        <Icon className="w-4 h-4 text-indigo-600 group-hover:text-white transition-colors duration-300" />
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-gray-900 text-sm">{label}</h4>
                                        <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function RegisterPage() {
    return (
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>}>
            <RegisterForm />
        </Suspense>
    );
}
