import type { NextConfig } from "next";

const isProduction = process.env.NODE_ENV === "production";

// Next.js emits inline bootstrap scripts; `'unsafe-eval'` is only needed by the dev HMR client.
const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "object-src 'none'",
  `script-src 'self' 'unsafe-inline'${isProduction ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https://cdn.discordapp.com",
  "font-src 'self' data:",
  "connect-src 'self' https://discord.com",
].join("; ");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  // Prisma's native engine is copied into .next/server after build; file
  // tracing does not detect the dynamic require, so include it explicitly.
  outputFileTracingIncludes: {
    "/*": [".next/server/libquery_engine-*.so.node"],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "128kb",
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
