"use client";

import { useState, useEffect, Suspense } from 'react';
import { signInWithEmailAndPassword, signInWithPopup, GoogleAuthProvider, isSignInWithEmailLink, signInWithEmailLink } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { useRouter } from '@/i18n/routing';
import { useSearchParams } from 'next/navigation';
import { db } from '@/lib/db';
import { doc, getDoc, setDoc, Timestamp, collection, query, where, getDocs, deleteDoc } from 'firebase/firestore';
import { Mail, Lock, Chrome, Building2, UserCircle, Sparkles, Loader2, Users, Target, BarChart3, Settings, Database, Zap, MessageSquare, LayoutDashboard, Brain, FileText, Workflow, PieChart, CheckCircle2 } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

function LoginForm() {
    const searchParams = useSearchParams();
    const inviteParam = searchParams.get('invite');
    const emailParam = searchParams.get('email');
    const [emailLinkStatus, setEmailLinkStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
    const [emailLinkError, setEmailLinkError] = useState('');

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const router = useRouter();

    // Handle Firebase email magic link (from invite)
    useEffect(() => {
        if (typeof window === 'undefined') return;
        if (isSignInWithEmailLink(auth, window.location.href)) {
            setEmailLinkStatus('loading');
            const emailForSignIn = emailParam || window.localStorage.getItem('emailForSignIn') || '';
            if (!emailForSignIn) {
                setEmailLinkError('Не удалось определить email. Пожалуйста, войдите через Google или перепроверьте ссылку.');
                setEmailLinkStatus('error');
                return;
            }
            signInWithEmailLink(auth, emailForSignIn, window.location.href)
                .then(async (result) => {
                    window.localStorage.removeItem('emailForSignIn');
                    const userRef = doc(db, 'users', result.user.uid);
                    const userSnap = await getDoc(userRef);
                    if (!userSnap.exists()) {
                        // Check for invite
                        const invitesRef = collection(db, 'invites');
                        const q = query(invitesRef, where('email', '==', emailForSignIn.toLowerCase()));
                        const inviteSnap = await getDocs(q);
                        let assignedRole = 'recruiter';
                        let assignedCompany = `company_${uuidv4().slice(0, 8)}`;
                        if (!inviteSnap.empty) {
                            const inviteData = inviteSnap.docs[0].data();
                            assignedRole = inviteData.role;
                            assignedCompany = inviteData.companyId;
                            await deleteDoc(inviteSnap.docs[0].ref);
                        }
                        await setDoc(userRef, {
                            uid: result.user.uid,
                            email: emailForSignIn.toLowerCase(),
                            displayName: emailForSignIn.split('@')[0],
                            role: assignedRole,
                            companyId: assignedCompany,
                            createdAt: Timestamp.now(),
                        });
                    }
                    setEmailLinkStatus('done');
                    window.location.href = '/ru/dashboard';
                })
                .catch((err) => {
                    console.error(err);
                    setEmailLinkError('Ошибка авторизации. Попробуйте открыть ссылку ещё раз.');
                    setEmailLinkStatus('error');
                });
        }
    }, []);

    // If already logged in — redirect to dashboard
    useEffect(() => {
        const unsub = onAuthStateChanged(auth, (u) => {
            if (u && emailLinkStatus !== 'loading') router.replace('/dashboard');
        });
        return () => unsub();
    }, [emailLinkStatus]);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            const result = await signInWithEmailAndPassword(auth, email, password);

            // On first login (invited user), create Firestore profile from invite
            const userRef = doc(db, 'users', result.user.uid);
            const userSnap = await getDoc(userRef);

            if (!userSnap.exists()) {
                const userEmail = email.toLowerCase();
                const invitesRef = collection(db, 'invites');
                const q = query(invitesRef, where('email', '==', userEmail));
                const inviteSnap = await getDocs(q);

                let assignedRole = 'recruiter';
                let assignedCompany = `company_${uuidv4().slice(0, 8)}`;

                if (!inviteSnap.empty) {
                    const inviteData = inviteSnap.docs[0].data();
                    assignedRole = inviteData.role;
                    assignedCompany = inviteData.companyId;
                    await deleteDoc(inviteSnap.docs[0].ref);
                }

                await setDoc(userRef, {
                    uid: result.user.uid,
                    email: userEmail,
                    displayName: userEmail.split('@')[0],
                    role: assignedRole,
                    companyId: assignedCompany,
                    createdAt: Timestamp.now(),
                });
            }

            window.location.href = '/ru/dashboard';
        } catch (err: any) {
            setError('Ошибка авторизации. Проверьте email и пароль.');
            setLoading(false);
        }
    };

    const handleGoogleLogin = async () => {
        setError('');
        setLoading(true);
        try {
            const provider = new GoogleAuthProvider();
            const result = await signInWithPopup(auth, provider);

            const userRef = doc(db, 'users', result.user.uid);
            const userSnap = await getDoc(userRef);

            if (!userSnap.exists()) {
                const userEmail = result.user.email?.toLowerCase() || '';

                // Проверяем инвайты
                const invitesRef = collection(db, 'invites');
                const q = query(invitesRef, where('email', '==', userEmail));
                const inviteSnap = await getDocs(q);

                let assignedRole = 'admin';
                let assignedCompany: string | null = `company_${uuidv4().slice(0, 8)}`;

                // Если есть инвайт, приоритет отдается ему
                if (!inviteSnap.empty) {
                    const inviteData = inviteSnap.docs[0].data();
                    assignedRole = inviteData.role;
                    assignedCompany = inviteData.companyId;
                    await deleteDoc(inviteSnap.docs[0].ref);
                }

                await setDoc(userRef, {
                    uid: result.user.uid,
                    email: userEmail,
                    displayName: result.user.displayName || userEmail.split('@')[0],
                    role: assignedRole,
                    companyId: assignedCompany,
                    createdAt: Timestamp.now()
                });

                if (assignedRole === 'admin' && assignedCompany) {
                    const companyRef = doc(db, 'companies', assignedCompany);
                    await setDoc(companyRef, {
                        id: assignedCompany,
                        name: `Компания ${result.user.displayName || 'Новая'}`,
                        createdAt: Timestamp.now()
                    });
                }
            }

            window.location.href = '/ru/dashboard';
        } catch (err: any) {
            if (err?.code === 'auth/popup-closed-by-user') {
                // User closed the popup — not an error, do nothing
            } else {
                console.error(err);
                setError('Ошибка авторизации через Google. Попробуйте ещё раз.');
            }
            setLoading(false);
        }
    };

    // Show magic link loading/success/error state
    if (emailLinkStatus === 'loading' || emailLinkStatus === 'done') {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-indigo-50/50 to-white">
                <div className="text-center">
                    <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-xl">
                        <Loader2 className="w-8 h-8 text-white animate-spin" />
                    </div>
                    <h2 className="text-xl font-bold text-gray-900">Вход в систему...</h2>
                    <p className="text-gray-500 mt-2">Подтверждаем приглашение и настраиваем аккаунт</p>
                </div>
            </div>
        );
    }
    if (emailLinkStatus === 'error') {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-indigo-50/50 to-white">
                <div className="text-center max-w-sm">
                    <div className="w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                        <Mail className="w-8 h-8 text-red-500" />
                    </div>
                    <h2 className="text-xl font-bold text-gray-900">Ошибка</h2>
                    <p className="text-gray-500 mt-2">{emailLinkError}</p>
                    <a href="/ru/auth/login" className="mt-4 inline-block text-blue-600 font-semibold hover:underline">На страницу входа</a>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-4 relative overflow-hidden bg-gradient-to-br from-blue-50 via-indigo-50/50 to-white">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1000px] h-[1000px] bg-blue-400/10 rounded-full blur-3xl -z-10 animate-pulse" style={{ animationDuration: '6s' }}></div>
            <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-indigo-400/10 rounded-full blur-3xl -z-10"></div>
            <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-purple-400/10 rounded-full blur-3xl -z-10"></div>

            <div className="container mx-auto flex items-center justify-center relative z-10 max-w-[1400px]">

                {/* Center Auth Form */}
                <div className="w-full max-w-md bg-white/95 backdrop-blur-xl p-8 sm:p-10 rounded-[2rem] shadow-2xl border border-white/80 relative z-10 animate-fade-in-up flex flex-col justify-center shrink-0 order-1 lg:order-2">
                    <div className="text-center mb-8">
                        <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-xl shadow-blue-500/30 transform transition hover:scale-105">
                            <Sparkles className="w-8 h-8 text-white" />
                        </div>
                        <h2 className="text-3xl font-black text-gray-900 tracking-tight">Rec-A</h2>
                        <p className="text-gray-500 mt-2 font-medium">Войдите в систему</p>
                    </div>

                    <form className="space-y-6" onSubmit={handleLogin}>
                        {error && (
                            <div className="bg-red-50 text-red-600 p-4 rounded-2xl text-sm font-semibold border border-red-100 flex items-center gap-3">
                                <span className="w-2 h-2 bg-red-600 rounded-full animate-pulse flex-shrink-0"></span>
                                {error}
                            </div>
                        )}

                        <div className="space-y-4">
                            <div>
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
                            </div>
                            <div>
                                <div className="relative group">
                                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 group-focus-within:text-blue-600 transition-colors" />
                                    <input
                                        type="password"
                                        required
                                        className="w-full pl-12 pr-4 py-3.5 bg-gray-50 border border-gray-200 rounded-2xl focus:bg-white focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none text-gray-900 font-semibold"
                                        placeholder="Пароль"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                    />
                                </div>
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full flex justify-center items-center py-3.5 px-4 border border-transparent text-lg font-bold rounded-2xl text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 focus:outline-none focus:ring-4 focus:ring-blue-500/50 shadow-xl shadow-blue-500/30 transition-all disabled:opacity-70 disabled:cursor-not-allowed hover:-translate-y-0.5"
                        >
                            {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : 'Войти по Email'}
                        </button>

                        <div className="relative py-2">
                            <div className="absolute inset-0 flex items-center">
                                <div className="w-full border-t border-gray-200" />
                            </div>
                            <div className="relative flex justify-center text-sm">
                                <span className="px-4 bg-white text-gray-400 font-bold tracking-widest uppercase text-xs">Или</span>
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={handleGoogleLogin}
                            disabled={loading}
                            className="w-full flex justify-center items-center py-3.5 px-4 bg-white border-2 border-gray-200 rounded-2xl text-base font-bold text-gray-800 hover:bg-gray-50 hover:border-gray-300 focus:outline-none focus:ring-4 focus:ring-gray-100 transition-all disabled:opacity-70 shadow-sm hover:-translate-y-0.5"
                        >
                            <Chrome className="w-6 h-6 mr-3 text-blue-500" />
                            Продолжить с Google
                        </button>

                        <p className="text-center text-sm text-gray-500 font-medium">
                            Нет аккаунта?{' '}
                            <a href="register" className="text-blue-600 font-bold hover:underline">
                                Зарегистрироваться
                            </a>
                        </p>
                    </form>
                </div>

            </div>
        </div>
    );
}

export default function LoginPage() {
    return (
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>}>
            <LoginForm />
        </Suspense>
    );
}
