"use client";

import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Link, usePathname } from '@/i18n/routing';
import ProtectedRoute from '@/components/ProtectedRoute';
import CandidateSearchModal from '@/components/CandidateSearchModal';
import {
    Loader2,
    LayoutDashboard,
    Users,
    FileText,
    Briefcase,
    Settings,
    UserPlus,
    CheckSquare,
    Database,
    Calendar,
    Menu,
    Search,
    X
} from 'lucide-react';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    const { profile } = useAuth();
    const pathname = usePathname();
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [searchOpen, setSearchOpen] = useState(false);

    if (!profile) return (
        <div className="flex h-screen items-center justify-center bg-gray-50/50">
            <Loader2 className="w-10 h-10 animate-spin text-blue-600" />
        </div>
    );

    const role = profile.role;
    const canCreateReq = ['admin', 'hrd', 'manager', 'requester', 'recruiter', 'private_recruiter'].includes(role);

    const navItems: { name: string; href: string; icon: React.ElementType; shortName: string }[] = [];
    const addItem = (name: string, href: string, icon: React.ElementType, shortName: string) =>
        navItems.push({ name, href, icon, shortName });

    if (['admin', 'hrd', 'manager', 'recruiter', 'private_recruiter'].includes(role)) {
        addItem('Расписание интервью', '/dashboard/schedule', Calendar, 'Расписание');
    }
    addItem('Аналитика', '/dashboard', LayoutDashboard, 'Аналитика');
    if (['admin', 'hrd', 'manager', 'requester', 'recruiter', 'private_recruiter'].includes(role)) {
        addItem(
            role === 'recruiter' ? 'Мои Заявки' : 'Заявки на подбор',
            '/dashboard/requisitions',
            FileText,
            'Заявки'
        );
    }
    if (['admin', 'hrd', 'recruiter', 'private_recruiter'].includes(role)) {
        addItem('Воронка (Pipeline)', '/dashboard/pipeline', UserPlus, 'Воронка');
    }
    if (['admin', 'hrd', 'recruiter', 'private_recruiter'].includes(role)) {
        addItem('База кандидатов', '/dashboard/candidates', Database, 'База');
    }
    if (role === 'admin') {
        addItem('Настройки Компании', '/dashboard/settings', Settings, 'Настройки');
    }
    if (role === 'admin') {
        addItem('Пользователи', '/dashboard/users', Users, 'Юзеры');
    }

    // First 4 items for mobile bottom bar
    const mobileBottomItems = navItems.slice(0, 4);

    return (
        <ProtectedRoute>
            <div className="flex h-[calc(100vh-4rem)] bg-gray-50/50 print:h-auto print:bg-white print:block">

                {/* ── Sidebar (desktop ≥ md) ── */}
                <div className="w-64 lg:w-72 bg-white border-r border-gray-100 shadow-sm hidden md:flex flex-col print:hidden flex-shrink-0">
                    <nav className="flex-1 px-3 lg:px-4 py-6 space-y-1.5 overflow-y-auto">
                        {/* Search button */}
                        <button
                            onClick={() => setSearchOpen(true)}
                            className="w-full flex items-center gap-3 px-4 py-2.5 mb-2 rounded-xl bg-gray-50 hover:bg-blue-50 border border-gray-200 hover:border-blue-200 text-gray-500 hover:text-blue-600 transition-all text-sm font-semibold"
                        >
                            <Search className="w-4 h-4 shrink-0" />
                            Поиск кандидата
                            <span className="ml-auto text-[10px] bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded font-mono">Ctrl K</span>
                        </button>
                        {canCreateReq && (
                            <Link
                                href="/dashboard/requisitions/create"
                                className="flex items-center px-4 py-3 mb-3 text-sm lg:text-base font-bold rounded-xl transition-all bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md hover:from-blue-700 hover:to-indigo-700 hover:shadow-lg active:scale-[0.98]"
                            >
                                <CheckSquare className="mr-3 h-5 w-5 text-white flex-shrink-0" />
                                Создать заявку
                            </Link>
                        )}
                        {navItems.map((item) => {
                            const isActive = item.href === '/dashboard'
                                ? pathname === '/dashboard'
                                : pathname === item.href || pathname.startsWith(item.href + '/');
                            return (
                                <Link
                                    key={item.name}
                                    href={item.href}
                                    className={`flex items-center px-4 py-3 text-sm lg:text-base font-semibold rounded-xl transition-all ${isActive
                                        ? 'bg-blue-50 text-blue-700 shadow-sm border border-blue-100/50'
                                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                                        }`}
                                >
                                    <item.icon className={`mr-3 h-5 w-5 flex-shrink-0 ${isActive ? 'text-blue-600' : 'text-gray-400'}`} />
                                    <span className="truncate">{item.name}</span>
                                </Link>
                            );
                        })}
                    </nav>

                    <div className="p-4 border-t border-gray-100 bg-gray-50/50">
                        <Link href="/dashboard/profile" className="flex items-center gap-3 hover:bg-gray-100 p-2.5 rounded-2xl transition-all cursor-pointer border border-transparent hover:border-gray-200">
                            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center text-white font-bold text-base shadow-md flex-shrink-0">
                                {(profile.displayName || profile.email).charAt(0).toUpperCase()}
                            </div>
                            <div className="overflow-hidden">
                                <div className="text-sm font-bold text-gray-900 truncate">{profile.displayName || profile.email}</div>
                                <div className="text-xs font-medium text-blue-600 capitalize mt-0.5 truncate bg-blue-50 px-2 py-0.5 rounded-md inline-block">
                                    {profile.role.replace('_', ' ')}
                                </div>
                            </div>
                        </Link>
                    </div>
                </div>

            {/* Global search modal */}
            {searchOpen && <CandidateSearchModal onClose={() => setSearchOpen(false)} />}

                {/* ── Mobile: Overlay slide-in menu ── */}
                {mobileMenuOpen && (
                    <div className="md:hidden fixed inset-0 z-50 flex">
                        {/* Backdrop */}
                        <div className="absolute inset-0 bg-black/40" onClick={() => setMobileMenuOpen(false)} />
                        {/* Drawer */}
                        <div className="relative w-72 max-w-[85vw] bg-white h-full shadow-2xl flex flex-col z-10">
                            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                                <span className="font-bold text-gray-900">Меню</span>
                                <button onClick={() => setMobileMenuOpen(false)} className="p-1.5 rounded-lg hover:bg-gray-100">
                                    <X className="w-5 h-5 text-gray-600" />
                                </button>
                            </div>
                            <nav className="flex-1 px-4 py-4 space-y-1.5 overflow-y-auto">
                                {canCreateReq && (
                                    <Link href="/dashboard/requisitions/create" onClick={() => setMobileMenuOpen(false)}
                                        className="flex items-center px-4 py-3 mb-3 text-sm font-bold rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md">
                                        <CheckSquare className="mr-3 h-5 w-5 flex-shrink-0" />
                                        Создать заявку
                                    </Link>
                                )}
                                {navItems.map((item) => {
                                    const isActive = item.href === '/dashboard'
                                        ? pathname === '/dashboard'
                                        : pathname === item.href || pathname.startsWith(item.href + '/');
                                    return (
                                        <Link key={item.name} href={item.href} onClick={() => setMobileMenuOpen(false)}
                                            className={`flex items-center px-4 py-3 text-sm font-semibold rounded-xl transition-all ${isActive
                                                ? 'bg-blue-50 text-blue-700 border border-blue-100/50'
                                                : 'text-gray-600 hover:bg-gray-50'
                                                }`}>
                                            <item.icon className={`mr-3 h-5 w-5 flex-shrink-0 ${isActive ? 'text-blue-600' : 'text-gray-400'}`} />
                                            {item.name}
                                        </Link>
                                    );
                                })}
                            </nav>
                            <div className="p-4 border-t border-gray-100">
                                <Link href="/dashboard/profile" onClick={() => setMobileMenuOpen(false)}
                                    className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-gray-50">
                                    <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0">
                                        {(profile.displayName || profile.email).charAt(0).toUpperCase()}
                                    </div>
                                    <div className="overflow-hidden">
                                        <div className="text-sm font-bold text-gray-900 truncate">{profile.displayName || profile.email}</div>
                                        <div className="text-xs text-blue-600 capitalize">{profile.role.replace('_', ' ')}</div>
                                    </div>
                                </Link>
                            </div>
                        </div>
                    </div>
                )}

                {/* ── Main Content ── */}
                <div className="flex-1 overflow-y-auto print:overflow-visible flex flex-col min-w-0">
                    {/* Mobile top bar */}
                    <div className="md:hidden flex items-center justify-between px-4 py-3 bg-white border-b border-gray-100 sticky top-0 z-40">
                        <button onClick={() => setMobileMenuOpen(true)}
                            className="p-2 rounded-xl hover:bg-gray-100 transition-colors">
                            <Menu className="w-5 h-5 text-gray-700" />
                        </button>
                        <span className="text-sm font-bold text-gray-900">Rec-A</span>
                        <Link href="/dashboard/profile"
                            className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center text-white font-bold text-sm">
                            {(profile.displayName || profile.email).charAt(0).toUpperCase()}
                        </Link>
                    </div>

                    <main className="flex-1 p-4 sm:p-6 md:p-8 max-w-[1600px] mx-auto w-full print:p-0 print:m-0 print:max-w-none">
                        {children}
                    </main>

                    {/* Mobile bottom nav bar */}
                    <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex items-center justify-around px-2 py-1 z-40 print:hidden shadow-[0_-4px_12px_rgba(0,0,0,0.06)]">
                        {mobileBottomItems.map((item) => {
                            const isActive = item.href === '/dashboard'
                                ? pathname === '/dashboard'
                                : pathname === item.href || pathname.startsWith(item.href + '/');
                            return (
                                <Link key={item.href} href={item.href}
                                    className={`flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl transition-colors flex-1 ${isActive ? 'text-blue-600' : 'text-gray-400 hover:text-gray-700'}`}>
                                    <item.icon className="w-5 h-5" />
                                    <span className="text-[10px] font-semibold leading-tight text-center">{item.shortName}</span>
                                </Link>
                            );
                        })}
                        {/* "More" button for remaining items */}
                        {navItems.length > 4 && (
                            <button onClick={() => setMobileMenuOpen(true)}
                                className="flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl text-gray-400 hover:text-gray-700 transition-colors flex-1">
                                <Menu className="w-5 h-5" />
                                <span className="text-[10px] font-semibold">Ещё</span>
                            </button>
                        )}
                    </div>

                    {/* Bottom spacer to prevent content hiding behind mobile nav */}
                    <div className="md:hidden h-16 flex-shrink-0 print:hidden" />
                </div>
            </div>
        </ProtectedRoute>
    );
}
