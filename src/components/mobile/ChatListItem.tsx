"use client";

import Link from "next/link";
import clsx from "clsx";
import type { MobileChatRoom } from "./mobileApi";

type ChatListItemProps = {
  room: MobileChatRoom;
  active?: boolean;
};

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--:--";
  return new Intl.DateTimeFormat("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function initials(name: string) {
  return name.replace(/\s+/g, "").slice(0, 2) || "ST";
}

export function ChatListItem({ room, active = false }: ChatListItemProps) {
  return (
    <Link
      href={`/m/chat/${room.id}`}
      className={clsx(
        "tiara-mobile-card block border px-4 py-4 transition",
        active ? "border-[#0b8ef3]/40 bg-[#f2f9ff]" : "border-white/70",
      )}
    >
      <div className="flex items-start gap-3">
        <div className="tiara-mobile-soft relative flex h-14 w-14 shrink-0 items-center justify-center bg-[#0b8ef3]/12 text-sm font-bold text-[#0b8ef3]">
          {initials(room.castName)}
          <span
            className={clsx(
              "tiara-mobile-avatar absolute -bottom-1 -right-1 h-4 w-4 border-2 border-white",
              room.shiftStatus === "出勤中"
                ? "bg-emerald-500"
                : room.shiftStatus === "出勤予定"
                  ? "bg-amber-400"
                  : "bg-slate-300",
            )}
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-sm font-bold text-slate-900">
                {room.castName}
              </div>
              <div className="truncate text-xs text-slate-500">
                {room.castCode} / 担当 {room.staffName}
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div className="text-[11px] font-semibold text-slate-400">
                {formatTime(room.lastMessageAt)}
              </div>
              {room.unreadCount > 0 ? (
                <span className="tiara-mobile-pill mt-2 inline-flex min-w-5 items-center justify-center bg-[#0b8ef3] px-1.5 py-0.5 text-[10px] font-bold text-white">
                  {room.unreadCount}
                </span>
              ) : null}
            </div>
          </div>

          <p className="mt-2 truncate text-sm text-slate-600">{room.lastMessage}</p>

          <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-semibold">
            <span className="tiara-mobile-pill bg-slate-100 px-2.5 py-1 text-slate-600">
              {room.shiftStatus}
            </span>
            <span className="tiara-mobile-pill bg-[#0b8ef3]/10 px-2.5 py-1 text-[#0b8ef3]">
              {room.assignmentStatus}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
