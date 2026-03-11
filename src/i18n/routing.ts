import { defineRouting } from 'next-intl/routing';
import { createNavigation } from 'next-intl/navigation';

export const routing = defineRouting({
    locales: ['ru', 'uz'],
    defaultLocale: 'ru',
    localePrefix: 'as-needed'
});

export const { Link, redirect, usePathname, useRouter, getPathname } =
    createNavigation(routing);
