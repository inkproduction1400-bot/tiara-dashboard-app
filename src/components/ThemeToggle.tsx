"use client";

import { useEffect, useState } from "react";

type Theme = "dark" | "light";

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("dark");

  // 初期化（localStorage優先 / 既定は dark）
  useEffect(() => {
    const saved = (localStorage.getItem("tiara_theme") as Theme) || "dark";
    applyTheme(saved);
  }, []);

  const applyTheme = (t: Theme) => {
    setTheme(t);
    const el = document.documentElement;
    if (t === "light") {
      el.setAttribute("data-theme", "light");
    } else {
      el.removeAttribute("data-theme");
    }
    localStorage.setItem("tiara_theme", t);
  };

  const toggle = () => applyTheme(theme === "dark" ? "light" : "dark");

  return (
    <button
      onClick={toggle}
      className="rounded-xl border border-white/15 bg-white/5 text-ink px-3 py-2 text-xs"
      aria-label="テーマ切替"
      title={theme === "dark" ? "ライトモードに切替" : "ダークモードに切替"}
    >
      {theme === "dark" ? "🌙 Dark" : "☀️ Light"}
    </button>
  );
}
