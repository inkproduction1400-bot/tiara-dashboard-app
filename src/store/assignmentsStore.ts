// src/store/assignmentsStore.ts

// ※ React Hooks は使わない「純粋なユーティリティ」モジュールとして定義。
//   localStorage が使えない SSR ではモック初期値だけ返すようにしています。

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
  
  export function loadAssignments(): ShopAssignment[] {
    if (!isBrowser()) return [...MOCK_ASSIGNMENTS];
    const raw = window.localStorage.getItem(STORAGE_KEY_ASSIGNMENTS);
    const data = safeParseJson<ShopAssignment[]>(raw, MOCK_ASSIGNMENTS);
    return data;
  }
  
  export function saveAssignments(items: ShopAssignment[]): void {
    if (!isBrowser()) return;
    window.localStorage.setItem(STORAGE_KEY_ASSIGNMENTS, JSON.stringify(items));
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
  