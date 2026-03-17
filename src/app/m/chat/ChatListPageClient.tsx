"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { MobileShell } from "@/components/mobile/MobileShell";
import { MobileHeader } from "@/components/mobile/MobileHeader";
import { ChatList } from "@/components/mobile/ChatList";
import {
  fetchMobileChatRooms,
  getAuthSnapshot,
  readMobileChatRoomsCache,
  type MobileChatRoom,
} from "@/components/mobile/mobileApi";
import { getToken } from "@/lib/device";

function inferDefaultStaffs(rooms: MobileChatRoom[]) {
  const auth = getAuthSnapshot();
  const candidates = [auth.userName, auth.loginId]
    .map((value) => value.trim())
    .filter(Boolean);

  const matched = rooms
    .map((room) => room.staffName)
    .filter((staffName, index, array) => array.indexOf(staffName) === index)
    .filter((staffName) =>
      candidates.some((candidate) => staffName.includes(candidate)),
    );

  return matched;
}

export default function ChatListPageClient() {
  const [rooms, setRooms] = useState<MobileChatRoom[]>(() => readMobileChatRoomsCache());
  const [query, setQuery] = useState("");
  const [selectedStaffs, setSelectedStaffs] = useState<string[]>([]);
  const [loading, setLoading] = useState(rooms.length === 0);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (options?: { background?: boolean }) => {
    const background = options?.background ?? false;
    if (!background) {
      setLoading((current) => current || rooms.length === 0);
    }
    setError(null);
    try {
      const nextRooms = await fetchMobileChatRooms();
      setRooms(nextRooms);
      setSelectedStaffs((current) => {
        if (current.length > 0) return current;
        return inferDefaultStaffs(nextRooms);
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "読み込み失敗");
    } finally {
      if (!background) {
        setLoading(false);
      }
    }
  }, [rooms.length]);

  useEffect(() => {
    if (rooms.length > 0) {
      void load({ background: true });
      return;
    }
    void load();
  }, [load, rooms.length]);

  useEffect(() => {
    if (!getToken()) return;

    let active = true;
    let intervalId: number | null = null;

    const startPolling = () => {
      if (intervalId !== null) return;
      intervalId = window.setInterval(() => {
        if (document.visibilityState === "visible" && active) {
          void load({ background: true });
        }
      }, 10_000);
    };

    const stopPolling = () => {
      if (intervalId !== null) {
        window.clearInterval(intervalId);
        intervalId = null;
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void load({ background: true });
        startPolling();
        return;
      }
      stopPolling();
    };

    handleVisibilityChange();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      active = false;
      stopPolling();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [load]);

  const staffOptions = useMemo(
    () =>
      rooms
        .map((room) => room.staffName)
        .filter((value, index, array) => array.indexOf(value) === index)
        .sort((a, b) => a.localeCompare(b, "ja")),
    [rooms],
  );

  const filteredRooms = useMemo(() => {
    const lowered = query.trim().toLowerCase();
    return rooms.filter((room) => {
      if (selectedStaffs.length > 0 && !selectedStaffs.includes(room.staffName)) {
        return false;
      }

      if (!lowered) return true;
      return [
        room.castName,
        room.castCode,
        room.lastMessage,
        room.staffName,
      ].some((value) => value.toLowerCase().includes(lowered));
    });
  }, [query, rooms, selectedStaffs]);

  return (
    <MobileShell>
      <MobileHeader
        title="担当チャット"
        subtitle="自分担当を初期表示。担当者を複数選択で再絞り込みできます。"
        onRefresh={() => void load()}
      />
      {loading ? (
        <div className="flex flex-1 flex-col gap-3 px-4 py-4">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={index}
              className="tiara-mobile-card animate-pulse border px-4 py-4"
            >
              <div className="flex items-start gap-3">
                <div className="h-14 w-14 rounded-2xl bg-slate-200" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="h-4 w-32 rounded bg-slate-200" />
                      <div className="h-3 w-24 rounded bg-slate-100" />
                    </div>
                    <div className="h-3 w-14 rounded bg-slate-100" />
                  </div>
                  <div className="mt-3 h-3 w-10/12 rounded bg-slate-100" />
                  <div className="mt-3 flex gap-2">
                    <div className="h-6 w-16 rounded-full bg-slate-100" />
                    <div className="h-6 w-16 rounded-full bg-slate-100" />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="px-4 py-10 text-sm text-rose-500">{error}</div>
      ) : (
        <ChatList
          rooms={filteredRooms}
          query={query}
          onQueryChange={setQuery}
          staffOptions={staffOptions}
          selectedStaffs={selectedStaffs}
          onToggleStaff={(value) =>
            setSelectedStaffs((current) =>
              current.includes(value)
                ? current.filter((item) => item !== value)
                : [...current, value],
            )
          }
        />
      )}
    </MobileShell>
  );
}
