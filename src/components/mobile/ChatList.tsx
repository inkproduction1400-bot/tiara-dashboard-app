"use client";

import { useEffect, useState } from "react";
import { Search, SlidersHorizontal } from "lucide-react";
import { ChatListItem } from "./ChatListItem";
import type { MobileChatRoom } from "./mobileApi";

type ChatListProps = {
  rooms: MobileChatRoom[];
  query: string;
  onQueryChange: (value: string) => void;
  staffOptions: string[];
  selectedStaffs: string[];
  onApplyStaffs: (values: string[]) => void;
  onTogglePin: (roomId: string) => void;
  pinnedRoomIds: string[];
};

export function ChatList({
  rooms,
  query,
  onQueryChange,
  staffOptions,
  selectedStaffs,
  onApplyStaffs,
  onTogglePin,
  pinnedRoomIds,
}: ChatListProps) {
  const [filterOpen, setFilterOpen] = useState(false);
  const [draftStaffs, setDraftStaffs] = useState<string[]>(selectedStaffs);

  useEffect(() => {
    if (!filterOpen) {
      setDraftStaffs(selectedStaffs);
    }
  }, [filterOpen, selectedStaffs]);

  const selectedStaffSummary =
    selectedStaffs.length === 0
      ? "担当者: すべて"
      : selectedStaffs.length <= 2
        ? `担当者: ${selectedStaffs.join(", ")}`
        : `担当者: ${selectedStaffs.length}名選択中`;

  return (
    <div className="flex min-h-0 flex-1 flex-col px-4 pb-6">
      <div className="tiara-mobile-card mt-1 border px-3 py-3">
        <label className="flex items-center gap-3">
          <Search className="h-4 w-4 text-slate-400" />
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="名前・担当・状態などをスペース区切りで検索"
            className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
          />
        </label>
      </div>

      <div className="mt-3">
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-500">
          <SlidersHorizontal className="h-4 w-4" />
          <span>{selectedStaffSummary}</span>
        </div>
        <button
          type="button"
          onClick={() => setFilterOpen(true)}
          className="tiara-mobile-card flex w-full items-center justify-between border px-3 py-3 text-left"
        >
          <span className="text-sm font-semibold text-slate-700">担当者フィルタを開く</span>
          <span className="text-xs text-slate-400">
            {selectedStaffs.length === 0 ? "未設定" : `${selectedStaffs.length}件選択`}
          </span>
        </button>
      </div>

      <div className="mt-4 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
        {rooms.length > 0 ? (
          rooms.map((room) => (
            <ChatListItem
              key={room.id}
              room={room}
              pinned={pinnedRoomIds.includes(room.id)}
              onTogglePin={onTogglePin}
            />
          ))
        ) : (
          <div className="tiara-mobile-card border px-4 py-8 text-center text-sm text-slate-500">
            条件に一致するトークがありません
          </div>
        )}
      </div>

      {filterOpen ? (
        <div className="fixed inset-0 z-50 flex items-end bg-slate-900/35">
          <div className="mx-auto flex max-h-[85dvh] w-full max-w-[420px] flex-col rounded-t-[28px] bg-white px-4 pb-6 pt-4 shadow-2xl">
            <div className="mx-auto h-1.5 w-12 rounded-full bg-slate-200" />
            <div className="mt-4 flex items-center justify-between">
              <div>
                <p className="text-base font-bold text-slate-900">担当者フィルタ</p>
                <p className="text-xs text-slate-500">複数選択で絞り込みできます</p>
              </div>
              <button
                type="button"
                onClick={() => setFilterOpen(false)}
                className="rounded-full px-3 py-2 text-xs font-semibold text-slate-500"
              >
                キャンセル
              </button>
            </div>

            <div className="mt-4 flex-1 space-y-2 overflow-y-auto">
              {staffOptions.map((staff) => {
                const active = draftStaffs.includes(staff);
                return (
                  <button
                    key={staff}
                    type="button"
                    onClick={() =>
                      setDraftStaffs((current) =>
                        current.includes(staff)
                          ? current.filter((item) => item !== staff)
                          : [...current, staff],
                      )
                    }
                    className={`flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left text-sm font-semibold transition ${
                      active
                        ? "bg-[#0b8ef3]/10 text-[#0b8ef3]"
                        : "bg-slate-50 text-slate-700"
                    }`}
                  >
                    <span>{staff}</span>
                    <span className="text-xs">{active ? "選択中" : "未選択"}</span>
                  </button>
                );
              })}
            </div>

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setDraftStaffs([])}
                className="flex-1 rounded-2xl bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-600"
              >
                クリア
              </button>
              <button
                type="button"
                onClick={() => {
                  onApplyStaffs(draftStaffs);
                  setFilterOpen(false);
                }}
                className="flex-1 rounded-2xl bg-[#0b8ef3] px-4 py-3 text-sm font-semibold text-white"
              >
                決定
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
