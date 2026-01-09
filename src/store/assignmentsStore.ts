// src/store/assignmentsStore.ts

// ※ React Hooks は使わない「純粋なユーティリティ」モジュールとして定義。
//   localStorage が使えない SSR ではモック初期値だけ返すようにしています。

import {
  listShopOrders,
  getOrderAssignments,
  replaceOrderAssignments,
  type ShopOrderAssignmentPayload,
} from "@/lib/api.shop-orders";

// === LocalStorage 永続化の shape（legacy）===
// - STORAGE_KEY_REQUESTS / STORAGE_KEY_ASSIGNMENTS に JSON 配列で保存
// - loadAssignments() / saveAssignments() は ShopAssignment[] を入出力
// - page.tsx はこの legacy shape を期待している

export type ShopRequest = {
    id: string;
    code: string;
    name: string;
  
    requestedDate: string; // 例: "本日", "明日"
    requestedHeadcount: number;
    minHourly?: number;
    maxHourly?: number;
    minAge?: number;
    maxAge?: number;
    requireDrinkOk: boolean;
    note?: string;
  };
  
export type ShopAssignment = {
  id: string;
  shopId: string; // ShopRequest.id を参照
  castId?: string; // API連携用（存在すれば優先）
  castCode: string;
  castName: string;
  agreedHourly: number;
  note?: string;
};
  
  // --- デモ用モック初期値 ---
  
  const MOCK_SHOP_REQUESTS: ShopRequest[] = [
    {
      id: "s1",
      code: "001",
      name: "クラブ ティアラ本店",
      requestedDate: "本日",
      requestedHeadcount: 5,
      minHourly: 4500,
      maxHourly: 6000,
      minAge: 20,
      maxAge: 32,
      requireDrinkOk: true,
      note: "売上見込み高め。お酒強めの子を優先。",
    },
    {
      id: "s2",
      code: "002",
      name: "スナック フラワー",
      requestedDate: "本日",
      requestedHeadcount: 3,
      minHourly: 3500,
      maxHourly: 4500,
      minAge: 25,
      maxAge: 40,
      requireDrinkOk: false,
      note: "落ち着いたお姉さん系。飲酒NGでもOK。",
    },
    {
      id: "s3",
      code: "003",
      name: "ラウンジ プリマ",
      requestedDate: "明日",
      requestedHeadcount: 4,
      minHourly: 4000,
      maxHourly: 5500,
      minAge: 21,
      maxAge: 30,
      requireDrinkOk: true,
      note: "常連さん来店予定。トーク上手め希望。",
    },
  ];
  
  const MOCK_ASSIGNMENTS: ShopAssignment[] = [
    {
      id: "a1",
      shopId: "s1",
      castCode: "A101",
      castName: "あいな",
      agreedHourly: 4800,
      note: "VIP席担当",
    },
    {
      id: "a2",
      shopId: "s1",
      castCode: "A103",
      castName: "みゆ",
      agreedHourly: 4500,
      note: "新人フォロー",
    },
    {
      id: "a3",
      shopId: "s2",
      castCode: "A105",
      castName: "さくら",
      agreedHourly: 4000,
      note: "落ち着いた席中心",
    },
  ];
  
  // --- localStorage キー ---
  
  const STORAGE_KEY_REQUESTS = "tiara:shopRequests:v1";
  const STORAGE_KEY_ASSIGNMENTS = "tiara:shopAssignments:v1";

// API 優先ロードのキャッシュ（初回同期の負荷軽減）
const apiAssignmentsCache = new Map<string, ShopAssignment[]>();
const apiAssignmentsLoading = new Set<string>();

type AssignmentsListener = () => void;
const assignmentsListeners = new Set<AssignmentsListener>();

const emitAssignmentsChange = () => {
  for (const listener of assignmentsListeners) {
    listener();
  }
};

export function subscribeAssignments(listener: AssignmentsListener): () => void {
  assignmentsListeners.add(listener);
  return () => {
    assignmentsListeners.delete(listener);
  };
}
  
  // --- 共通ユーティリティ ---
  
  const isBrowser = () => typeof window !== "undefined";
  
  function safeParseJson<T>(raw: string | null, fallback: T): T {
    if (!raw) return fallback;
    try {
      const parsed = JSON.parse(raw);
      // ざっくり配列 or オブジェクトっぽければ採用
      if (parsed && typeof parsed === "object") return parsed as T;
      return fallback;
    } catch {
      return fallback;
    }
  }

// --- API / legacy adapter ---

const todayKey = (): string => {
  const d = new Date();
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const dd = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${dd}`;
};

const pickCastCode = (a: any): string =>
  a?.castCode ??
  a?.cast?.managementNumber ??
  a?.cast?.code ??
  a?.cast?.castCode ??
  a?.castId ??
  a?.cast?.id ??
  "";

const pickCastName = (a: any): string =>
  a?.castName ??
  a?.cast?.displayName ??
  a?.cast?.name ??
  "";

const pickAgreedHourly = (a: any): number =>
  Number(a?.agreedHourly ?? a?.hourly ?? a?.assignedHourly ?? 0);

const normalizeOrders = (res: any): any[] => {
  if (Array.isArray(res)) return res;
  if (Array.isArray(res?.items)) return res.items;
  if (Array.isArray(res?.data)) return res.data;
  return [];
};

const mapOrderAssignmentsToLegacy = (
  order: any,
  assignments: any[],
): ShopAssignment[] => {
  const shopId = order?.shopId ?? order?.shop?.id ?? "";
  if (!shopId) return [];
  return assignments.map((a) => ({
    id: a?.id ?? `${order.id}-${a?.castId ?? a?.castCode ?? ""}`,
    shopId,
    castId: a?.castId ?? a?.cast?.id ?? undefined,
    castCode: pickCastCode(a),
    castName: pickCastName(a),
    agreedHourly: pickAgreedHourly(a),
    note: a?.note ?? "",
  }));
};

const detectOrderIdFromAssignments = (
  ordersForShop: any[],
  assignments: ShopAssignment[],
): string | null => {
  const orderIds = ordersForShop.map((order) => order.id);
  const matched = new Set<string>();
  for (const a of assignments) {
    if (!a.id) continue;
    const found = orderIds.find(
      (id) => a.id === id || a.id.startsWith(`${id}-`),
    );
    if (found) matched.add(found);
  }
  if (matched.size === 1) return [...matched][0];
  if (matched.size > 1) return null;
  return null;
};

async function loadAssignmentsFromApi(date: string): Promise<ShopAssignment[]> {
  console.warn("[assignmentsStore] loadAssignmentsFromApi", { date });
  const orders = await listShopOrders(date);
  const list = normalizeOrders(orders);
  if (list.length === 0) return [];

  const assignmentsByOrder = await Promise.all(
    list.map(async (order) => {
      const inline = Array.isArray(order?.assignments) ? order.assignments : null;
      const assignments = inline ?? (await getOrderAssignments(order.id));
      return { order, assignments };
    }),
  );

  return assignmentsByOrder.flatMap(({ order, assignments }) =>
    mapOrderAssignmentsToLegacy(order, assignments),
  );
}

const groupByShopId = (items: ShopAssignment[]) => {
  const map: Record<string, ShopAssignment[]> = {};
  for (const item of items) {
    if (!map[item.shopId]) map[item.shopId] = [];
    map[item.shopId].push(item);
  }
  return map;
};

async function mapLegacyToApi(
  items: ShopAssignment[],
  date: string,
): Promise<{ orderId: string; assignments: ShopOrderAssignmentPayload[] }[]> {
  const orders = await listShopOrders(date);
  const list = normalizeOrders(orders);
  const ordersByShop: Record<string, any[]> = {};
  for (const order of list) {
    const shopId = order?.shopId ?? order?.shop?.id ?? "";
    if (!shopId) continue;
    if (!ordersByShop[shopId]) ordersByShop[shopId] = [];
    ordersByShop[shopId].push(order);
  }

  const groups = groupByShopId(items);
  const result: { orderId: string; assignments: ShopOrderAssignmentPayload[] }[] = [];

  for (const [shopId, assigns] of Object.entries(groups)) {
    const ordersForShop = ordersByShop[shopId] ?? [];
    if (ordersForShop.length === 0) continue;

    let targetOrder = ordersForShop[0];
    if (ordersForShop.length > 1) {
      const detectedOrderId = detectOrderIdFromAssignments(
        ordersForShop,
        assigns,
      );
      if (detectedOrderId) {
        const matched = ordersForShop.find(
          (order) => order.id === detectedOrderId,
        );
        if (matched) {
          targetOrder = matched;
        }
      } else {
        const sorted = [...ordersForShop].sort((a, b) => {
          const an = Number(a?.orderNo ?? a?.order_no ?? 0);
          const bn = Number(b?.orderNo ?? b?.order_no ?? 0);
          return an - bn;
        });
        console.warn(
          "[assignmentsStore] skip API save: multiple orders without mapping hint",
          { shopId, date, orderIds: sorted.map((o) => o.id) },
        );
        continue;
      }
    }

    const payloads = assigns.map((a) => ({
      castId: a.castId ?? undefined,
      castCode: a.castCode || undefined,
      castName: a.castName || undefined,
      agreedHourly: Number.isFinite(a.agreedHourly) ? a.agreedHourly : 0,
      note: a.note ?? "",
    }));
    result.push({ orderId: targetOrder.id, assignments: payloads });
  }

  return result;
}

const fromApiToLegacy = async (date: string): Promise<ShopAssignment[]> =>
  loadAssignmentsFromApi(date);

const fromLegacyToApi = async (
  items: ShopAssignment[],
  date: string,
): Promise<{ orderId: string; assignments: ShopOrderAssignmentPayload[] }[]> =>
  mapLegacyToApi(items, date);

// suffix key example: "tiara:shopAssignments:v1:YYYY-MM-DD"
const assignmentsStorageKey = (date?: string): string =>
  `${STORAGE_KEY_ASSIGNMENTS}:${date ?? "default"}`;

const readAssignmentsStorage = (date?: string): ShopAssignment[] => {
  if (!isBrowser()) return [...MOCK_ASSIGNMENTS];
  const raw =
    window.localStorage.getItem(assignmentsStorageKey(date)) ??
    window.localStorage.getItem(STORAGE_KEY_ASSIGNMENTS);
  return safeParseJson<ShopAssignment[]>(raw, MOCK_ASSIGNMENTS);
};

const writeAssignmentsStorage = (items: ShopAssignment[], date?: string) => {
  if (!isBrowser()) return;
  window.localStorage.setItem(
    assignmentsStorageKey(date),
    JSON.stringify(items),
  );
};

const cacheKeyForDate = (date?: string): string =>
  date ?? "default";
  
  // --- 公開 API: 読み書き関数 ---
  
  export function loadShopRequests(): ShopRequest[] {
    if (!isBrowser()) return [...MOCK_SHOP_REQUESTS];
    const raw = window.localStorage.getItem(STORAGE_KEY_REQUESTS);
    const data = safeParseJson<ShopRequest[]>(raw, MOCK_SHOP_REQUESTS);
    return data;
  }
  
  export function saveShopRequests(items: ShopRequest[]): void {
    if (!isBrowser()) return;
    window.localStorage.setItem(STORAGE_KEY_REQUESTS, JSON.stringify(items));
  }
  
  export function loadAssignments(date?: string): ShopAssignment[] {
    if (!isBrowser()) return [...MOCK_ASSIGNMENTS];
    const key = cacheKeyForDate(date);
    if (apiAssignmentsCache.has(key)) {
      return [...(apiAssignmentsCache.get(key) ?? [])];
    }

    const fallback = readAssignmentsStorage(date);

    if (!apiAssignmentsLoading.has(key)) {
      apiAssignmentsLoading.add(key);
      const targetDate = date ?? todayKey();
      fromApiToLegacy(targetDate)
        .then((items) => {
          apiAssignmentsCache.set(key, items);
          writeAssignmentsStorage(items, date);
          emitAssignmentsChange();
        })
        .catch((err) => {
          console.warn(
            "[assignmentsStore] API load failed, fallback to local",
            { date: targetDate, err },
          );
        })
        .finally(() => {
          apiAssignmentsLoading.delete(key);
        });
    }

    return fallback;
  }
  
  export function saveAssignments(items: ShopAssignment[], date?: string): void {
    if (!isBrowser()) return;

    const persistLocal = () => {
      writeAssignmentsStorage(items, date);
      apiAssignmentsCache.set(cacheKeyForDate(date), items);
      emitAssignmentsChange();
    };

    const targetDate = date ?? todayKey();
    persistLocal();
    (async () => {
      try {
        const payloads = await fromLegacyToApi(items, targetDate);
        for (const { orderId, assignments } of payloads) {
          // 将来の差分更新へ切り替え余地あり
          await replaceOrderAssignments(orderId, assignments);
        }
      } catch (err) {
        console.warn(
          "[assignmentsStore] API save failed; local already updated",
          { date: targetDate, err },
        );
      }
    })();
  }
  
  // --- ID 生成ヘルパー（ローカル専用） ---
  
  export function createEmptyShopRequest(): ShopRequest {
    return {
      id: `new-${Date.now()}`, // デモ用ID（将来はAPI側で発行）
      code: "",
      name: "",
      requestedDate: "本日",
      requestedHeadcount: 1,
      minHourly: undefined,
      maxHourly: undefined,
      minAge: undefined,
      maxAge: undefined,
      requireDrinkOk: false,
      note: "",
    };
  }
  
  export function createEmptyAssignment(shopId: string): ShopAssignment {
    return {
      id: `as-${Date.now()}`,
      shopId,
      castCode: "",
      castName: "",
      agreedHourly: 0,
      note: "",
    };
  }
  
