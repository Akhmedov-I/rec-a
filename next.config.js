const withNextIntl = require("next-intl/plugin")("./src/i18n.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
    serverExternalPackages: ['pdf-parse', 'mammoth', 'firebase-admin', '@google-cloud/firestore', '@google-cloud/storage'],
};

module.exports = withNextIntl(nextConfig);
