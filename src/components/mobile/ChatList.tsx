"use client";

import { Search, SlidersHorizontal } from "lucide-react";
import { ChatListItem } from "./ChatListItem";
import type { MobileChatRoom } from "./mobileApi";

type ChatListProps = {
  rooms: MobileChatRoom[];
  query: string;
  onQueryChange: (value: string) => void;
  staffOptions: string[];
  selectedStaffs: string[];
  onToggleStaff: (value: string) => void;
};

export function ChatList({
  rooms,
  query,
  onQueryChange,
  staffOptions,
  selectedStaffs,
  onToggleStaff,
}: ChatListProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col px-4 pb-6">
      <div className="tiara-mobile-card mt-1 border px-3 py-3">
        <label className="flex items-center gap-3">
          <Search className="h-4 w-4 text-slate-400" />
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="キャスト名・メッセージで検索"
            className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
          />
        </label>
      </div>

      <div className="mt-3">
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-500">
          <SlidersHorizontal className="h-4 w-4" />
          <span>担当者フィルタ</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {staffOptions.map((staff) => {
            const active = selectedStaffs.includes(staff);
            return (
              <button
                key={staff}
                type="button"
                onClick={() => onToggleStaff(staff)}
                className={`tiara-mobile-pill px-3 py-2 text-xs font-semibold transition ${
                  active
                    ? "bg-[#0b8ef3] text-white shadow-[0_10px_24px_rgba(11,142,243,0.22)]"
                    : "bg-slate-100 text-slate-600"
                }`}
              >
                {staff}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-4 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
        {rooms.length > 0 ? (
          rooms.map((room) => <ChatListItem key={room.id} room={room} />)
        ) : (
          <div className="tiara-mobile-card border px-4 py-8 text-center text-sm text-slate-500">
            条件に一致するトークがありません
          </div>
        )}
      </div>
    </div>
  );
}
