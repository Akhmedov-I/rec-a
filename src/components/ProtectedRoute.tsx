"use client";

import { useAuth } from '@/context/AuthContext';
import { useRouter } from '@/i18n/routing';
import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

export default function ProtectedRoute({ children, allowedRoles }: { children: React.ReactNode, allowedRoles?: string[] }) {
    const { user, profile, loading } = useAuth();
    const router = useRouter();
    const [isRedirecting, setIsRedirecting] = useState(false);

    useEffect(() => {
        if (!loading) {
            if (!user) {
                setIsRedirecting(true);
                router.push('/auth/login');
            } else if (allowedRoles && profile && !allowedRoles.includes(profile.role)) {
                setIsRedirecting(true);
                router.push('/dashboard');
            }
        }
    }, [user, profile, loading, router, allowedRoles]);

    // Show spinner only while Firebase is checking auth state
    if (loading) {
        return (
            <div className="flex h-screen items-center justify-center bg-gray-50/50 backdrop-blur-sm">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 className="w-12 h-12 animate-spin text-blue-600" />
                    <p className="text-gray-500 font-medium animate-pulse">Загрузка данных...</p>
                </div>
            </div>
        );
    }

    // If not authenticated or wrong role — show nothing while redirect happens
    if (!user || (allowedRoles && profile && !allowedRoles.includes(profile.role)) || isRedirecting) {
        return null;
    }

    return <>{children}</>;
}
