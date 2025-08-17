import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Security headers for production
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY'
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin'
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block'
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(self)'
          }
        ]
      }
    ];
  },
  
  // Environment variables that should be available to the client
  env: {
    CUSTOM_KEY: process.env.CUSTOM_KEY,
  },
  
  // Optimize builds for production
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production'
  },
  
  // Allow builds to continue with ESLint warnings for production
  eslint: {
    ignoreDuringBuilds: true,
  },
  
  // Allow TypeScript builds to continue with errors for production
  typescript: {
    ignoreBuildErrors: process.env.NODE_ENV === 'production',
  },
  
  // Performance optimizations
  // experimental: {
  //   optimizeCss: true,
  // }
};

export default nextConfig;
