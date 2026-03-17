"use client";

import { API_BASE } from "@/lib/api";
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
};

export type MobileChatMessage = {
  id: string;
  from: "staff" | "cast";
  text: string;
  sentAt: string;
  read?: boolean;
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
  } | null;
};

type ApiUnreadResponse = {
  unreadForStaff: number;
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

export async function fetchMobileChatRooms(): Promise<MobileChatRoom[]> {
  const rooms = await authorizedFetch<ApiRoom[]>("/chat/staff/rooms");
  const baseRooms = rooms
    .map((room, index) => {
      const castId = pickCastId(room);
      if (!castId) return null;

      const fallbackMessages = Array.isArray(room.messages) ? room.messages : [];
      const latestFallback = [...fallbackMessages]
        .filter((item) => item?.createdAt)
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        )[0];
      const lastMessage =
        latestFallback?.text?.trim() ||
        room.lastMessage?.text?.trim() ||
        "メッセージはまだありません";
      const lastMessageAt =
        latestFallback?.createdAt ||
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
        unreadCount: 0,
        shiftStatus: mapShiftStatus(room),
        assignmentStatus: mapAssignmentStatus(room),
      } satisfies MobileChatRoom;
    })
    .filter((room): room is MobileChatRoom => room !== null);

  const unreadResults = await Promise.allSettled(
    baseRooms.map((room) =>
      authorizedFetch<ApiUnreadResponse>(`/chat/staff/rooms/${room.id}/unread`),
    ),
  );

  return baseRooms.map((room, index) => {
    const unread = unreadResults[index];
    return {
      ...room,
      unreadCount:
        unread?.status === "fulfilled"
          ? Math.max(0, Number(unread.value.unreadForStaff) || 0)
          : room.unreadCount,
    };
  });
}

export async function fetchMobileChatMessages(
  castId: string,
): Promise<MobileChatMessage[]> {
  const messages = await authorizedFetch<ApiMessage[]>(
    `/chat/staff/rooms/${castId}/messages?limit=50`,
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
