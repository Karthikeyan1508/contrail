/** @type {import('next').NextConfig} */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const API = process.env.API_URL ?? 'http://localhost:4000';

const nextConfig = {
  reactStrictMode: true,

  // Dependencies hoist to the workspace root, so Turbopack's project root has
  // to be the monorepo root as well. Left to infer it, Turbopack scopes itself
  // to apps/web, cannot resolve the hoisted `next` package, and every compile
  // of /page panics with "Next.js package not found" — which reaches the
  // browser as an endless reload loop rather than an error.
  turbopack: { root: resolve(HERE, '../../../..') },

  // The frontend never talks to Amadeus or Contentstack directly. One boundary.
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${API}/api/:path*` }];
  },
};

export default nextConfig;
