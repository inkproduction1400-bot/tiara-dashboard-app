/** @type {import('next').NextConfig} */
import path from "node:path";

// Live埋め込み先のオリジン（例: https://tiara-portal.vercel.app）
const LIVE_ORIGIN = (() => {
  try {
    const u = process.env.NEXT_PUBLIC_DASHBOARD_URL
      ? new URL(process.env.NEXT_PUBLIC_DASHBOARD_URL)
      : null;
    return u ? u.origin : null;
  } catch {
    return null;
  }
})();

// /dev/live 用のCSP（iframe許可先を限定）
const LIVE_CSP = [
  `frame-src 'self' ${LIVE_ORIGIN ? LIVE_ORIGIN : "https:"};`,
  `frame-ancestors 'self';`,
  `default-src 'self';`,
  `img-src 'self' data: https:;`,
  `style-src 'self' 'unsafe-inline';`,
  `script-src 'self' 'unsafe-inline' 'unsafe-eval';`,
  `connect-src 'self' https:;`,
].join(" ");

const nextConfig = {
  reactStrictMode: true,

  // ★ 追加: `@` を `src/` に解決（AppShell などのパス解決エラー対策）
  webpack(config) {
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      "@": path.resolve(process.cwd(), "src"),
    };
    return config;
  },

  async headers() {
    return [
      {
        source: "/dev/live/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
          { key: "Cache-Control", value: "no-store" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "no-referrer" },
          {
            key: "Permissions-Policy",
            value: ["camera=()", "microphone=()", "geolocation=()", "interest-cohort=()"].join(", "),
          },
          { key: "Content-Security-Policy", value: LIVE_CSP },
        ],
      },
      {
        source: "/(dev|docs|erd|wbs)/:path*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
    ];
  },
};

export default nextConfig;
