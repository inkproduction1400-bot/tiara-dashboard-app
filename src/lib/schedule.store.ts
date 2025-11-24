// src/lib/schedule.store.ts
// スケジュール登録した店舗リクエストの共通ストア（暫定実装）
// 将来的には API 連携に差し替え予定。

export type ScheduleShopRequest = {
    id: string;
    date: string; // YYYY-MM-DD
    code: string;
    name: string;
    requestedHeadcount: number;
    minHourly?: number;
    maxHourly?: number;
    minAge?: number;
    maxAge?: number;
    requireDrinkOk: boolean;
    note?: string;
  };
  
  const STORAGE_KEY = "tiara:schedule-shop-requests:v1";
  
  const isBrowser = typeof window !== "undefined";
  
  export function loadScheduleShopRequestsFromStorage(): ScheduleShopRequest[] {
    if (!isBrowser) return [];
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      // 最低限の型ガード（壊れたデータで落ちないように）
      return parsed.filter((x) => typeof x?.id === "string");
    } catch (e) {
      console.warn("failed to load schedule requests from storage", e);
      return [];
    }
  }
  
  export function saveScheduleShopRequestsToStorage(
    items: ScheduleShopRequest[],
  ): void {
    if (!isBrowser) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch (e) {
      console.warn("failed to save schedule requests to storage", e);
    }
  }
  