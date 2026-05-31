"use client";

import { useEffect, useState } from "react";
import { Search, SlidersHorizontal } from "lucide-react";
import { ChatListItem } from "./ChatListItem";
import type { MobileChatCastProfile, MobileChatRoom } from "./mobileApi";

type ChatListProps = {
  rooms: MobileChatRoom[];
  query: string;
  onQueryChange: (value: string) => void;
  staffOptions: string[];
  selectedStaffs: string[];
  onApplyStaffs: (values: string[]) => void;
  notificationTarget: string;
  notificationTargetOptions: { id: string; label: string }[];
  onApplyNotificationTarget: (value: string) => void;
  onTogglePin: (roomId: string) => void;
  pinnedRoomIds: string[];
  onOpenProfile: (room: MobileChatRoom) => void;
  castProfiles: Record<string, MobileChatCastProfile>;
};

export function ChatList({
  rooms,
  query,
  onQueryChange,
  staffOptions,
  selectedStaffs,
  onApplyStaffs,
  notificationTarget,
  notificationTargetOptions,
  onApplyNotificationTarget,
  onTogglePin,
  pinnedRoomIds,
  onOpenProfile,
  castProfiles,
}: ChatListProps) {
  const [filterOpen, setFilterOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [draftStaffs, setDraftStaffs] = useState<string[]>(selectedStaffs);
  const [draftNotificationTarget, setDraftNotificationTarget] =
    useState(notificationTarget);
  const [activeSwipeRoomId, setActiveSwipeRoomId] = useState<string | null>(null);

  useEffect(() => {
    if (!filterOpen) {
      setDraftStaffs(selectedStaffs);
    }
  }, [filterOpen, selectedStaffs]);

  useEffect(() => {
    if (!notificationOpen) {
      setDraftNotificationTarget(notificationTarget);
    }
  }, [notificationOpen, notificationTarget]);

  useEffect(() => {
    if (!filterOpen && !notificationOpen) return;
    const previousOverflow = document.body.style.overflow;
    const previousTouchAction = document.body.style.touchAction;
    document.body.style.overflow = "hidden";
    document.body.style.touchAction = "none";
    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.touchAction = previousTouchAction;
    };
  }, [filterOpen, notificationOpen]);

  const selectedStaffSummary =
    selectedStaffs.length === 0
      ? "担当者: すべて"
      : selectedStaffs.length <= 2
        ? `担当者: ${selectedStaffs.join(", ")}`
        : `担当者: ${selectedStaffs.length}名選択中`;
  const notificationSummary =
    notificationTargetOptions.find((item) => item.id === notificationTarget)
      ?.label ?? "通知：自分の担当";

  return (
    <div className="flex min-h-0 w-full min-w-0 max-w-full flex-1 flex-col overflow-x-hidden pb-6">
      <div className="tiara-mobile-card mt-1 w-full min-w-0 max-w-full overflow-hidden border px-3 py-3">
        <label className="flex min-w-0 items-center gap-3">
          <Search className="h-4 w-4 text-slate-400" />
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="名前・担当・状態などをスペース区切りで検索"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
          />
        </label>
      </div>

      <div className="mt-3 w-full min-w-0 max-w-full">
        <div className="mb-2 flex min-w-0 items-center gap-2 text-xs font-semibold text-slate-500">
          <SlidersHorizontal className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate">{selectedStaffSummary}</span>
        </div>
        <div className="grid gap-2">
          <button
            type="button"
            onClick={() => setFilterOpen(true)}
            className="tiara-mobile-card flex w-full min-w-0 max-w-full items-center justify-between overflow-hidden border px-3 py-3 text-left"
          >
            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-700">
              担当者フィルタを開く
            </span>
            <span className="shrink-0 pl-3 text-xs text-slate-400">
              {selectedStaffs.length === 0 ? "未設定" : `${selectedStaffs.length}件選択`}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setNotificationOpen(true)}
            className="tiara-mobile-card flex w-full min-w-0 max-w-full items-center justify-between overflow-hidden border px-3 py-3 text-left"
          >
            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-700">
              通知設定を開く
            </span>
            <span className="shrink-0 pl-3 text-xs text-slate-400">
              {notificationSummary.replace(/^通知：/, "")}
            </span>
          </button>
        </div>
      </div>

      <div className="mt-4 flex min-h-0 w-full min-w-0 max-w-full flex-1 flex-col gap-3 overflow-x-hidden overflow-y-auto">
        {rooms.length > 0 ? (
          rooms.map((room) => (
            <ChatListItem
              key={room.id}
              room={room}
              pinned={pinnedRoomIds.includes(room.id)}
              onTogglePin={onTogglePin}
              onOpenProfile={onOpenProfile}
              profile={castProfiles[room.castId] ?? null}
              swipeOpen={activeSwipeRoomId === room.id}
              onSwipeOpenChange={(open) =>
                setActiveSwipeRoomId((current) => (open ? room.id : current === room.id ? null : current))
              }
            />
          ))
        ) : (
          <div className="tiara-mobile-card border px-4 py-8 text-center text-sm text-slate-500">
            条件に一致するトークがありません
          </div>
        )}
      </div>

      {filterOpen ? (
        <div className="fixed inset-0 z-[9999] flex items-end justify-center overflow-hidden bg-slate-900/35 px-3 pt-4">
          <div className="flex h-[calc(100dvh-16px)] w-full max-w-[420px] min-w-0 flex-col overflow-hidden rounded-t-[28px] bg-white px-4 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-4 shadow-2xl">
            <div className="mx-auto h-1.5 w-12 shrink-0 rounded-full bg-slate-200" />
            <div className="mt-4 flex shrink-0 items-center justify-between">
              <div className="min-w-0">
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

            <div className="mt-4 min-h-0 flex-1 touch-pan-y space-y-2 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]">
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
                    <span className="min-w-0 flex-1 truncate pr-3">{staff}</span>
                    <span className="text-xs">{active ? "選択中" : "未選択"}</span>
                  </button>
                );
              })}
            </div>

            <div className="mt-4 flex shrink-0 gap-2">
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
      {notificationOpen ? (
        <div className="fixed inset-0 z-[9999] flex items-end justify-center overflow-hidden bg-slate-900/35 px-3 pt-4">
          <div className="flex h-[calc(100dvh-16px)] w-full max-w-[420px] min-w-0 flex-col overflow-hidden rounded-t-[28px] bg-white px-4 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-4 shadow-2xl">
              <div className="mx-auto h-1.5 w-12 shrink-0 rounded-full bg-slate-200" />
              <div className="mt-4 flex shrink-0 items-center justify-between">
                <div className="min-w-0">
                  <p className="text-base font-bold text-slate-900">通知設定</p>
                  <p className="text-xs text-slate-500">チャット通知を受け取る担当範囲を選択します</p>
                </div>
                <button
                  type="button"
                  onClick={() => setNotificationOpen(false)}
                  className="rounded-full px-3 py-2 text-xs font-semibold text-slate-500"
                >
                  キャンセル
                </button>
              </div>

              <div className="mt-4 min-h-0 flex-1 touch-pan-y space-y-2 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]">
                {notificationTargetOptions.map((option) => {
                  const active = draftNotificationTarget === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setDraftNotificationTarget(option.id)}
                      className={`flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left text-sm font-semibold transition ${
                        active
                          ? "bg-[#0b8ef3]/10 text-[#0b8ef3]"
                          : "bg-slate-50 text-slate-700"
                      }`}
                    >
                      <span className="min-w-0 flex-1 truncate pr-3">
                        {option.label}
                      </span>
                      <span className="text-xs">{active ? "選択中" : ""}</span>
                    </button>
                  );
                })}
              </div>

              <div className="mt-4 flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setDraftNotificationTarget("mine");
                    onApplyNotificationTarget("mine");
                    setNotificationOpen(false);
                  }}
                  className="flex-1 rounded-2xl bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-600"
                >
                  自分担当
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onApplyNotificationTarget(draftNotificationTarget);
                    setNotificationOpen(false);
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
