import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { routing } from '@/i18n/routing';
import { notFound } from 'next/navigation';
import { AuthProvider } from '@/context/AuthContext';
import Navigation from '@/components/Navigation';
import { Toaster } from 'react-hot-toast';
import '../globals.css';

export default async function LocaleLayout({
    children,
    params
}: {
    children: React.ReactNode;
    params: Promise<{ locale: string }>;
}) {
    const { locale } = await params;

    if (!routing.locales.includes(locale as any)) {
        notFound();
    }

    const messages = await getMessages();

    return (
        <html lang={locale}>
            <body className="bg-gray-50 min-h-screen">
                <NextIntlClientProvider messages={messages}>
                    <AuthProvider>
                        <Navigation />
                        <main>
                            {children}
                        </main>
                        <Toaster
                            position="bottom-right"
                            toastOptions={{
                                duration: 4000,
                                style: {
                                    background: '#ffffff',
                                    color: '#1f2937',
                                    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
                                    borderRadius: '1rem',
                                    padding: '16px 24px',
                                    fontWeight: '500',
                                    border: '1px solid #f3f4f6',
                                },
                                success: {
                                    iconTheme: {
                                        primary: '#2563eb', // blue-600
                                        secondary: '#ffffff',
                                    },
                                    style: {
                                        borderLeft: '4px solid #2563eb',
                                    }
                                },
                                error: {
                                    iconTheme: {
                                        primary: '#ef4444', // red-500
                                        secondary: '#ffffff',
                                    },
                                    style: {
                                        borderLeft: '4px solid #ef4444',
                                    }
                                },
                            }}
                        />
                    </AuthProvider>
                </NextIntlClientProvider>
            </body>
        </html>
    );
}
