"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import clsx from "clsx";
import Image from "next/image";
import { useEffect, useState } from "react";
import { useNotifications } from "@/contexts/NotificationsContext";
import { clearAuth } from "@/lib/device";

export default function Sidebar() {
  const pathname = usePathname() || "/";
  const router = useRouter();
  const [name, setName] = useState<string>("");

  // NotificationsContext の形が多少違っても落ちないように吸う
  const n = useNotifications() as any;

  // staff側のチャット未読は counts.staffTalk を優先
  const talkUnread: number =
    (typeof n?.counts?.staffTalk === "number" ? n.counts.staffTalk : null) ??
    (typeof n?.summary?.counts?.staffTalk === "number"
      ? n.summary.counts.staffTalk
      : null) ??
    (typeof n?.staffTalk === "number" ? n.staffTalk : null) ??
    (typeof n?.talkUnread === "number" ? n.talkUnread : 0);

  const headerUnread: number =
    (typeof n?.headerUnread === "number" ? n.headerUnread : null) ??
    (typeof n?.unreadNotifications === "number" ? n.unreadNotifications : null) ??
    (typeof n?.summary?.unreadNotifications === "number"
      ? n.summary.unreadNotifications
      : 0);

  useEffect(() => {
    const local =
      (typeof window !== "undefined" &&
        (localStorage.getItem("tiara_user_name") ||
          localStorage.getItem("tiara_login_id"))) ||
      "";
    setName(local && local.trim() ? local : "ゲスト");
  }, []);

  const onLogout = async () => {
    try {
      clearAuth();
    } finally {
      router.push("/login");
    }
  };

  const isActiveExact = (href: string) => pathname === href;
  const isActiveDeep = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  const nav = [
    {
      title: "運用機能",
      items: [
        {
          // 本日出勤キャスト → マッチング
          label: "マッチング",
          href: "/casts/today",
          active: isActiveDeep("/casts/today"),
        },
        {
          // 割当確認 → 割当リスト
          label: "割当リスト",
          href: "/assignments",
          active: isActiveDeep("/assignments"),
        },
      ],
    },
    {
      title: "管理機能",
      items: [
        {
          label: "キャスト管理",
          href: "/casts",
          active: isActiveExact("/casts"),
        },
        { label: "店舗管理", href: "/shops", active: isActiveDeep("/shops") },
        { label: "備品管理", href: "/assets", active: isActiveDeep("/assets") },
        { label: "送迎管理", href: "/rides", active: isActiveDeep("/rides") },
      ],
    },
    {
      title: "通信機能",
      items: [
        {
          label: "チャット",
          href: "/chat",
          active: isActiveDeep("/chat"),
        },
      ],
    },
    {
      title: "管理者機能",
      items: [
        {
          label: "申請・承認",
          href: "/approvals",
          active: isActiveDeep("/approvals"),
        },
        {
          label: "設定⚙️",
          href: "/settings",
          active: isActiveDeep("/settings"),
        },
      ],
    },
  ];

  return (
    <aside className="side-nav side--manabi slim">
      {/* ロゴ（ログイン後のデフォルト＝マッチングへ） */}
      <div className="side__brand px-2 py-3">
        <Link
          href="/casts/today"
          className="block"
          prefetch={false}
          aria-label="TIARA ダッシュボードへ"
        >
          <div className="brand__logo-box">
            <Image
              src="/img/logo4.png"
              alt="TIARA"
              fill
              priority
              className="object-contain"
              sizes="188px"
            />
          </div>
        </Link>
      </div>

      <nav className="side__nav">
        {nav.map((sec) => (
          <div className="nav__section" key={sec.title}>
            <div className="nav__title">{sec.title}</div>
            <ul className="nav__list">
              {sec.items.map((it) => {
                const isChat = it.href === "/chat";

                return (
                  <li key={it.href}>
                    <Link
                      href={it.href}
                      className={clsx(
                        "nav__item no-ico",
                        it.active && "is-active",
                      )}
                      prefetch={false}
                    >
                      <span className="nav__label flex items-center justify-between gap-2">
                        <span className="truncate">{it.label}</span>

                        {isChat && talkUnread > 0 && (
                          <span className="inline-flex min-w-[14px] h-[14px] px-1 items-center justify-center rounded-full bg-rose-500 text-[9px] font-semibold text-white leading-none">
                            {talkUnread > 99 ? "99+" : talkUnread}
                          </span>
                        )}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="side__foot">
        <div className="flex flex-col items-center gap-2">
          <div className="relative flex flex-col items-center -mt-0.5">
            <div
              className="w-8 h-8 rounded-full border border-sky-400 bg-white/10"
              aria-hidden
            />
            {headerUnread > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-[10px] font-semibold text-white flex items-center justify-center shadow-sm">
                {headerUnread > 99 ? "99+" : headerUnread}
              </span>
            )}
            <div className="mt-1 max-w-[9rem] text-[10px] leading-none text-ink/85 text-center truncate">
              {name || "ゲスト"}
            </div>
          </div>

          <button className="tiara-btn px-3 py-2 text-xs" onClick={onLogout}>
            ログアウト
          </button>
        </div>

        <div className="mt-2 text-[10px] text-muted">v1.0</div>
      </div>
    </aside>
  );
}
