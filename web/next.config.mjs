/** @type {import('next').NextConfig} */
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const nextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ['mongoose', 'bcryptjs'],
  outputFileTracingRoot: path.join(__dirname),
  transpilePackages: ['@zxing/browser', '@zxing/library'],
};

export default nextConfig;
