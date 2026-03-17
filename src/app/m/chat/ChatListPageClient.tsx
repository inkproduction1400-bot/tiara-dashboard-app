"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { MobileShell } from "@/components/mobile/MobileShell";
import { MobileHeader } from "@/components/mobile/MobileHeader";
import { ChatList } from "@/components/mobile/ChatList";
import {
  fetchMobileChatRooms,
  getAuthSnapshot,
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
  const [rooms, setRooms] = useState<MobileChatRoom[]>([]);
  const [query, setQuery] = useState("");
  const [selectedStaffs, setSelectedStaffs] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
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
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!getToken()) return;

    let active = true;
    let intervalId: number | null = null;

    const startPolling = () => {
      if (intervalId !== null) return;
      intervalId = window.setInterval(() => {
        if (document.visibilityState === "visible" && active) {
          void load();
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
        void load();
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
        <div className="px-4 py-10 text-sm text-slate-500">読み込み中...</div>
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
