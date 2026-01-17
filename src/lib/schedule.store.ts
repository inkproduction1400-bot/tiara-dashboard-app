// src/lib/schedule.store.ts
// スケジュール登録した店舗リクエストの共通ストア
// ★ 以前の localStorage ベース実装から、API 連携ベースに変更済み

import {
  listShopRequests,
  type ShopRequestRecord,
} from "@/lib/api.shop-requests";

/**
 * スケジュール画面などで使う共通型
 * （バックエンドの ShopRequest + Shop の情報をフロント用に整形したもの）
 */
export type ScheduleShopRequest = {
  id: string;
  date: string; // YYYY-MM-DD （営業日）
  /** 紐づく店舗ID（shops.id） */
  shopId?: string;
  code: string; // 店舗コード的なもの（shops.shopNumber を想定、なければ空文字）
  name: string; // 店舗名
  requestedHeadcount: number;
  minHourly?: number;
  maxHourly?: number;
  minAge?: number;
  maxAge?: number;
  requireDrinkOk: boolean;
  contactStatus?: string | null;
  note?: string;
};

/**
 * YYYY-MM-DD 形式の今日の日付を返す
 */
export function getTodayKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * バックエンドの ShopRequestRecord → フロント用 ScheduleShopRequest への変換
 */
function mapRecordToScheduleShopRequest(
  record: ShopRequestRecord,
): ScheduleShopRequest {
  const date = record.requestDate.slice(0, 10); // "YYYY-MM-DD..."

  const shop = record.shop;
  const code = shop?.shopNumber ?? "";
  const name = shop?.name ?? "";

  return {
    id: record.id,
    date,
    shopId: record.shopId, // ★ 追加
    code,
    name,
    requestedHeadcount: record.requestedHeadcount,
    minHourly: record.minHourly ?? undefined,
    maxHourly: record.maxHourly ?? undefined,
    minAge: record.minAge ?? undefined,
    maxAge: record.maxAge ?? undefined,
    requireDrinkOk: record.requireDrinkOk,
    contactStatus: record.contactStatus ?? undefined,
    note: record.note ?? undefined,
  };
}

/**
 * 指定日の店舗リクエストを API から取得する。
 *
 * @param date YYYY-MM-DD（未指定なら「今日」）
 * @returns ScheduleShopRequest[]（指定日のリクエスト一覧）
 */
export async function loadScheduleShopRequests(
  date?: string,
): Promise<ScheduleShopRequest[]> {
  const targetDate = date ?? getTodayKey();

  const res = await listShopRequests({
    date: targetDate,
    take: 100,
    offset: 0,
  });

  return res.items.map(mapRecordToScheduleShopRequest);
}
