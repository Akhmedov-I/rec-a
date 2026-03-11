"use client";

import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';

interface ConfirmDialogProps {
    isOpen: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    variant?: 'danger' | 'warning' | 'info';
    onConfirm: () => void;
    onCancel: () => void;
}

export default function ConfirmDialog({
    isOpen,
    title,
    message,
    confirmLabel = 'Подтвердить',
    cancelLabel = 'Отмена',
    variant = 'danger',
    onConfirm,
    onCancel,
}: ConfirmDialogProps) {
    // Close on Escape
    useEffect(() => {
        if (!isOpen) return;
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [isOpen, onCancel]);

    if (!isOpen) return null;

    const variantStyles = {
        danger: {
            icon: 'bg-red-100 text-red-600',
            confirm: 'bg-red-600 hover:bg-red-700 focus:ring-red-500 text-white',
        },
        warning: {
            icon: 'bg-yellow-100 text-yellow-600',
            confirm: 'bg-yellow-500 hover:bg-yellow-600 focus:ring-yellow-400 text-white',
        },
        info: {
            icon: 'bg-blue-100 text-blue-600',
            confirm: 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500 text-white',
        },
    }[variant];

    return (
        /* Backdrop */
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            onClick={onCancel}
        >
            {/* Blur overlay */}
            <div className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm" />

            {/* Dialog */}
            <div
                className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm border border-gray-100 animate-[scale-in_0.15s_ease-out]"
                onClick={e => e.stopPropagation()}
                style={{ animation: 'scaleIn 0.15s ease-out' }}
            >
                <div className="p-6">
                    {/* Icon + Title */}
                    <div className="flex items-start gap-4 mb-4">
                        <div className={`shrink-0 w-11 h-11 rounded-xl flex items-center justify-center ${variantStyles.icon}`}>
                            <AlertTriangle className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="text-base font-bold text-gray-900">{title}</h3>
                            <p className="text-sm text-gray-500 mt-1 leading-relaxed">{message}</p>
                        </div>
                    </div>

                    {/* Buttons */}
                    <div className="flex gap-3 justify-end mt-6">
                        <button
                            onClick={onCancel}
                            className="px-5 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-300"
                        >
                            {cancelLabel}
                        </button>
                        <button
                            onClick={onConfirm}
                            className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 ${variantStyles.confirm}`}
                        >
                            {confirmLabel}
                        </button>
                    </div>
                </div>
            </div>

            <style>{`
                @keyframes scaleIn {
                    from { opacity: 0; transform: scale(0.95) translateY(4px); }
                    to   { opacity: 1; transform: scale(1)    translateY(0); }
                }
            `}</style>
        </div>
    );
}
