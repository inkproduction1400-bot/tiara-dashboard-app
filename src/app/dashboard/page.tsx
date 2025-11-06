"use client";

import React from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import StatCard, { Stat } from "@/components/StatCard";

/* ▼ カスタマイズ可能なショートカット格子（並び替え/追加/編集/削除/リセット） */
import ShortcutGrid from "@/components/dashboard/ShortcutGrid";
import type { Shortcut } from "@/types/shortcut";

/* ====== ダミー統計（後でAPIに差し替え） ====== */
const demoStats = {
  today: { castTotal: 120, castOn: 48, castOff: 64, assignedCast: 41, reqShops: 22, assignedShops: 15 },
  tomorrow: { castTotal: 121, castOn: 52, castOff: 60, assignedCast: 49, reqShops: 18, assignedShops: 11 },
};

/* ====== ショートカットの初期値（後でユーザーごとに保存/復元） ====== */
const DEFAULT_SHORTCUTS: Shortcut[] = [
  { id: "assign",       label: "キャストを店舗に割り当てる", href: "/casts/today", icon: "Users" },
  { id: "matching",     label: "本日のマッチングを確認",     href: "/assignments",  icon: "ClipboardList" },
  { id: "assets",       label: "備品の確認をする",           href: "/assets",       icon: "Building2" },
  { id: "chat",         label: "キャストとチャットする",     href: "/chat",         icon: "MessageSquare" },
  { id: "rides",        label: "送迎の確認をする",           href: "/rides",        icon: "Calendar" },
];

/* ローカル日付の YYYY-MM-DD を生成（UTCズレ対策） */
const formatLocalYMD = (d: Date) => {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
};

export default function Page() {
  // === 未割当キャスト数（0 下限）
  const unassignedCastToday = Math.max(demoStats.today.castOn - demoStats.today.assignedCast, 0);
  const unassignedCastTomorrow = Math.max(demoStats.tomorrow.castOn - demoStats.tomorrow.assignedCast, 0);

  // === 本日（キャスト）
  const S1: Stat[] = [
    { label: "キャスト総数", value: demoStats.today.castTotal },
    { label: "本日出勤数",   value: demoStats.today.castOn },
    { label: "未出勤数",     value: demoStats.today.castOff },
    { label: "未割当キャスト数", value: unassignedCastToday, tone: unassignedCastToday > 0 ? "danger" : "ok" },
  ];
  const S1_LINKS: (string | undefined)[] = [
    undefined,
    undefined,
    undefined,
    "/casts/today?sort=unassigned_first",
  ];

  // === 本日のリクエスト店舗
  const unassignedToday = Math.max(demoStats.today.reqShops - demoStats.today.assignedShops, 0);
  const S2: Stat[] = [
    { label: "本日のリクエスト店舗数", value: demoStats.today.reqShops },
    {
      label: "割当済み店舗数",
      value: demoStats.today.assignedShops,
      tone: demoStats.today.assignedShops < demoStats.today.reqShops ? "warn" : "ok",
    },
    { label: "未割当店舗数", value: unassignedToday, tone: unassignedToday > 0 ? "danger" : "ok" },
  ];
  const S2_LINKS = [
    undefined,
    undefined,
    "/requests?sort=unassigned_first",
  ];

  // === 明日（キャスト）
  const S3: Stat[] = [
    { label: "キャスト総数", value: demoStats.tomorrow.castTotal },
    { label: "明日の出勤数", value: demoStats.tomorrow.castOn },
    { label: "明日の未出勤数", value: demoStats.tomorrow.castOff },
    { label: "未割当キャスト数", value: unassignedCastTomorrow, tone: unassignedCastTomorrow > 0 ? "danger" : "ok" },
  ];
  const S3_LINKS = [
    undefined,
    undefined,
    undefined,
    "/casts?sort=unassigned_tomorrow",
  ];

  // === 明日のリクエスト店舗
  const unassignedTomorrow = Math.max(demoStats.tomorrow.reqShops - demoStats.tomorrow.assignedShops, 0);
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowYMD = formatLocalYMD(tomorrow);

  const S4: Stat[] = [
    { label: "明日のリクエスト店舗数", value: demoStats.tomorrow.reqShops },
    {
      label: "明日の割当済み店舗数",
      value: demoStats.tomorrow.assignedShops,
      tone: demoStats.tomorrow.assignedShops < demoStats.tomorrow.reqShops ? "warn" : "ok",
    },
    { label: "明日の未割当店舗数", value: unassignedTomorrow, tone: unassignedTomorrow > 0 ? "danger" : "ok" },
  ];
  const S4_LINKS = [
    undefined,
    undefined,
    `/schedule?tab=matching&modal=day&date=${encodeURIComponent(tomorrowYMD)}`,
  ];

  // 実装時はログインユーザーの ID を注入してください（useAuth() 等）
  const userId = "demo-user-1";

  return (
    <AppShell title="ダッシュボード" subtitle="最重要の操作を、アプリアイコン風メニューで素早く">
      {/* 上段：運用サマリー（詳細ボタンは非表示） */}
      <section className="summary-strip p-2 strip-edge">
        <h2 className="sr-only">運用サマリー</h2>
        <div className="summary-grid grid grid-cols-2 xl:grid-cols-4 gap-4">
          <StatCard
            title="キャスト出勤状況（本日）"
            stats={S1}
            rowLinks={S1_LINKS}
            showDetail={false}
            className="summary-card"
          />
          <StatCard
            title="本日リクエスト店舗／割当状況"
            stats={S2}
            rowLinks={S2_LINKS}
            showDetail={false}
            className="summary-card"
          />
          <StatCard
            title="キャスト出勤状況（明日）"
            stats={S3}
            rowLinks={S3_LINKS}
            showDetail={false}
            className="summary-card"
          />
          <StatCard
            title="明日のリクエスト店舗／割当状況"
            stats={S4}
            rowLinks={S4_LINKS}
            showDetail={false}
            className="summary-card"
          />
        </div>
      </section>

      {/* 下段：アプリアイコン風メニュー（カスタマイズ可能なグリッド） */}
      <section className="menu-strip p-3 strip-edge">
        <h2 className="sr-only">クイックメニュー</h2>
        <div className="app-icons-wrap">
          {/* 既存の中央寄せコンテナは維持。中身は並び替え可能なShortcutGridに差し替え */}
          <ShortcutGrid userId={userId} defaults={DEFAULT_SHORTCUTS} />
        </div>
      </section>
    </AppShell>
  );
}
