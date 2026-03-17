"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { MobileShell } from "@/components/mobile/MobileShell";
import { MobileHeader } from "@/components/mobile/MobileHeader";
import { ChatList } from "@/components/mobile/ChatList";
import { MobileCastProfileSheet } from "@/components/mobile/MobileCastProfileSheet";
import {
  fetchMobileChatCastProfile,
  fetchMobileChatCastProfiles,
  fetchMobileChatRooms,
  getAuthSnapshot,
  readMobileChatCastProfileCache,
  readMobileChatRoomsCache,
  type MobileChatCastProfile,
  type MobileChatRoom,
} from "@/components/mobile/mobileApi";
import { getToken } from "@/lib/device";

const MOBILE_CHAT_PIN_STORAGE_KEY = "tiara:m:chat-pins:v1";

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
  const [pinnedRoomIds, setPinnedRoomIds] = useState<string[]>([]);
  const [castProfiles, setCastProfiles] = useState<Record<string, MobileChatCastProfile>>(
    () => readMobileChatCastProfileCache(),
  );
  const [profileRoom, setProfileRoom] = useState<MobileChatRoom | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [loading, setLoading] = useState(rooms.length === 0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(MOBILE_CHAT_PIN_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        setPinnedRoomIds(parsed.filter((value): value is string => typeof value === "string"));
      }
    } catch {
      // noop
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        MOBILE_CHAT_PIN_STORAGE_KEY,
        JSON.stringify(pinnedRoomIds),
      );
    } catch {
      // noop
    }
  }, [pinnedRoomIds]);

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

  useEffect(() => {
    let active = true;

    void fetchMobileChatCastProfiles(rooms, castProfiles).then((nextProfiles) => {
      if (!active) return;
      if (nextProfiles !== castProfiles) {
        setCastProfiles(nextProfiles);
      }
      setRooms((current) => {
        const nextRooms = current.map((room) => ({
          ...room,
          photoUrl: nextProfiles[room.castId]?.photoUrl ?? room.photoUrl,
        }));
        const changed = nextRooms.some(
          (room, index) => room.photoUrl !== current[index]?.photoUrl,
        );
        return changed ? nextRooms : current;
      });
    });

    return () => {
      active = false;
    };
  }, [castProfiles, rooms]);

  const staffOptions = useMemo(
    () =>
      rooms
        .map((room) => room.staffName)
        .filter((value, index, array) => array.indexOf(value) === index)
        .sort((a, b) => a.localeCompare(b, "ja")),
    [rooms],
  );

  const searchableRooms = useMemo(
    () =>
      rooms.map((room) => ({
        room,
        searchableText: [
          room.castName,
          room.castCode,
          room.staffName,
          room.lastMessage,
          room.assignmentStatus,
          room.shiftStatus,
          room.genreText,
          room.wageText,
        ]
          .join(" ")
          .trim()
          .toLowerCase(),
      })),
    [rooms],
  );

  const filteredRooms = useMemo(() => {
    const tokens = query
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);

    return searchableRooms
      .filter(({ room, searchableText }) => {
        if (selectedStaffs.length > 0 && !selectedStaffs.includes(room.staffName)) {
          return false;
        }

        if (tokens.length === 0) return true;
        return tokens.every((token) => searchableText.includes(token));
      })
      .map(({ room }) => room);
  }, [query, searchableRooms, selectedStaffs]);

  const sortedRooms = useMemo(() => {
    const pinnedSet = new Set(pinnedRoomIds);

    return [...filteredRooms].sort((left, right) => {
      const leftPinned = pinnedSet.has(left.id) ? 1 : 0;
      const rightPinned = pinnedSet.has(right.id) ? 1 : 0;
      if (leftPinned !== rightPinned) {
        return rightPinned - leftPinned;
      }

      return (
        new Date(right.lastMessageAt).getTime() -
        new Date(left.lastMessageAt).getTime()
      );
    });
  }, [filteredRooms, pinnedRoomIds]);

  const togglePinnedRoom = useCallback((roomId: string) => {
    setPinnedRoomIds((current) =>
      current.includes(roomId)
        ? current.filter((item) => item !== roomId)
        : [...current, roomId],
    );
  }, []);

  const applySelectedStaffs = useCallback((values: string[]) => {
    setSelectedStaffs(values);
  }, []);

  const handleOpenProfile = useCallback(
    (room: MobileChatRoom) => {
      setProfileRoom(room);
      if (castProfiles[room.castId]) return;

      setProfileLoading(true);
      void fetchMobileChatCastProfile(room)
        .then((profile) => {
          setCastProfiles((current) => ({
            ...current,
            [room.castId]: profile,
          }));
          setRooms((current) =>
            current.map((item) =>
              item.castId === room.castId
                ? { ...item, photoUrl: profile.photoUrl ?? item.photoUrl }
                : item,
            ),
          );
        })
        .finally(() => {
          setProfileLoading(false);
        });
    },
    [castProfiles],
  );

  return (
    <MobileShell edgeToEdge>
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
          rooms={sortedRooms}
          query={query}
          onQueryChange={setQuery}
          staffOptions={staffOptions}
          selectedStaffs={selectedStaffs}
          onApplyStaffs={applySelectedStaffs}
          onTogglePin={togglePinnedRoom}
          pinnedRoomIds={pinnedRoomIds}
          onOpenProfile={handleOpenProfile}
          castProfiles={castProfiles}
        />
      )}
      <MobileCastProfileSheet
        open={Boolean(profileRoom)}
        profile={profileRoom ? castProfiles[profileRoom.castId] ?? null : null}
        loading={profileLoading}
        onClose={() => {
          setProfileLoading(false);
          setProfileRoom(null);
        }}
      />
    </MobileShell>
  );
}
