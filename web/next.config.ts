import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false, // do not advertise the framework version
  compress: true,
  experimental: {
    // Only pull the icons/helpers actually used into the client bundle.
    optimizePackageImports: ['@supabase/supabase-js'],
  },
  // googleapis and the Anthropic SDK are server-only and large; keep them out
  // of any bundle the browser could receive.
  serverExternalPackages: ['googleapis', '@anthropic-ai/sdk'],
};

export default config;
