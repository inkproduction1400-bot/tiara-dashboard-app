/** @type {import('next').NextConfig} */

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
  // 自サイト + 指定オリジン(あれば) + 予備で https: を許可
  `frame-src 'self' ${LIVE_ORIGIN ? LIVE_ORIGIN : "https:"};`,
  // このポータル自体は自ドメイン内でのみiframeに入れられる
  `frame-ancestors 'self';`,
  // XSS対策などのベーシックCSP（必要に応じて拡張）
  `default-src 'self';`,
  `img-src 'self' data: https:;`,
  `style-src 'self' 'unsafe-inline';`,
  `script-src 'self' 'unsafe-inline' 'unsafe-eval';`,
  `connect-src 'self' https:;`,
].join(" ");

const nextConfig = {
  reactStrictMode: true,

  async headers() {
    return [
      // Live セクション（/dev/live/*）に限定してヘッダ付与
      {
        source: "/dev/live/:path*",
        headers: [
          // 検索エンジンに出したくない場合
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
          // キャッシュ抑制（実態はiframe先の更新で追随）
          { key: "Cache-Control", value: "no-store" },
          // クリックジャッキング対策（CSPのframe-ancestorsも設定）
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          // 参照情報を漏らさない
          { key: "Referrer-Policy", value: "no-referrer" },
          // ブラウザ機能の露出を最小化（必要に応じて調整）
          {
            key: "Permissions-Policy",
            value: [
              "camera=()",
              "microphone=()",
              "geolocation=()",
              "interest-cohort=()",
            ].join(", "),
          },
          // Live 埋め込み向け CSP
          { key: "Content-Security-Policy", value: LIVE_CSP },
        ],
      },
      // 必要なら Docs/ERD/WBS などにも最低限のヘッダを適用
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
