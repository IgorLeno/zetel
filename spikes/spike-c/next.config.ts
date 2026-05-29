import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Evita que o webpack tente empacotar o binário nativo do better-sqlite3
  serverExternalPackages: ['better-sqlite3'],
};

export default nextConfig;
