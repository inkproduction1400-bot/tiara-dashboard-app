// tailwind.config.ts
import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  // ダークモードは使わない前提（クラス切り替えは無効化）
  // ※ dark: プレフィックスは今後使わない想定
  darkMode: "media",
  theme: {
    extend: {
      // 必要に応じてカスタムトークンをここに追加
      // colors: {
      //   ink: "#101624",
      //   muted: "#5b6a86",
      // },
    },
  },
  plugins: [],
} satisfies Config;
