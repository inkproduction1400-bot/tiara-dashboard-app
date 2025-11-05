"use client";

import Link from "next/link";
import AppShell from "@/components/AppShell";
import StatCard, { Stat } from "@/components/StatCard";
import React from "react";

/* ====== シンプルSVGアイコン ====== */
const IAssign = (p: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...p}>
    <path d="M8 16l3-3-3-3" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M13 7h3a2 2 0 012 2v6a2 2 0 01-2 2h-3" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
    <circle cx="6.5" cy="12" r="2.5" strokeWidth="1.6"/>
  </svg>
);
const IScheduleToday = (p: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...p}>
    <rect x="3" y="5" width="18" height="16" rx="3" strokeWidth="1.6"/>
    <path d="M16 3v4M8 3v4M3 10h18" strokeWidth="1.6" strokeLinecap="round"/>
    <circle cx="9" cy="14" r="1.75" />
    <path d="M13.5 14H18" strokeWidth="1.6" strokeLinecap="round"/>
  </svg>
);
const IAssets = (p: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...p}>
    <rect x="4" y="7" width="16" height="11" rx="2" strokeWidth="1.6"/>
    <path d="M4 10h16" strokeWidth="1.6"/>
    <path d="M8 4h8v3H8z" strokeWidth="1.6"/>
  </svg>
);
const IChat = (p: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...p}>
    <path d="M21 12a7 7 0 01-7 7H7l-4 3 1-5A7 7 0 017 5h7a7 7 0 017 7z" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const IRide = (p: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...p}>
    <path d="M3 14l2-5a2 2 0 012-1h10a2 2 0 012 1l2 5" strokeWidth="1.6" strokeLinecap="round"/>
    <circle cx="7.5" cy="17.5" r="2" />
    <circle cx="16.5" cy="17.5" r="2" />
    <path d="M5 14h14" strokeWidth="1.6" strokeLinecap="round"/>
  </svg>
);

/* ====== ダミー統計（後でAPIに差し替え） ====== */
const demoStats = {
  today: { castTotal: 120, castOn: 48, castOff: 64, assignedCast: 41, reqShops: 22, assignedShops: 15 },
  tomorrow: { castTotal: 121, castOn: 52, castOff: 60, assignedCast: 49, reqShops: 18, assignedShops: 11 },
};

/* ====== アイコンメニュー定義 ====== */
type AppBtn = {
  label: string;
  href: string;
  Icon: React.FC<React.SVGProps<SVGSVGElement>>;
  badgeClass: string;
};
const APP_BUTTONS: AppBtn[] = [
  // 要件準拠の遷移先
  { label: "キャストを店舗に割り当てる", href: "/casts/today",     Icon: IAssign,        badgeClass: "badge-assign"   },
  { label: "本日のマッチングを確認",     href: "/assignments",     Icon: IScheduleToday, badgeClass: "badge-matching" },
  { label: "備品の確認をする",           href: "/assets",          Icon: IAssets,        badgeClass: "badge-assets"   },
  { label: "キャストとチャットする",     href: "/chat",            Icon: IChat,          badgeClass: "badge-chat"     },
  { label: "送迎の確認をする",           href: "/rides",           Icon: IRide,          badgeClass: "badge-ride"     },
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

  return (
    <AppShell title="ダッシュボード" subtitle="最重要の操作を、アプリアイコン風メニューで素早く">
      {/* 上段：運用サマリー（詳細ボタンは非表示） */}
      <section className="summary-strip p-3 strip-edge">
        <h2 className="sr-only">運用サマリー</h2>
        <div className="summary-grid">
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

      {/* 下段：アプリアイコン風メニュー（中央寄せ） */}
      <section className="menu-strip p-3 strip-edge">
        <h2 className="sr-only">クイックメニュー</h2>
        <div className="app-icons-wrap">
          <div className="app-icons">
            {APP_BUTTONS.map(({ label, href, Icon, badgeClass }) => (
              <Link key={href} href={href} className="app-icon" prefetch={false}>
                <div className={`app-icon__badge ${badgeClass}`}>
                  <Icon className="app-icon__svg" />
                </div>
                <div className="app-icon__label">{label}</div>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </AppShell>
  );
}
