// src/app/chat/ChatPageClient.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import AppShell from "@/components/AppShell";
import clsx from "clsx";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { API_BASE } from "@/lib/api";

type Staff = {
  id: string;
  name: string;
};

type ChatPreview = {
  /**
   * API 連動では chat_rooms.id (= roomId) を入れる（UI の主キー）
   */
  id: string; // roomId

  /**
   * API 連動では casts.user_id (= castId) を保持する
   * ※スタッフ側メッセージ取得APIが /chat/rooms/:castId/messages のため
   */
  castId: string;

  castName: string;
  castCode: string;
  age: number;
  genre: string;
  lastMessage: string;
  lastMessageAt: string; // ISO string
  unreadCount: number;

  staffId: string;
  staffName: string;

  drinkLevel?: "none" | "weak" | "ok" | "unknown";
  hasTodayShift?: boolean;
  hasTodayApprovedShift?: boolean;
  desiredHourly?: number;
  managementNumber?: string;
};

type ChatMessage = {
  id: string;
  from: "staff" | "cast";
  text: string;
  sentAt: string;
  read?: boolean;
};

const DUMMY_STAFFS: Staff[] = [
  { id: "s1", name: "北村（本部）" },
  { id: "s2", name: "山本（コーディネーター）" },
  { id: "s3", name: "永井（システム）" },
];

const GENRES = ["キャバクラ", "スナック", "ガールズバー"] as const;

/**
 * スクロール挙動確認用に 100 件分のダミー会話を生成
 */
const DUMMY_CHATS: ChatPreview[] = Array.from({ length: 100 }, (_, i) => {
  const index = i + 1;
  const staff = DUMMY_STAFFS[i % DUMMY_STAFFS.length];
  const minute = (25 - i + 60) % 60;
  const mm = minute.toString().padStart(2, "0");
  const genre = GENRES[i % GENRES.length];

  return {
    id: `c${index}`, // dummy roomId
    castId: `dummy-cast-${index}`, // dummy castId
    castName: `キャスト${index.toString().padStart(3, "0")}`,
    castCode: `T${index.toString().padStart(4, "0")}`,
    age: 20 + (i % 10),
    genre,
    lastMessage:
      index % 3 === 1
        ? "本日20時入りでお願いします！"
        : index % 3 === 2
          ? "お店到着しました！"
          : "明日の出勤時間なんですが…",
    lastMessageAt: `2025-11-30T18:${mm}:00+09:00`,
    unreadCount: index % 5 === 0 ? 3 : index % 4 === 0 ? 1 : 0,
    staffId: staff.id,
    staffName: staff.name,
  };
});

/**
 * デモ用メッセージ（実際は会話ごとにAPIから取得する想定）
 */
const BASE_MESSAGES: ChatMessage[] = [
  {
    id: "m1",
    from: "cast",
    text: "本日20時入りでお願いします！",
    sentAt: "2025-11-30T18:25:00+09:00",
  },
  {
    id: "m2",
    from: "staff",
    text: "了解しました！20時で登録しておきますね。",
    sentAt: "2025-11-30T18:26:00+09:00",
  },
  {
    id: "m3",
    from: "cast",
    text: "ありがとうございます！",
    sentAt: "2025-11-30T18:27:00+09:00",
  },
];

function makeDummyMessages(chat: ChatPreview | null): ChatMessage[] {
  if (!chat) return [];
  return BASE_MESSAGES.map((m, idx) => ({
    ...m,
    id: `${chat.id}-${m.id}`,
    text:
      idx === 0
        ? `${chat.castName} です。${m.text}`
        : idx === 2
          ? `${m.text}`
          : m.text,
  }));
}

function formatTimeLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const hh = d.getHours().toString().padStart(2, "0");
  const mm = d.getMinutes().toString().padStart(2, "0");
  return `${hh}:${mm}`;
}

/**
 * ========= API Helpers =========
 */
function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;

  const primary = localStorage.getItem("access_token");
  if (primary) return primary;

  return (
    localStorage.getItem("tiara_token") ||
    localStorage.getItem("tiara_access_token") ||
    localStorage.getItem("tiara_access_token_v2") ||
    localStorage.getItem("tiara_accessToken") ||
    localStorage.getItem("accessToken") ||
    localStorage.getItem("token") ||
    null
  );
}

function getApiBase(): string {
  return API_BASE;
}

async function apiFetch<T>(
  path: string,
  init?: RequestInit,
  opts?: { signal?: AbortSignal },
): Promise<T> {
  const base = getApiBase();
  const token = getAuthToken();

  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      ...(init?.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    signal: opts?.signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `API ${res.status} ${res.statusText}: ${text || "(no body)"}`,
    );
  }

  return (await res.json()) as T;
}

/**
 * ========= API Types (最小限) =========
 */
type ApiRoom = {
  id: string; // roomId
  castId?: string;
  cast_id?: string;
  castUserId?: string;
  createdAt?: string | null;
  updatedAt?: string | null;
  staffLastReadAt?: string | null;
  cast?: {
    userId?: string;
    castCode?: string;
    managementNumber?: string;
    ownerStaffName?: string | null;
    displayName?: string | null;
    age?: number | null;
    genre?: string | null;
    drinkOk?: boolean | null;
    status?: string | null;
    attributes?: { drinkLevel?: "none" | "weak" | "ok" | null }[] | null;
    cast_background?: { genres?: string | null }[] | null;
    shifts?: { status?: string | null }[] | null;
    preferences?: { desiredHourly?: number | null }[] | null;
  } | null;
  lastMessage?: {
    text?: string | null;
    createdAt?: string | null;
  } | null;
  messages?: ApiMessage[] | null;
};

type ApiRoomsResponse = ApiRoom[];

type ApiMessage = {
  id: string;
  roomId: string;
  text: string;
  createdAt: string;
  sender?: { userType?: string } | null;
  readByCast?: boolean;
  readByStaff?: boolean;
};

type ApiMessagesResponse = ApiMessage[];

type ApiUnreadResponse = {
  roomId: string;
  unreadForCast: number;
  unreadForStaff: number;
};

type SortKey = "default" | "hourlyDesc" | "ageAsc" | "ageDesc";
type DrinkSort = "none" | "okFirst" | "ngFirst";
type CastGenre = "club" | "cabaret" | "snack" | "gb";
type AgeRangeFilter =
  | ""
  | "18-19"
  | "20-24"
  | "25-29"
  | "30-34"
  | "35-39"
  | "40-49"
  | "50-";

const STAFF_FILTERS = [
  { id: "all", label: "担当者" },
  { id: "nagai", label: "永井" },
  { id: "kitamura", label: "北村" },
];

type ApiSummaryResponse = {
  unreadNotifications: number;
  counts: Record<string, number>;
};

// 送信レスポンス（cast-app側のログを見る限りこの形）
type ApiSendMessageResponse = {
  id: string;
  roomId: string;
  senderUserId: string;
  text: string;
  createdAt: string;
  sender?: {
    id?: string;
    userType?: string;
    email?: string | null;
    loginId?: string | null;
  } | null;
};

function pickCastIdFromRoom(r: ApiRoom): string {
  const castId =
    (typeof r.castId === "string" && r.castId) ||
    (typeof r.cast_id === "string" && r.cast_id) ||
    (typeof r.castUserId === "string" && r.castUserId) ||
    (typeof r.cast?.userId === "string" && r.cast.userId) ||
    "";
  return castId;
}

function ChatContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [keyword, setKeyword] = useState<string>("");
  const [staffFilter, setStaffFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("default");
  const [drinkSort, setDrinkSort] = useState<DrinkSort>("none");
  const [castGenreFilter, setCastGenreFilter] = useState<CastGenre | "">("");
  const [ageRangeFilter, setAgeRangeFilter] = useState<AgeRangeFilter>("");
  const [sortKana, setSortKana] = useState(false);
  const [sortNumberSmallFirst, setSortNumberSmallFirst] = useState(false);
  const [sortNumberLargeFirst, setSortNumberLargeFirst] = useState(false);

  const [rooms, setRooms] = useState<ChatPreview[]>([]);
  const [roomsLoaded, setRoomsLoaded] = useState<boolean>(false);

  const selectedRoomIdFromUrl = searchParams.get("roomId");

  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(() => {
    return selectedRoomIdFromUrl || null;
  });

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messagesLoaded, setMessagesLoaded] = useState<boolean>(false);

  const lastMarkedReadRoomIdRef = useRef<string | null>(null);

  // ====== 送信UI ======
  const [draft, setDraft] = useState<string>("");
  const [sending, setSending] = useState<boolean>(false);
  const sendAbortRef = useRef<AbortController | null>(null);

  // ====== スクロール追従（最下部） ======
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const pollingInFlightRef = useRef(false);

  const scrollToBottom = (behavior: ScrollBehavior = "auto") => {
    const el = messagesEndRef.current;
    if (!el) return;
    el.scrollIntoView({ behavior, block: "end" });
  };

  const filteredChats = useMemo(() => {
    let list = rooms;

    if (keyword.trim()) {
      const q = keyword.trim();
      list = list.filter((c) => {
        const code = c.castCode || "";
        const name = c.castName || "";
        const num = c.managementNumber || "";
        return (
          name.includes(q) ||
          code.includes(q) ||
          num.includes(q)
        );
      });
    }

    if (staffFilter !== "all") {
      list = list.filter((c) => {
        const staff = c.staffName || "";
        if (staffFilter === "nagai") return staff.includes("永井");
        if (staffFilter === "kitamura") return staff.includes("北村");
        return true;
      });
    }

    if (castGenreFilter) {
      list = list.filter((c) => {
        const g = c.genre;
        if (castGenreFilter === "club") return g.includes("クラブ");
        if (castGenreFilter === "cabaret")
          return g.includes("キャバ");
        if (castGenreFilter === "snack") return g.includes("スナック");
        if (castGenreFilter === "gb") return g.includes("ガルバ");
        return false;
      });
    }

    if (ageRangeFilter) {
      list = list.filter((c) => {
        const age = Number(c.age ?? 0);
        if (ageRangeFilter === "18-19") return age >= 18 && age <= 19;
        if (ageRangeFilter === "20-24") return age >= 20 && age <= 24;
        if (ageRangeFilter === "25-29") return age >= 25 && age <= 29;
        if (ageRangeFilter === "30-34") return age >= 30 && age <= 34;
        if (ageRangeFilter === "35-39") return age >= 35 && age <= 39;
        if (ageRangeFilter === "40-49") return age >= 40 && age <= 49;
        if (ageRangeFilter === "50-") return age >= 50;
        return true;
      });
    }

    const drinkScore = (c: ChatPreview) => {
      const level = c.drinkLevel ?? "unknown";
      if (level === "ok") return 2;
      if (level === "weak") return 1;
      if (level === "none") return 0;
      return -1;
    };

    const numberValue = (c: ChatPreview) => {
      const raw =
        c.managementNumber ||
        c.castCode ||
        "";
      const m = raw.match(/\d+/);
      return m ? Number(m[0]) : 0;
    };

    const byName = (a: ChatPreview, b: ChatPreview) =>
      (a.castName || "").localeCompare(b.castName || "");

    const byAge = (a: ChatPreview, b: ChatPreview) =>
      Number(a.age ?? 0) - Number(b.age ?? 0);

    const byHourly = (a: ChatPreview, b: ChatPreview) =>
      Number(a.desiredHourly ?? 0) - Number(b.desiredHourly ?? 0);

    const byDrink = (a: ChatPreview, b: ChatPreview) =>
      drinkScore(a) - drinkScore(b);

    list = [...list].sort((a, b) => {
      const aTime = new Date(a.lastMessageAt || 0).getTime();
      const bTime = new Date(b.lastMessageAt || 0).getTime();
      if (aTime !== bTime) {
        return bTime - aTime;
      }
      if (sortNumberSmallFirst) {
        return numberValue(a) - numberValue(b);
      }
      if (sortNumberLargeFirst) {
        return numberValue(b) - numberValue(a);
      }
      if (sortKana) {
        return byName(a, b);
      }
      if (sortKey === "hourlyDesc") {
        return byHourly(b, a);
      }
      if (sortKey === "ageAsc") {
        return byAge(a, b);
      }
      if (sortKey === "ageDesc") {
        return byAge(b, a);
      }
      if (drinkSort === "okFirst") {
        return byDrink(b, a);
      }
      if (drinkSort === "ngFirst") {
        return byDrink(a, b);
      }
      return 0;
    });

    return list;
  }, [
    rooms,
    keyword,
    staffFilter,
    sortKey,
    drinkSort,
    castGenreFilter,
    ageRangeFilter,
    sortKana,
    sortNumberSmallFirst,
    sortNumberLargeFirst,
  ]);

  const markStaffRead = async (roomId: string, signal?: AbortSignal) => {
    if (lastMarkedReadRoomIdRef.current === roomId) return;

    try {
      await apiFetch<ApiUnreadResponse>(
        `/me/notifications/mark-staff-talk-read/${roomId}`,
        { method: "POST" },
        { signal },
      );

      lastMarkedReadRoomIdRef.current = roomId;

      setRooms((prev) =>
        prev.map((r) => (r.id === roomId ? { ...r, unreadCount: 0 } : r)),
      );

      const summary = await apiFetch<ApiSummaryResponse>(
        "/me/notifications/summary",
        { method: "GET" },
        { signal },
      );

      if (typeof window !== "undefined" && !signal?.aborted) {
        window.dispatchEvent(
          new CustomEvent("tiara:notification-summary", { detail: summary }),
        );
      }
    } catch {
      // ignore
    }
  };

  const selectedChat: ChatPreview | null =
    useMemo(
      () => rooms.find((c) => c.id === selectedRoomId) ?? null,
      [rooms, selectedRoomId],
    ) ?? null;

  // URL → state 追従
  useEffect(() => {
    if (!selectedRoomIdFromUrl) return;
    if (selectedRoomIdFromUrl !== selectedRoomId) {
      setSelectedRoomId(selectedRoomIdFromUrl);
    }
  }, [selectedRoomIdFromUrl, selectedRoomId]);

  // rooms load
  useEffect(() => {
    let mounted = true;
    const ac = new AbortController();

    (async () => {
      try {
        const apiRooms = await apiFetch<ApiRoomsResponse>(
          "/chat/staff/rooms",
          { method: "GET" },
          { signal: ac.signal },
        );

        if (!mounted) return;

        const mappedBase: ChatPreview[] = apiRooms.map((r, idx) => {
          const castId = pickCastIdFromRoom(r);

          const displayName =
            r.cast?.displayName ??
            (r.cast?.castCode
              ? `キャスト(${r.cast.castCode})`
              : castId
                ? `キャスト(${castId.slice(0, 6)}…)`
                : `キャスト${idx + 1}`);

          const castCode = r.cast?.castCode ?? "-";
          const managementNumber = r.cast?.managementNumber ?? undefined;
          const age = typeof r.cast?.age === "number" ? r.cast.age ?? 0 : 0;
          const rawGenres = r.cast?.cast_background?.[0]?.genres ?? "";
          const genre = rawGenres.includes("キャバ")
            ? "キャバクラ"
            : rawGenres.includes("クラブ")
              ? "クラブ"
              : rawGenres.includes("スナック")
                ? "スナック"
                : rawGenres.includes("ガールズバー") ||
                    rawGenres.includes("ガルバ")
                  ? "ガールズバー"
                  : "未設定";
          const drinkLevelRaw =
            r.cast?.attributes?.[0]?.drinkLevel ??
            (r.cast?.drinkOk ? "ok" : "none");
          const drinkLevel =
            drinkLevelRaw === "none" ||
            drinkLevelRaw === "weak" ||
            drinkLevelRaw === "ok"
              ? drinkLevelRaw
              : "unknown";
          const shiftStatuses = (r.cast?.shifts ?? [])
            .map((s) => s.status ?? "")
            .filter(Boolean);
          const hasApprovedShift = shiftStatuses.includes("approved");
          const hasTodayShift =
            hasApprovedShift || shiftStatuses.includes("planned");
          const desiredHourly =
            r.cast?.preferences?.[0]?.desiredHourly ?? undefined;

          const fallbackMessages = Array.isArray(r.messages) ? r.messages : [];
          const latestFallback = [...fallbackMessages]
            .filter((m) => m?.createdAt)
            .sort(
              (a, b) =>
                new Date(b.createdAt || 0).getTime() -
                new Date(a.createdAt || 0).getTime(),
            )[0];

          const lastMessageText =
            latestFallback?.text?.toString().trim() ||
            r.lastMessage?.text?.toString().trim() ||
            "（メッセージなし）";

          const lastMessageAt =
            latestFallback?.createdAt ||
            r.lastMessage?.createdAt ||
            r.updatedAt ||
            r.createdAt ||
            "1970-01-01T00:00:00.000Z";

          const hasUnreadFromCast =
            latestFallback?.createdAt &&
            latestFallback.sender?.userType === "cast" &&
            (!r.staffLastReadAt ||
              new Date(latestFallback.createdAt) >
                new Date(r.staffLastReadAt));
          const initialUnread = hasUnreadFromCast ? 1 : 0;

          const staffName = r.cast?.ownerStaffName ?? "担当者";

          return {
            id: r.id,
            castId,
            castName: displayName,
            castCode,
            managementNumber,
            age,
            genre,
            lastMessage: lastMessageText,
            lastMessageAt,
            unreadCount: initialUnread,
            staffId: staffName,
            staffName,
            drinkLevel,
            hasTodayShift,
            hasTodayApprovedShift: hasApprovedShift,
            desiredHourly,
          };
        });

        setRooms(mappedBase);
        setRoomsLoaded(true);

        if (!selectedRoomIdFromUrl && mappedBase[0]?.id) {
          const p = new URLSearchParams(Array.from(searchParams.entries()));
          p.set("roomId", mappedBase[0].id);
          router.replace(`${pathname}?${p.toString()}`);
        }

        const targets = mappedBase.slice(0, 200);
        const results = await Promise.allSettled(
          targets.map((room) =>
            apiFetch<ApiUnreadResponse>(
              `/chat/staff/rooms/${room.id}/unread`,
              { method: "GET" },
              { signal: ac.signal },
            ).then((counts) => ({
              roomId: room.id,
              unreadForStaff: counts.unreadForStaff,
            })),
          ),
        );

        if (!mounted || ac.signal.aborted) return;

        const unreadMap = new Map<string, number>();
        for (const r of results) {
          if (r.status === "fulfilled") {
            unreadMap.set(
              r.value.roomId,
              Math.max(0, Number(r.value.unreadForStaff) || 0),
            );
          }
        }

        if (unreadMap.size > 0) {
          setRooms((prev) =>
            prev.map((room) =>
              unreadMap.has(room.id)
                ? { ...room, unreadCount: unreadMap.get(room.id)! }
                : room,
            ),
          );
        }
      } catch (e) {
        setRooms([]);
        setRoomsLoaded(true);
      }
    })();

    return () => {
      mounted = false;
      ac.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ルーム選択時：messages GET + staff既読POST + summary dispatch + 初回スクロール最下部
  useEffect(() => {
    if (!selectedChat?.id) {
      setMessages([]);
      setMessagesLoaded(false);
      return;
    }

    const roomId = selectedChat.id;
    const castId = selectedChat.castId;

    setMessagesLoaded(false);
    const ac = new AbortController();

    (async () => {
      try {
        if (!castId) throw new Error("castId is missing");

        const apiMsgs = await apiFetch<ApiMessagesResponse>(
          `/chat/staff/rooms/${castId}/messages?limit=50`,
          { method: "GET" },
          { signal: ac.signal },
        );

        const mapped: ChatMessage[] = apiMsgs.map((m) => {
          const from = m.sender?.userType === "cast" ? "cast" : "staff";
          return {
            id: m.id,
            from,
            text: m.text,
            sentAt: m.createdAt,
            read: from === "staff" ? Boolean(m.readByCast) : undefined,
          };
        });

        if (!ac.signal.aborted) {
          setMessages(mapped);
          setMessagesLoaded(true);

          // 取得直後に最下部へ（LINEっぽさ）
          requestAnimationFrame(() => scrollToBottom("auto"));
        }
      } catch (e) {
        if (!ac.signal.aborted) {
          setMessages([]);
          setMessagesLoaded(true);
        }
      }
    })();

    void markStaffRead(roomId, ac.signal);

    return () => {
      ac.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedChat?.id]);

  // ポーリング（5秒ごとに最新メッセージ/サマリー取得）
  useEffect(() => {
    if (!selectedChat?.id || !selectedChat.castId) return;

    const roomId = selectedChat.id;
    const castId = selectedChat.castId;
    let cancelled = false;

    const tick = async () => {
      if (cancelled || pollingInFlightRef.current) return;
      pollingInFlightRef.current = true;
      try {
        const ac = new AbortController();
        await markStaffRead(roomId, ac.signal);
        await refreshMessagesAndSummary({
          roomId,
          castId,
          signal: ac.signal,
          scroll: false,
        });
      } finally {
        pollingInFlightRef.current = false;
      }
    };

    // 初回即時
    void tick();
    const timer = setInterval(() => void tick(), 5000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedChat?.id, selectedChat?.castId]);

  const handleSelectChat = (roomId: string) => {
    const p = new URLSearchParams(Array.from(searchParams.entries()));
    p.set("roomId", roomId);
    router.push(`${pathname}?${p.toString()}`);
    setSelectedRoomId(roomId);
  };

  const handleNewChat = () => {
    // TODO: 新規チャット作成モーダルなどを後で実装
  };

  async function refreshMessagesAndSummary(params: {
    roomId: string;
    castId: string;
    signal?: AbortSignal;
    scroll?: boolean;
  }): Promise<void> {
    const { roomId, castId, signal } = params;
    const shouldScroll = Boolean(params.scroll);

    try {
      const apiMsgs = await apiFetch<ApiMessagesResponse>(
        `/chat/staff/rooms/${castId}/messages?limit=50`,
        { method: "GET" },
        { signal },
      );

      const mapped: ChatMessage[] = apiMsgs.map((m) => {
        const from = m.sender?.userType === "cast" ? "cast" : "staff";
        return {
          id: m.id,
          from,
          text: m.text,
          sentAt: m.createdAt,
          read: from === "staff" ? Boolean(m.readByCast) : undefined,
        };
      });

      if (!signal?.aborted) {
        setMessages(mapped);
        setMessagesLoaded(true);

        if (shouldScroll) {
          requestAnimationFrame(() => scrollToBottom("auto"));
        }
      }
    } catch {
      // ignore
    }

    try {
      const summary = await apiFetch<ApiSummaryResponse>(
        "/me/notifications/summary",
        { method: "GET" },
        { signal },
      );

      if (typeof window !== "undefined" && !signal?.aborted) {
        window.dispatchEvent(
          new CustomEvent("tiara:notification-summary", { detail: summary }),
        );
      }
    } catch {
      // ignore
    }

    // 送信後は「開いてるルーム」なので、未読0を維持したい
    setRooms((prev) =>
      prev.map((r) => (r.id === roomId ? { ...r, unreadCount: 0 } : r)),
    );
  }

  const handleSend = async () => {
    if (!selectedChat) return;
    if (sending) return;

    const roomId = selectedChat.id;
    const castId = selectedChat.castId;

    const text = draft.trim();
    if (!text) return;

    // castId が無い場合は送信不可（API仕様上）
    if (!castId) {
      return;
    }

    try {
      sendAbortRef.current?.abort();
    } catch {
      // ignore
    }
    const ac = new AbortController();
    sendAbortRef.current = ac;

    setSending(true);

    // 体感用：楽観的に表示へ追加（LINEっぽさ）
    const optimisticId = `optimistic-${Date.now()}`;
    const optimisticSentAt = new Date().toISOString();

    setMessages((prev) => [
      ...prev,
      {
        id: optimisticId,
        from: "staff",
        text,
        sentAt: optimisticSentAt,
      },
    ]);

    // 追加直後は最下部へ（送信感を出す）
    requestAnimationFrame(() => scrollToBottom("smooth"));

    // 左一覧の最終メッセージも先に更新（体感）
    setRooms((prev) =>
      prev.map((r) =>
        r.id === roomId
          ? {
              ...r,
              lastMessage: text,
              lastMessageAt: optimisticSentAt,
              unreadCount: 0,
            }
          : r,
      ),
    );

    setDraft("");

    try {
      const res = await apiFetch<ApiSendMessageResponse>(
        `/chat/staff/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ castId, text }),
        },
        { signal: ac.signal },
      );

      if (!ac.signal.aborted) {
        // 左一覧をサーバー時刻に寄せる
        setRooms((prev) =>
          prev.map((r) =>
            r.id === roomId
              ? {
                  ...r,
                  lastMessage: res.text || text,
                  lastMessageAt: res.createdAt || optimisticSentAt,
                  unreadCount: 0,
                }
              : r,
          ),
        );
      }

      // 送信後：右メッセージ再フェッチ & summary再フェッチ→dispatch
      await refreshMessagesAndSummary({
        roomId,
        castId,
        signal: ac.signal,
        scroll: true,
      });

      // 念押し：送信後も最下部へ（スムーズ）
      requestAnimationFrame(() => scrollToBottom("smooth"));
    } catch (e) {
      // 失敗時：最新状態へ寄せる
      await refreshMessagesAndSummary({
        roomId,
        castId,
        signal: ac.signal,
        scroll: false,
      }).catch(() => {});
    } finally {
      if (!ac.signal.aborted) {
        setSending(false);
      }
    }
  };

  const canSend = Boolean(selectedChat) && Boolean(draft.trim()) && !sending;

  return (
    <div className="flex flex-col gap-3 h-[calc(100vh-120px)]">
      {/* 上部：絞り込み（横並び） */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          className="tiara-input rounded-none h-8 !w-[200px] text-[10px] leading-tight flex-none"
          placeholder="管理番号・名前・旧ID"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />

        <select
          className="tiara-input rounded-none h-9 !w-[140px] text-[11px] leading-snug flex-none"
          value={staffFilter}
          onChange={(e) => setStaffFilter(e.target.value)}
        >
          {STAFF_FILTERS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>

        <select
          className="tiara-input rounded-none h-9 !w-[180px] text-[11px] leading-snug flex-none"
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
        >
          <option value="default">並び替え</option>
          <option value="hourlyDesc">時給が高い順</option>
          <option value="ageAsc">年齢が若い順</option>
          <option value="ageDesc">年齢が高い順</option>
        </select>

        <select
          className="tiara-input rounded-none h-9 !w-[170px] text-[11px] leading-snug flex-none"
          value={drinkSort}
          onChange={(e) => setDrinkSort(e.target.value as DrinkSort)}
        >
          <option value="none">飲酒</option>
          <option value="okFirst">飲める順</option>
          <option value="ngFirst">飲めない順</option>
        </select>

        <select
          className="tiara-input rounded-none h-9 !w-[140px] text-[11px] leading-snug flex-none"
          value={castGenreFilter}
          onChange={(e) =>
            setCastGenreFilter((e.target.value || "") as CastGenre | "")
          }
        >
          <option value="">ジャンル</option>
          <option value="club">クラブ</option>
          <option value="cabaret">キャバ</option>
          <option value="snack">スナック</option>
          <option value="gb">ガルバ</option>
        </select>

        <select
          className="tiara-input rounded-none h-9 !w-[140px] text-[11px] leading-snug flex-none"
          value={ageRangeFilter}
          onChange={(e) => setAgeRangeFilter(e.target.value as AgeRangeFilter)}
        >
          <option value="">年齢レンジ</option>
          <option value="18-19">18〜19歳</option>
          <option value="20-24">20〜24歳</option>
          <option value="25-29">25〜29歳</option>
          <option value="30-34">30〜34歳</option>
          <option value="35-39">35〜39歳</option>
          <option value="40-49">40〜49歳</option>
          <option value="50-">50歳以上</option>
        </select>

        <label className="inline-flex items-center gap-1 text-[10px]">
          <input
            type="checkbox"
            className="h-3 w-3"
            checked={sortKana}
            onChange={(e) => setSortKana(e.target.checked)}
          />
          50音
        </label>
        <label className="inline-flex items-center gap-1 text-[10px]">
          <input
            type="checkbox"
            className="h-3 w-3"
            checked={sortNumberSmallFirst}
            onChange={(e) => setSortNumberSmallFirst(e.target.checked)}
          />
          番号↑
        </label>
        <label className="inline-flex items-center gap-1 text-[10px]">
          <input
            type="checkbox"
            className="h-3 w-3"
            checked={sortNumberLargeFirst}
            onChange={(e) => setSortNumberLargeFirst(e.target.checked)}
          />
          番号↓
        </label>
      </div>

      {/* 下部：一覧 + チャット本体（左右 1:1） */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 flex-1 min-h-0">
        {/* 左カラム：チャット一覧（2列グリッド＋スクロール） */}
        <div className="border rounded-xl bg-background/60 shadow-sm flex flex-col min-h-0">
          <div className="px-3 py-2 border-b text-xs text-muted flex items-center justify-between">
            <span>
              会話一覧{" "}
              <span className="text-[10px] text-muted/80">
                （{filteredChats.length} 件）
              </span>
            </span>
            <span className="text-[10px] text-muted/70">
              {roomsLoaded ? "loaded" : "loading..."}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto pr-1">
            {filteredChats.length === 0 ? (
              <div className="p-4 text-xs text-muted">
                該当する会話はありません。
              </div>
            ) : (
              <div className="p-2">
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-2">
                  {filteredChats.map((chat) => {
                    const isActive = chat.id === selectedRoomId;
                    return (
                      <button
                        key={chat.id}
                        type="button"
                        onClick={() => handleSelectChat(chat.id)}
                        className={clsx(
                          "relative w-full text-left rounded-lg border bg-white/70 px-3 py-2.5 flex items-start gap-3 hover:bg-ink/40 transition-colors",
                          isActive && "border-accent bg-ink/80",
                        )}
                      >
                        {chat.unreadCount > 0 && (
                          <span className="absolute top-2 right-2 inline-flex min-w-[16px] h-[16px] px-1 items-center justify-center rounded-full bg-rose-500 text-[9px] font-semibold text-white leading-none">
                            {chat.unreadCount > 99 ? "99+" : chat.unreadCount}
                          </span>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items=center justify-between gap-2">
                            <div className="min-w-0">
                              <div className="text-xs font-semibold truncate">
                                {chat.castName}
                              </div>
                              <div className="text-[10px] text-muted truncate">
                                担当: {chat.staffName}
                              </div>
                            </div>
                            <div className="flex flex-col items-end gap-1">
                              <span className="text-[10px] text-muted">
                                {formatTimeLabel(chat.lastMessageAt)}
                              </span>
                            </div>
                          </div>
                          <div className="mt-1 text-[11px] text-muted/90 line-clamp-2">
                            {chat.lastMessage}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 右カラム：チャット本体（LINE 風） */}
        <div className="border rounded-xl bg-background/60 shadow-sm flex flex-col min-h-0">
          {/* 固定ヘッダー：プロフィール＋タイトル */}
          <div className="px-4 py-3 border-b flex items-center justify-between gap-3">
            {selectedChat ? (
              <>
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center text-[12px] font-semibold text-accent flex-shrink-0">
                    {selectedChat.castName.slice(0, 2)}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="text-sm font-semibold truncate">
                        {selectedChat.castName}
                      </div>
                      <span className="text-[11px] text-muted shrink-0">
                        ID: {selectedChat.castCode}
                      </span>
                    </div>
                    <div className="mt-0.5 text-[11px] text-muted truncate">
                      年齢: {selectedChat.age}歳　/　ジャンル:{" "}
                      {selectedChat.genre}
                    </div>
                    <div className="mt-0.5 text-[10px] text-muted/70 truncate">
                      roomId: {selectedChat.id}
                    </div>
                  </div>
                </div>
                <div className="text-[10px] text-muted whitespace-nowrap text-right">
                  {formatTimeLabel(selectedChat.lastMessageAt)} 更新
                  <br />
                  担当: {selectedChat.staffName}
                </div>
              </>
            ) : (
              <div className="text-xs text-muted">
                左側の一覧から会話を選択すると、こちらにチャット内容が表示されます。
              </div>
            )}
          </div>

          {/* メッセージリスト（LINE風 吹き出し） */}
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2 bg-gradient-to-b from-transparent to-white/40">
            {selectedChat && messages.length > 0 ? (
              <>
                {messages.map((msg) => {
                  const isStaff = msg.from === "staff";
                  return (
                    <div
                      key={msg.id}
                      className={clsx(
                        "flex w-full",
                        isStaff ? "justify-end" : "justify-start",
                      )}
                    >
                      <div
                        className={clsx(
                          "max-w-[80%] rounded-2xl px-3 py-2 text-xs shadow-sm",
                          isStaff
                            ? "bg-sky-600 text-white rounded-br-sm"
                            : "bg-white text-foreground rounded-bl-sm border border-ink/70",
                        )}
                      >
                        <div className="whitespace-pre-wrap break-words leading-relaxed">
                          {msg.text}
                        </div>
                        <div
                          className={clsx(
                            "mt-1 text-[9px] flex items-center justify-end gap-1",
                            isStaff ? "text-white/80" : "text-muted",
                          )}
                        >
                          <span>{formatTimeLabel(msg.sentAt)}</span>
                          {isStaff && msg.read && <span>既読</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {/* 最下部追従アンカー */}
                <div ref={messagesEndRef} />
              </>
            ) : selectedChat ? (
              <div className="h-full flex items-center justify-center text-xs text-muted">
                {messagesLoaded
                  ? "まだメッセージはありません。下の入力欄から送信できます。"
                  : "読み込み中..."}
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-muted">
                左側の一覧から会話を選択してください。
              </div>
            )}
          </div>

          {/* 入力欄（API送信対応） */}
          <div className="border-t px-3 py-2 flex items-center gap-2 bg-white/60 backdrop-blur-sm">
            <input
              type="text"
              className="tiara-input flex-1 h-9 text-xs"
              placeholder={
                selectedChat
                  ? "メッセージを入力して送信"
                  : "会話を選択すると入力できます"
              }
              disabled={!selectedChat || sending}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (canSend) void handleSend();
                }
              }}
            />
            <button
              type="button"
              className="tiara-btn h-9 px-3 text-xs"
              disabled={!selectedChat || sending || !draft.trim()}
              onClick={() => void handleSend()}
            >
              {sending ? "送信中..." : "送信"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ChatPageClient() {
  return (
    <AppShell>
      <ChatContent />
    </AppShell>
  );
}
