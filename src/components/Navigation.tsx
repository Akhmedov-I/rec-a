"use client";

import { useAuth } from '@/context/AuthContext';
import { Link, useRouter, usePathname } from '@/i18n/routing';
import LocaleSwitcher from './LocaleSwitcher';
import { auth } from '@/lib/firebase';
import { signOut } from 'firebase/auth';
import { LogOut, User, LayoutDashboard, Briefcase, Building2 } from 'lucide-react';

export default function Navigation() {
    const { user, profile, companyName } = useAuth();
    const router = useRouter();
    const pathname = usePathname();

    const handleLogout = async () => {
        await signOut(auth);
        router.push('/');
    };

    // Hide navigation entirely on candidate test pages
    if (pathname.startsWith('/test/')) return null;

    return (
        <nav className="bg-white/80 backdrop-blur-md sticky top-0 z-50 border-b border-gray-100 shadow-sm print:hidden">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex justify-between items-center h-16 gap-4">
                    <div className="flex items-center flex-shrink-0">
                        <Link href="/" className="flex items-center gap-2 text-2xl font-black bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                            <Briefcase className="w-8 h-8 text-blue-600" />
                            Rec-A
                        </Link>
                    </div>

                    {companyName && (
                        <div className="hidden md:flex flex-1 justify-center min-w-0 px-2">
                            <span className="text-base font-bold text-gray-800 tracking-tight bg-gray-50 px-5 py-1.5 rounded-full border border-gray-200 shadow-sm flex items-center gap-2 max-w-full">
                                <Building2 className="w-4 h-4 text-blue-600 flex-shrink-0" />
                                <span className="truncate">{companyName}</span>
                            </span>
                        </div>
                    )}

                    <div className="flex items-center gap-4 md:gap-6 flex-shrink-0">
                        <LocaleSwitcher />
                        {user ? (
                            <div className="flex items-center gap-4">
                                <div className="hidden md:flex flex-col items-end">
                                    <span className="text-sm font-semibold text-gray-900">{profile?.displayName || profile?.email}</span>
                                    <span className="text-xs font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full capitalize">
                                        {profile?.role?.replace('_', ' ')}
                                    </span>
                                </div>
                                <Link href="/dashboard" className="flex items-center gap-2 px-6 py-2.5 text-sm font-bold text-white bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 rounded-xl shadow-md shadow-indigo-500/20 transition-all hover:-translate-y-0.5">
                                    <LayoutDashboard className="w-4 h-4" />
                                    <span className="hidden md:inline">Аналитика</span>
                                </Link>
                                <Link href="/dashboard/profile" className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-50 hover:bg-gray-100 rounded-lg transition-all">
                                    <User className="w-4 h-4" />
                                    <span className="hidden md:inline">Профиль</span>
                                </Link>
                                <button
                                    onClick={handleLogout}
                                    className="flex items-center gap-2 p-2 text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                    title="Выйти"
                                >
                                    <LogOut className="w-5 h-5" />
                                </button>
                            </div>
                        ) : (
                            <div className="flex items-center gap-4">
                                {pathname !== '/auth/login' && (
                                    <Link href="/auth/login" className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 rounded-lg shadow-md shadow-blue-500/20 transition-all">
                                        <User className="w-4 h-4" />
                                        Войти
                                    </Link>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </nav>
    );
}

