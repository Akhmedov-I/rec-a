"use client";

import { useLocale } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/routing';
import { Globe, ChevronDown } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

export default function LocaleSwitcher() {
    const locale = useLocale();
    const router = useRouter();
    const pathname = usePathname();
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const handleLocaleChange = (nextLocale: 'ru' | 'uz') => {
        router.replace(pathname, { locale: nextLocale });
        setIsOpen(false);
    };

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const languages = {
        ru: 'Русский',
        uz: "O'zbekcha"
    };

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-2 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl px-4 py-2.5 transition-all cursor-pointer text-sm font-bold text-gray-700 hover:shadow-sm"
            >
                <Globe className="w-4 h-4 text-blue-500" />
                <span>{languages[locale as keyof typeof languages]}</span>
                <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && (
                <div className="absolute right-0 mt-2 w-40 bg-white border border-gray-100 rounded-xl shadow-xl shadow-gray-200/50 py-2 z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                    <button
                        onClick={() => handleLocaleChange('ru')}
                        className={`w-full text-left px-4 py-2 text-sm font-bold transition-colors hover:bg-gray-50 ${locale === 'ru' ? 'text-blue-600 bg-blue-50/50' : 'text-gray-700'}`}
                    >
                        Русский
                    </button>
                    <button
                        onClick={() => handleLocaleChange('uz')}
                        className={`w-full text-left px-4 py-2 text-sm font-bold transition-colors hover:bg-gray-50 ${locale === 'uz' ? 'text-blue-600 bg-blue-50/50' : 'text-gray-700'}`}
                    >
                        O'zbekcha
                    </button>
                </div>
            )}
        </div>
    );
}
