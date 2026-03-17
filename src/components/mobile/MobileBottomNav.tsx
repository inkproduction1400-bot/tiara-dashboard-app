"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { ClipboardList, MessageCircleMore, UserRound } from "lucide-react";

const ITEMS = [
  { href: "/m/chat", label: "Chat", match: "/m/chat", Icon: MessageCircleMore },
  {
    href: "/m/assignments",
    label: "Assignments",
    match: "/m/assignments",
    Icon: ClipboardList,
  },
  { href: "/m/profile", label: "Profile", match: "/m/profile", Icon: UserRound },
];

export function MobileBottomNav() {
  const pathname = usePathname();

  return (
    <nav className="tiara-mobile-card tiara-mobile-pill fixed bottom-4 left-1/2 z-40 box-border flex w-[calc(100%-1.5rem)] max-w-[390px] -translate-x-1/2 items-center justify-around border px-2 py-2 backdrop-blur">
      {ITEMS.map(({ href, label, match, Icon }) => {
        const active = pathname === match || pathname?.startsWith(`${match}/`);
        return (
          <Link
            key={href}
            href={href}
            className={clsx(
              "tiara-mobile-pill flex min-w-0 flex-1 flex-col items-center gap-1 px-2 py-2 text-[11px] font-semibold transition",
              active
                ? "bg-[#0b8ef3] text-white shadow-[0_10px_24px_rgba(11,142,243,0.35)]"
                : "text-slate-500",
            )}
          >
            <Icon className="h-4 w-4" />
            <span className="truncate">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
