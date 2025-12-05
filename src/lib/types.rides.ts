// src/lib/types.rides.ts

// ステータス（API / UI 共通）
export type RideStatus = "pending" | "accepted" | "completed" | "cancelled";

// 一覧取得のクエリパラメータ
export type ListRidesParams = {
  status?: RideStatus;
  pickup_city?: string;
  /** 当日 00:00〜翌日 00:00 で絞る用 (YYYY-MM-DD) */
  date?: string;
  /** 開始日時 (ISO 文字列) */
  from?: string;
  /** 終了日時 (ISO 文字列) */
  to?: string;
};

// API から返ってくる生の形（SQL のカラムそのまま）
export type RideListItemFromApi = {
  id: string;
  request_date: string;
  status: RideStatus;
  pickup_city: string | null;
  note: string | null;
  car_number: string | null;
  boarding_time: string | null;
  arrival_time: string | null;
  created_at: string;

  cast_name: string | null;
  cast_management_number: string | null;
  shop_name: string | null;
};

// UI で使う形（今回は API と同じ構造）
export type RideListItem = RideListItemFromApi;

// PATCH 時に指定できるフィールド
export type UpdateRideField =
  | "note"
  | "carNumber"
  | "boardingTime"
  | "arrivalTime"
  | "status";

// PATCH ペイロード
export type UpdateRidePayload = {
  field: UpdateRideField;
  value: string | number | null;
};
