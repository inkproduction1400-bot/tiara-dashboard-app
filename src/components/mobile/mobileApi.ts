"use client";

import { API_BASE } from "@/lib/api";
import {
  getCast,
  resolveCastPhotoDisplayUrl,
  resolveCastPhotoSource,
} from "@/lib/api.casts";
import { getToken } from "@/lib/device";
import { listStaffs, type StaffUser } from "@/lib/api.staffs";
import { listShopOrders, type ShopOrderRecord } from "@/lib/api.shop-orders";
import { loadScheduleShopRequests } from "@/lib/schedule.store";

export type MobileChatRoom = {
  id: string;
  castId: string;
  castName: string;
  castCode: string;
  staffName: string;
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
  shiftStatus: string;
  assignmentStatus: string;
  genreText: string;
  wageText: string;
  photoUrl: string | null;
};

const MOBILE_CHAT_ROOMS_LIMIT = 20;
const MOBILE_CHAT_MESSAGES_LIMIT = 30;
const MOBILE_CHAT_ROOMS_CACHE_KEY = "tiara:m:chat-rooms";
const MOBILE_CHAT_CAST_PROFILE_CACHE_KEY = "tiara:m:chat-cast-profiles";

export type MobileChatMessage = {
  id: string;
  from: "staff" | "cast";
  text: string;
  sentAt: string;
  read?: boolean;
};

export type MobileChatCastProfile = {
  castId: string;
  castName: string;
  castCode: string;
  managementNumber: string;
  staffName: string;
  genreText: string;
  wageText: string;
  shiftStatus: string;
  assignmentStatus: string;
  photoUrl: string | null;
};

type ApiMessage = {
  id: string;
  text: string;
  createdAt: string;
  readByCast?: boolean;
  sender?: { userType?: string } | null;
};

type ApiRoom = {
  id: string;
  castId?: string;
  cast_id?: string;
  castUserId?: string;
  createdAt?: string | null;
  updatedAt?: string | null;
  staffLastReadAt?: string | null;
  lastMessage?: {
    text?: string | null;
    createdAt?: string | null;
  } | null;
  messages?: ApiMessage[] | null;
  cast?: {
    userId?: string;
    castCode?: string | null;
    managementNumber?: string | null;
    ownerStaffName?: string | null;
    displayName?: string | null;
    drinkOk?: boolean | null;
    status?: string | null;
    shifts?: { status?: string | null }[] | null;
    cast_background?: { genres?: string | null }[] | null;
    preferences?: { desiredHourly?: number | null }[] | null;
  } | null;
};

type ApiSendMessageResponse = {
  id: string;
  text: string;
  createdAt: string;
};

export type MobileAssignmentCardData = {
  id: string;
  shopName: string;
  shopNumber: string;
  date: string;
  startTime: string;
  requiredCount: number;
  assignedCount: number;
  castNames: string[];
  note: string;
  orderLabel: string;
};

export type MobileProfileData = {
  displayName: string;
  loginId: string;
  email: string;
  userType: string;
  status: string;
  userId: string;
  lastLoginAt: string;
};

export function getAuthSnapshot() {
  if (typeof window === "undefined") {
    return {
      token: null,
      userId: "",
      loginId: "",
      userName: "",
    };
  }

  return {
    token: getToken(),
    userId: window.localStorage.getItem("tiara:user_id") ?? "",
    loginId: window.localStorage.getItem("tiara_login_id") ?? "",
    userName: window.localStorage.getItem("tiara_user_name") ?? "",
  };
}

function normalize(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function pickCastId(room: ApiRoom): string {
  return (
    room.castId ??
    room.cast_id ??
    room.castUserId ??
    room.cast?.userId ??
    ""
  );
}

function mapShiftStatus(room: ApiRoom): string {
  const statuses = (room.cast?.shifts ?? [])
    .map((item) => item.status ?? "")
    .filter(Boolean);

  if (statuses.includes("approved")) return "出勤中";
  if (statuses.includes("planned")) return "出勤予定";
  return "未出勤";
}

function mapAssignmentStatus(room: ApiRoom): string {
  return room.cast?.ownerStaffName ? "担当あり" : "未担当";
}

function deriveUnreadCount(room: ApiRoom, lastMessageAt: string): number {
  const latestMessage = Array.isArray(room.messages) ? room.messages[0] : null;
  const latestSenderType = latestMessage?.sender?.userType ?? "";
  if (latestSenderType !== "cast") return 0;

  if (!room.staffLastReadAt) return 1;

  const lastReadAt = new Date(room.staffLastReadAt);
  const latestAt = new Date(lastMessageAt);
  if (Number.isNaN(lastReadAt.getTime()) || Number.isNaN(latestAt.getTime())) {
    return 0;
  }

  return latestAt.getTime() > lastReadAt.getTime() ? 1 : 0;
}

function mapMobileChatRoom(room: ApiRoom, index: number): MobileChatRoom | null {
  const castId = pickCastId(room);
  if (!castId) return null;

  const latestMessage = Array.isArray(room.messages) ? room.messages[0] : null;
  const lastMessage =
    latestMessage?.text?.trim() ||
    room.lastMessage?.text?.trim() ||
    "メッセージはまだありません";
  const lastMessageAt =
    latestMessage?.createdAt ||
    room.lastMessage?.createdAt ||
    room.updatedAt ||
    room.createdAt ||
    new Date(0).toISOString();
  const castCode =
    room.cast?.castCode ?? room.cast?.managementNumber ?? `CAST-${index + 1}`;
  const castName =
    room.cast?.displayName ??
    (castCode ? `キャスト ${castCode}` : `キャスト ${index + 1}`);

  return {
    id: room.id,
    castId,
    castName,
    castCode,
    staffName: room.cast?.ownerStaffName ?? "未設定",
    lastMessage,
    lastMessageAt,
    // rooms API に unreadCount が無いので、初回表示は最新1件から未読有無だけ推定する。
    unreadCount: deriveUnreadCount(room, lastMessageAt),
    shiftStatus: mapShiftStatus(room),
    assignmentStatus: mapAssignmentStatus(room),
    genreText: (room.cast?.cast_background ?? [])
      .map((item) => item.genres ?? "")
      .filter(Boolean)
      .join(" "),
    wageText: String(room.cast?.preferences?.[0]?.desiredHourly ?? "").trim(),
    photoUrl: null,
  } satisfies MobileChatRoom;
}

function writeMobileChatRoomsCache(rooms: MobileChatRoom[]) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      MOBILE_CHAT_ROOMS_CACHE_KEY,
      JSON.stringify(rooms),
    );
  } catch {
    // noop
  }
}

export function readMobileChatRoomsCache(): MobileChatRoom[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(MOBILE_CHAT_ROOMS_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as MobileChatRoom[]) : [];
  } catch {
    return [];
  }
}

function writeMobileChatCastProfileCache(
  profiles: Record<string, MobileChatCastProfile>,
) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      MOBILE_CHAT_CAST_PROFILE_CACHE_KEY,
      JSON.stringify(profiles),
    );
  } catch {
    // noop
  }
}

export function readMobileChatCastProfileCache(): Record<string, MobileChatCastProfile> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.sessionStorage.getItem(MOBILE_CHAT_CAST_PROFILE_CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, MobileChatCastProfile>)
      : {};
  } catch {
    return {};
  }
}

function toWageText(value: number | string | null | undefined): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value.toLocaleString("ja-JP");
  }

  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  return "";
}

export async function fetchMobileChatCastProfile(
  room: MobileChatRoom,
): Promise<MobileChatCastProfile> {
  const detail = await getCast(room.castId);
  const rawPhoto = resolveCastPhotoSource(detail);
  const photoUrl = await resolveCastPhotoDisplayUrl({
    castId: room.castId,
    purpose: "profile",
    urlOrPath: rawPhoto,
  });

  return {
    castId: room.castId,
    castName: detail.displayName || room.castName,
    castCode: detail.castCode ?? room.castCode,
    managementNumber: detail.managementNumber ?? "",
    staffName: detail.ownerStaffName ?? room.staffName,
    genreText: Array.isArray(detail.background?.genres)
      ? detail.background?.genres.filter(Boolean).join(" ")
      : room.genreText,
    wageText: toWageText(detail.preferences?.desiredHourly ?? room.wageText),
    shiftStatus: room.shiftStatus,
    assignmentStatus: room.assignmentStatus,
    photoUrl,
  };
}

export async function fetchMobileChatCastProfiles(
  rooms: MobileChatRoom[],
  existing: Record<string, MobileChatCastProfile>,
): Promise<Record<string, MobileChatCastProfile>> {
  const missingRooms = rooms.filter((room) => !existing[room.castId]);
  if (missingRooms.length === 0) return existing;

  const entries = await Promise.allSettled(
    missingRooms.map(async (room) => [room.castId, await fetchMobileChatCastProfile(room)] as const),
  );

  const nextProfiles = { ...existing };
  for (const entry of entries) {
    if (entry.status !== "fulfilled") continue;
    const [castId, profile] = entry.value;
    nextProfiles[castId] = profile;
  }

  writeMobileChatCastProfileCache(nextProfiles);
  return nextProfiles;
}

function authorizedFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const { token, userId } = getAuthSnapshot();
  return fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(userId ? { "x-user-id": userId } : {}),
    },
    cache: "no-store",
  }).then(async (res) => {
    if (!res.ok) {
      throw new Error(`API ${res.status} ${res.statusText}`);
    }
    const text = await res.text();
    if (!text) return undefined as T;
    return JSON.parse(text) as T;
  });
}

export async function fetchMobileChatRooms(options?: {
  limit?: number | null;
}): Promise<MobileChatRoom[]> {
  const rooms = await authorizedFetch<ApiRoom[]>("/chat/staff/rooms");
  const limit =
    options?.limit === undefined ? MOBILE_CHAT_ROOMS_LIMIT : options.limit;
  const nextRooms = rooms
    .map((room, index) => mapMobileChatRoom(room, index))
    .filter((room): room is MobileChatRoom => room !== null)
    .sort(
      (a, b) =>
        new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime(),
    );

  const sliced = typeof limit === "number" ? nextRooms.slice(0, limit) : nextRooms;
  writeMobileChatRoomsCache(sliced);
  return sliced;
}

export async function fetchMobileChatMessages(
  castId: string,
  limit = MOBILE_CHAT_MESSAGES_LIMIT,
): Promise<MobileChatMessage[]> {
  const messages = await authorizedFetch<ApiMessage[]>(
    `/chat/staff/rooms/${castId}/messages?limit=${limit}`,
  );

  return messages.map((item) => {
    const from = item.sender?.userType === "cast" ? "cast" : "staff";
    return {
      id: item.id,
      from,
      text: item.text,
      sentAt: item.createdAt,
      read: from === "staff" ? Boolean(item.readByCast) : undefined,
    };
  });
}

export async function markMobileChatRead(roomId: string): Promise<void> {
  await authorizedFetch(`/me/notifications/mark-staff-talk-read/${roomId}`, {
    method: "POST",
  });
}

export async function sendMobileChatMessage(
  castId: string,
  text: string,
): Promise<ApiSendMessageResponse> {
  return authorizedFetch<ApiSendMessageResponse>("/chat/staff/messages", {
    method: "POST",
    body: JSON.stringify({ castId, text }),
  });
}

function extractAssignments(order: ShopOrderRecord): {
  castNames: string[];
  assignedCount: number;
} {
  const rawAssignments = Array.isArray(order.assignments) ? order.assignments : [];
  const castNames = rawAssignments
    .map((item) => {
      const anyItem = item as {
        castName?: string;
        cast?: { displayName?: string; name?: string };
      };
      return (
        anyItem.castName ??
        anyItem.cast?.displayName ??
        anyItem.cast?.name ??
        ""
      ).trim();
    })
    .filter(Boolean);

  return {
    castNames,
    assignedCount: rawAssignments.length,
  };
}

export async function fetchAssignmentsForDate(
  date: string,
): Promise<MobileAssignmentCardData[]> {
  const [orders, requests] = await Promise.all([
    listShopOrders(date),
    loadScheduleShopRequests(date).catch(() => []),
  ]);

  const requestByShopId = new Map(
    requests.map((request) => [request.shopId ?? request.id, request]),
  );

  return orders
    .filter((order) => order?.status !== "canceled")
    .map((order) => {
      const request = requestByShopId.get(order.shopId);
      const { castNames, assignedCount } = extractAssignments(order);
      const headcount =
        Number(order.headcount ?? request?.requestedHeadcount ?? 0) || 0;
      const startTime = order.entryTime ?? order.startTime ?? "未定";
      const orderNo = Number(order.orderNo ?? 0);
      return {
        id: order.id,
        shopName: order.shop?.name ?? request?.name ?? "店舗未設定",
        shopNumber: order.shop?.code ?? request?.code ?? "000",
        date,
        startTime,
        requiredCount: headcount,
        assignedCount,
        castNames,
        note: String(order.note ?? request?.note ?? "").trim(),
        orderLabel: orderNo > 0 ? `No.${orderNo}` : "未採番",
      };
    })
    .sort((a, b) => a.startTime.localeCompare(b.startTime, "ja"));
}

function matchStaffRecord(staffs: StaffUser[], auth: ReturnType<typeof getAuthSnapshot>) {
  const userId = normalize(auth.userId);
  const loginId = normalize(auth.loginId);

  return (
    staffs.find((staff) => normalize(staff.id) === userId) ??
    staffs.find((staff) => normalize(staff.loginId) === loginId) ??
    null
  );
}

export async function fetchMobileProfile(): Promise<MobileProfileData> {
  const auth = getAuthSnapshot();
  let matched: StaffUser | null = null;

  try {
    matched = matchStaffRecord(await listStaffs(), auth);
  } catch {
    matched = null;
  }

  return {
    displayName: auth.userName || matched?.loginId || "スタッフ",
    loginId: matched?.loginId ?? auth.loginId ?? "-",
    email: matched?.email ?? "-",
    userType: matched?.userType ?? "staff",
    status: matched?.status ?? "active",
    userId: matched?.id ?? auth.userId ?? "-",
    lastLoginAt: matched?.lastLoginAt ?? "",
  };
}
