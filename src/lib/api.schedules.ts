// src/lib/api.schedules.ts
"use client";

import { apiFetch } from "./api";

/**
 * スケジュール系 API クライアント
 *
 * - 現状、バックエンド側の `/schedules` エンドポイント仕様はまだ固まっていない前提。
 * - そのため、返却 shape の違いに多少は耐えられるようにしてあります。
 * - 最低限「日付ごとのスケジュール一覧」と「その日スケジュール登録されている店舗一覧」を取れるようにしておき、
 *   UI 側（スケジュール画面／本日出勤キャスト／割当確認）からはこのモジュール経由で参照します。
 */

export type ScheduleStatus = "planned" | "confirmed" | "cancelled";

/**
 * 1件のスケジュール行（1キャスト × 1店舗 × 1日）の想定 shape
 *
 * バックエンド実装と多少ズレても良いように、よく使うフィールドだけをピックアップしています。
 * 追加フィールドが返ってきても無視されます。
 */
export type ScheduleListItem = {
  /** スケジュールID */
  id: string;
  /** 勤務日（YYYY-MM-DD） */
  date: string;
  /** 店舗ID */
  shopId: string;
  /** 店舗コード（管理番号） */
  shopCode?: string | null;
  /** 店舗名 */
  shopName?: string | null;
  /** 呼出番号など（あれば） */
  shopNumber?: string | null;

  /** キャストID */
  castId?: string;
  /** キャスト管理番号 */
  castCode?: string | null;
  /** キャスト名 */
  castName?: string | null;

  /** 勤務開始日時 or 時刻文字列（任意） */
  startAt?: string | null;
  /** 勤務終了日時 or 時刻文字列（任意） */
  endAt?: string | null;

  /** ステータス（任意） */
  status?: ScheduleStatus | null;

  /** 任意のメモなど */
  memo?: string | null;
};

export type ListSchedulesParams = {
  /** 対象日（YYYY-MM-DD）。1日分だけ欲しいときに使用 */
  date?: string;
  /** 範囲指定したい場合 */
  dateFrom?: string;
  dateTo?: string;

  shopId?: string;

  limit?: number;
  offset?: number;
};

export type ListSchedulesResponse = {
  items: ScheduleListItem[];
  total: number;
  limit: number;
  offset: number;
};

/**
 * 共通ヘッダ（とくに x-user-id）
 * 他の api.\* 系と合わせてあります。
 */
const withUser = (init?: RequestInit | undefined): RequestInit => {
  const base: RequestInit = {
    headers: {
      "x-user-id":
        typeof window === "undefined" ? "dashboard-dev" : "dashboard-browser",
    },
  };

  if (!init) return base;

  const mergedHeaders = new Headers(base.headers);
  if (init.headers) {
    const given = new Headers(init.headers as any);
    given.forEach((v, k) => mergedHeaders.set(k, v));
  }

  return {
    ...init,
    headers: mergedHeaders,
  };
};

/**
 * /schedules 一覧取得
 *
 * - path は `/schedules` 固定
 * - クエリに `date`, `dateFrom`, `dateTo`, `shopId`, `limit`, `offset` を付与（存在するものだけ）
 * - バックエンド側の返却が `ScheduleListItem[]` でも `{ items: ScheduleListItem[], total: number }` でも
 *   動くように吸収しています。
 */
export async function listSchedules(
  params: ListSchedulesParams = {},
): Promise<ListSchedulesResponse> {
  const search = new URLSearchParams();

  (
    [
      "date",
      "dateFrom",
      "dateTo",
      "shopId",
      "limit",
      "offset",
    ] as const
  ).forEach((key) => {
    const value = (params as any)[key];
    if (value === undefined || value === null || value === "") return;
    search.set(key, String(value));
  });

  const qs = search.toString();
  const path = qs ? `/schedules?${qs}` : "/schedules";

  const raw = await apiFetch<any>(
    path,
    withUser({
      cache: "no-store",
    }),
  );

  // 返却 shape のゆるい吸収
  const items: ScheduleListItem[] = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.items)
    ? raw.items
    : [];

  const limit = params.limit ?? (raw?.limit ?? items.length);
  const offset = params.offset ?? (raw?.offset ?? 0);
  const total =
    typeof raw?.total === "number"
      ? raw.total
      : typeof raw?.count === "number"
      ? raw.count
      : items.length;

  return { items, total, limit, offset };
}

/**
 * 「ある1日について、スケジュール登録されている店舗の一覧」を取得するための
 * フロント側ヘルパー。
 *
 * まずは `/schedules?date=...` を全件取得してクライアント側で店舗単位に集約する方針。
 * （件数が増えてパフォーマンスが厳しくなったら、専用エンドポイントを API 側に追加）
 */
export type ScheduleShopForDay = {
  shopId: string;
  shopCode?: string | null;
  shopName?: string | null;
  shopNumber?: string | null;

  /** その店舗に紐づくスケジュール件数（＝キャスト数相当） */
  totalSchedules: number;
};

/**
 * 指定日のスケジュールを取得し、店舗単位にまとめて返す。
 * 本日出勤キャストページの「店舗セット」や、割当確認画面の
 * 「本日スケジュール登録されている店舗一覧」は、まずはこれを使う想定です。
 */
export async function listScheduleShopsForDate(
  date: string,
): Promise<ScheduleShopForDay[]> {
  const { items } = await listSchedules({
    date,
    limit: 10_000,
    offset: 0,
  });

  const byShop = new Map<string, ScheduleShopForDay>();

  for (const row of items) {
    // いろいろな shape を吸収（shopId or shop.id など）
    const anyRow: any = row;
    const shopId: string | undefined =
      anyRow.shopId ?? anyRow.shop?.id ?? anyRow.shop_id;

    if (!shopId) continue;

    const shopCode: string | undefined =
      anyRow.shopCode ?? anyRow.shop?.code ?? anyRow.shop_code;
    const shopName: string | undefined =
      anyRow.shopName ?? anyRow.shop?.name ?? anyRow.shop_name;
    const shopNumber: string | undefined =
      anyRow.shopNumber ?? anyRow.shop?.number ?? anyRow.shop_number;

    const existing = byShop.get(shopId);
    if (existing) {
      existing.totalSchedules += 1;
      continue;
    }

    byShop.set(shopId, {
      shopId,
      shopCode: shopCode ?? null,
      shopName: shopName ?? null,
      shopNumber: shopNumber ?? null,
      totalSchedules: 1,
    });
  }

  // 店舗コード → 店舗名 順にソートして返す（多少見やすくするため）
  return Array.from(byShop.values()).sort((a, b) => {
    const codeA = (a.shopCode ?? "").toString();
    const codeB = (b.shopCode ?? "").toString();
    if (codeA && codeB && codeA !== codeB) {
      return codeA.localeCompare(codeB, "ja");
    }

    const nameA = (a.shopName ?? "").toString();
    const nameB = (b.shopName ?? "").toString();
    return nameA.localeCompare(nameB, "ja");
  });
}
