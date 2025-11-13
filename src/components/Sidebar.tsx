"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import Image from "next/image";

export default function Sidebar() {
  const pathname = usePathname() || "/";

  const isActiveExact = (href: string) => pathname === href;
  const isActiveDeep = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  const nav = [
    {
      title: "運用機能",
      items: [
        {
          label: "本日出勤キャスト",
          href: "/casts/today",
          active: isActiveDeep("/casts/today"),
        },
        {
          label: "リクエスト店舗",
          href: "/requests",
          active: isActiveDeep("/requests"),
        },
        {
          label: "割当確認",
          href: "/assignments",
          active: isActiveDeep("/assignments"),
        },
        {
          label: "スケジュール",
          href: "/schedule",
          active: isActiveDeep("/schedule"),
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
        { label: "チャット", href: "/chat", active: isActiveDeep("/chat") },
        { label: "SOS", href: "/sos", active: isActiveDeep("/sos") },
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
      {/* ロゴ（/dashboardへ） */}
      <div className="side__brand px-2 py-3">
        <Link
          href="/dashboard"
          className="block"
          prefetch={false}
          aria-label="TIARA ダッシュボードへ"
        >
          {/* 高さ基準で比率維持（横長 1920x540 でも潰れない） */}
          <div className="relative mx-auto h-12 xl:h-14 w-full">
            <div className="relative brand__logo-box h-12 xl:h-14 w-full">
              <div className="brand__logo-box relative w-[140px] h-[42px]">
                <div className="brand__logo-box relative w-[148px] h-[42px]">
                  <Image
                    src="/img/logo4.png"
                    alt="TIARA"
                    fill
                    priority
                    className="object-contain"
                    sizes="148px"
                  />
                </div>
              </div>
            </div>
          </div>
        </Link>
      </div>

      <nav className="side__nav">
        {nav.map((sec) => (
          <div className="nav__section" key={sec.title}>
            <div className="nav__title">{sec.title}</div>
            <ul className="nav__list">
              {sec.items.map((it) => (
                <li key={it.href}>
                  <Link
                    href={it.href}
                    className={clsx(
                      "nav__item no-ico",
                      it.active && "is-active",
                    )}
                    prefetch={false}
                  >
                    <span className="nav__label">{it.label}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className="side__foot">v1.0</div>
    </aside>
  );
}
