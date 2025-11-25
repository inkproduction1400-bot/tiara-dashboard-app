// src/app/schedule/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import {
  listShopRequests,
  createShopRequest,
  updateShopRequest,
  deleteShopRequest,
  type ShopRequestRecord,
  type CreateShopRequestPayload,
  type UpdateShopRequestPayload,
} from "@/lib/api.shop-requests";
import { listShops, type ShopListItem } from "@/lib/api.shops";

/**
 * YYYY-MM-DD 文字列に対して日数加算
 */
const addDays = (base: string, diff: number) => {
  const [y, m, d] = base.split("-").map(Number);
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
  dt.setDate(dt.getDate() + diff);
  const yy = dt.getFullYear();
  const mm = `${dt.getMonth() + 1}`.padStart(2, "0");
  const dd = `${dt.getDate()}`.padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
};

/**
 * 今日を YYYY-MM-DD で返す
 */
const getTodayKey = (): string => {
  const d = new Date();
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const dd = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${dd}`;
};

const TODAY = getTodayKey();
const TOMORROW = addDays(TODAY, 1);
const DAY_AFTER = addDays(TODAY, 2); // いまは未使用だが将来の拡張用に残しておく

/**
 * 画面用のスケジュール行
 * （API の ShopRequestRecord を UI 用に変換したもの）
 */
type UiShopRequest = {
  id: string;
  shopId: string | null;
  date: string; // YYYY-MM-DD
  code: string; // 店舗番号（shop.shopNumber）
  name: string; // 店舗名（shop.name）
  requestedHeadcount: number;
  minHourly?: number;
  maxHourly?: number;
  minAge?: number;
  maxAge?: number;
  requireDrinkOk: boolean;
  note?: string;
};

/**
 * 時給レンジのプリセット
 * （店舗管理ページの店舗編集モーダルと同じ構成）
 */
const HOURLY_RANGE_OPTIONS: {
  label: string;
  min?: number;
  max?: number;
}[] = [
  { label: "（未設定）" },
  { label: "2500円", min: 2500, max: 2500 },
  { label: "2500円〜3000円", min: 2500, max: 3000 },
  { label: "3000円", min: 3000, max: 3000 },
  { label: "3000円〜3500円", min: 3000, max: 3500 },
  { label: "3500円", min: 3500, max: 3500 },
  { label: "3500円〜4000円", min: 3500, max: 4000 },
  { label: "4000円", min: 4000, max: 4000 },
  { label: "4000円〜4500円", min: 4000, max: 4500 },
  { label: "4500円", min: 4500, max: 4500 },
  { label: "4500円〜5000円", min: 4500, max: 5000 },
  { label: "5000円", min: 5000, max: 5000 },
  { label: "5000円〜5500円", min: 5000, max: 5500 },
  { label: "5500円", min: 5500, max: 5500 },
  { label: "5500円〜6000円", min: 5500, max: 6000 },
  { label: "6000円以上", min: 6000, max: undefined },
];

/**
 * min/max からプリセットラベルを逆算
 */
const getHourlyLabelFromRange = (min?: number, max?: number): string => {
  const hit = HOURLY_RANGE_OPTIONS.find(
    (opt) =>
      (opt.min ?? null) === (min ?? null) &&
      (opt.max ?? null) === (max ?? null),
  );
  return hit?.label ?? "（未設定）";
};

/**
 * 店舗参照用の軽量型
 */
type ShopRef = {
  id: string;
  shopNumber: string;
  name: string;
};

/**
 * 店舗ごとの「前回セット時」の条件
 */
type LastShopSettings = {
  requestedHeadcount: number;
  requireDrinkOk: boolean;
  minHourly?: number;
  maxHourly?: number;
  minAge?: number;
  maxAge?: number;
};

type LastSettingsMap = Record<string, LastShopSettings>;

const LAST_SETTINGS_STORAGE_KEY = "tiara:schedule:lastShopSettings:v1";

/**
 * API レコード → 画面用型に変換
 */
const mapRecordToUi = (rec: ShopRequestRecord): UiShopRequest => {
  const date =
    rec.requestDate && rec.requestDate.length >= 10
      ? rec.requestDate.slice(0, 10)
      : TODAY;

  return {
    id: rec.id,
    shopId: rec.shopId ?? null,
    date,
    code: rec.shop?.shopNumber ?? "",
    name: rec.shop?.name ?? "",
    requestedHeadcount: rec.requestedHeadcount ?? 0,
    minHourly: rec.minHourly ?? undefined,
    maxHourly: rec.maxHourly ?? undefined,
    minAge: rec.minAge ?? undefined,
    maxAge: rec.maxAge ?? undefined,
    requireDrinkOk: !!rec.requireDrinkOk,
    note: rec.note ?? "",
  };
};

/**
 * UI 型 → API create 用ペイロード
 */
const uiToCreatePayload = (ui: UiShopRequest): CreateShopRequestPayload => {
  const shopId = (ui.shopId ?? "").trim();
  if (!shopId) {
    // ★ 店舗マスタ連携前の暫定バリデーション
    throw new Error(
      "店舗ID（shopId）が未設定です。店舗管理画面などで shops.id を確認して入力してください。",
    );
  }

  return {
    shopId,
    requestDate: ui.date,
    requestedHeadcount: ui.requestedHeadcount,
    minHourly: ui.minHourly,
    maxHourly: ui.maxHourly,
    minAge: ui.minAge,
    maxAge: ui.maxAge,
    requireDrinkOk: ui.requireDrinkOk,
    note: ui.note,
  };
};

/**
 * UI 型 → API update 用ペイロード
 */
const uiToUpdatePayload = (ui: UiShopRequest): UpdateShopRequestPayload => {
  const shopId = (ui.shopId ?? "").trim();

  const payload: UpdateShopRequestPayload = {
    requestDate: ui.date,
    requestedHeadcount: ui.requestedHeadcount,
    minHourly: ui.minHourly,
    maxHourly: ui.maxHourly,
    minAge: ui.minAge,
    maxAge: ui.maxAge,
    requireDrinkOk: ui.requireDrinkOk,
    note: ui.note,
  };

  if (shopId) {
    payload.shopId = shopId;
  }

  return payload;
};

/**
 * 新規作成用のひな形
 */
const createEmptyRequestForDate = (date: string): UiShopRequest => ({
  id: `tmp-${date}-${Date.now()}`,
  // 開発中は手入力するため空文字で初期化
  shopId: "",
  date,
  code: "",
  name: "",
  requestedHeadcount: 1,
  minHourly: undefined,
  maxHourly: undefined,
  minAge: undefined,
  maxAge: undefined,
  requireDrinkOk: false,
  note: "",
});

export default function Page() {
  const [items, setItems] = useState<UiShopRequest[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(TODAY);
  const [keyword, setKeyword] = useState("");
  const [rangeView, setRangeView] = useState<"day" | "week">("day");

  const [editing, setEditing] = useState<UiShopRequest | null>(null);
  const [editingIsNew, setEditingIsNew] = useState(false);

  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const buildStamp = useMemo(() => new Date().toLocaleString(), []);

  // 店舗マスタ（自動補完用）
  const [shops, setShops] = useState<ShopRef[]>([]);
  const [shopsError, setShopsError] = useState<string | null>(null);

  // 店舗ごとの「前回セット時」の条件（localStorage と同期）
  const [lastSettingsByShopId, setLastSettingsByShopId] =
    useState<LastSettingsMap>(() => {
      if (typeof window === "undefined") return {};
      try {
        const raw = window.localStorage.getItem(LAST_SETTINGS_STORAGE_KEY);
        if (!raw) return {};
        return JSON.parse(raw) as LastSettingsMap;
      } catch {
        return {};
      }
    });

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        LAST_SETTINGS_STORAGE_KEY,
        JSON.stringify(lastSettingsByShopId),
      );
    } catch {
      // storage 書き込み失敗時は無視
    }
  }, [lastSettingsByShopId]);

  /**
   * 指定日の店舗リクエストを API から取得
   */
  const reloadForDate = async (targetDate: string) => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await listShopRequests({
        date: targetDate,
        take: 500,
        offset: 0,
      });
      const list = (res.items ?? []).map(mapRecordToUi);
      setItems(list);
    } catch (e) {
      console.error("failed to load shop-requests", e);
      setItems([]);
      setLoadError("店舗リクエストの取得に失敗しました。");
    } finally {
      setLoading(false);
    }
  };

  // ★ 選択日付が変わるたびに API から店舗リクエストを取得
  useEffect(() => {
    void reloadForDate(selectedDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

  // ★ 画面初期表示時に店舗マスタを取得（自動補完用）
  useEffect(() => {
    let cancelled = false;

    const loadShops = async () => {
      try {
        const res = await listShops({ q: "", limit: 1000, offset: 0 });
        if (cancelled) return;
        const list: ShopRef[] = (res.items ?? []).map((s: ShopListItem) => ({
          id: s.id,
          shopNumber: s.shopNumber ?? "",
          name: s.name ?? "",
        }));
        setShops(list);
      } catch (e) {
        console.error("failed to load shops for schedule page", e);
        if (!cancelled) {
          setShopsError(
            "店舗情報の取得に失敗しました。店舗番号・店舗名の自動補完は利用できません。",
          );
        }
      }
    };

    void loadShops();
    return () => {
      cancelled = true;
    };
  }, []);

  const findShopByCode = (code: string): ShopRef | undefined =>
    shops.find((s) => s.shopNumber === code);

  const findShopByName = (name: string): ShopRef | undefined =>
    shops.find((s) => s.name === name);

  const findShopById = (id: string): ShopRef | undefined =>
    shops.find((s) => s.id === id);

  /**
   * 店舗が確定したときに、店舗情報 & 「前回セット時」の条件を editing に反映
   */
  const applyShopSelection = (
    prev: UiShopRequest,
    shop: ShopRef,
  ): UiShopRequest => {
    const base: UiShopRequest = {
      ...prev,
      shopId: shop.id,
      code: shop.shopNumber || prev.code,
      name: shop.name || prev.name,
    };

    const last = lastSettingsByShopId[shop.id];
    if (last) {
      base.requestedHeadcount = last.requestedHeadcount;
      base.requireDrinkOk = last.requireDrinkOk;
      base.minHourly = last.minHourly;
      base.maxHourly = last.maxHourly;
      base.minAge = last.minAge;
      base.maxAge = last.maxAge;
    }

    return base;
  };

  const selectedDateLabel = useMemo(() => {
    if (selectedDate === TODAY) return "本日";
    if (selectedDate === TOMORROW) return "明日";
    return selectedDate;
  }, [selectedDate]);

  const dailyItems = useMemo(() => {
    let list: UiShopRequest[] = items.filter(
      (i: UiShopRequest) => i.date === selectedDate,
    );

    if (keyword.trim()) {
      const q = keyword.trim();
      list = list.filter(
        (i: UiShopRequest) =>
          i.name.includes(q) ||
          i.code.includes(q) ||
          (i.note ?? "").includes(q),
      );
    }

    list.sort((a: UiShopRequest, b: UiShopRequest) =>
      a.code.localeCompare(b.code),
    );
    return list;
  }, [items, selectedDate, keyword]);

  /**
   * 1週間分のざっくりサマリー
   */
  const weeklySummary = useMemo(() => {
    const base = selectedDate;
    const range: string[] = [];
    for (let i = 0; i < 7; i += 1) {
      range.push(addDays(base, i));
    }
    const counts: Record<string, number> = {};
    for (const d of range) counts[d] = 0;
    items.forEach((it: UiShopRequest) => {
      if (counts[it.date] != null) {
        counts[it.date] += 1;
      }
    });
    return { range, counts };
  }, [items, selectedDate]);

  const openNew = () => {
    setEditing(createEmptyRequestForDate(selectedDate));
    setEditingIsNew(true);
    setSaveError(null);
  };

  const openEdit = (req: UiShopRequest) => {
    setEditing(req);
    setEditingIsNew(false);
    setSaveError(null);
  };

  const closeEdit = () => {
    setEditing(null);
    setEditingIsNew(false);
    setSaveError(null);
  };

  /**
   * ★ API 経由で保存（新規 or 更新）
   */
  const saveEdit = async () => {
    if (!editing) return;

    setSaving(true);
    setSaveError(null);
    try {
      let dateKey = selectedDate;

      if (editingIsNew) {
        const payload = uiToCreatePayload(editing);
        const created = await createShopRequest(payload);
        dateKey =
          created.requestDate && created.requestDate.length >= 10
            ? created.requestDate.slice(0, 10)
            : selectedDate;
      } else {
        const payload = uiToUpdatePayload(editing);
        const updated = await updateShopRequest(editing.id, payload);
        dateKey =
          updated.requestDate && updated.requestDate.length >= 10
            ? updated.requestDate.slice(0, 10)
            : selectedDate;
      }

      // 「前回セット時」の条件を更新
      const shopIdForSettings = (editing.shopId ?? "").trim();
      if (shopIdForSettings) {
        setLastSettingsByShopId((prev) => ({
          ...prev,
          [shopIdForSettings]: {
            requestedHeadcount: editing.requestedHeadcount,
            requireDrinkOk: editing.requireDrinkOk,
            minHourly: editing.minHourly,
            maxHourly: editing.maxHourly,
            minAge: editing.minAge,
            maxAge: editing.maxAge,
          },
        }));
      }

      setSelectedDate(dateKey);
      await reloadForDate(dateKey);
      closeEdit();
    } catch (e: unknown) {
      console.error("failed to save shop-request", e);
      if (e instanceof Error && e.message) {
        setSaveError(e.message);
      } else {
        setSaveError("店舗リクエストの保存に失敗しました。");
      }
    } finally {
      setSaving(false);
    }
  };

  /**
   * ★ API 経由で削除
   */
  const deleteItem = async (req: UiShopRequest) => {
    if (
      !window.confirm(
        `【${req.date}】店舗番号 ${req.code} / ${req.name} のリクエストを削除しますか？`,
      )
    ) {
      return;
    }

    try {
      setSaving(true);
      await deleteShopRequest(req.id);
      await reloadForDate(selectedDate);
      if (editing && editing.id === req.id) {
        closeEdit();
      }
    } catch (e) {
      console.error("failed to delete shop-request", e);
      alert("削除に失敗しました。時間をおいて再度お試しください。");
    } finally {
      setSaving(false);
    }
  };

  const jumpToToday = () => setSelectedDate(TODAY);
  const jumpToTomorrow = () => setSelectedDate(TOMORROW);
  const moveDate = (diff: number) =>
    setSelectedDate((prev) => addDays(prev, diff));

  return (
    <AppShell>
      <div className="h-full flex flex-col gap-3">
        {/* ヘッダー */}
        <section className="tiara-panel p-3 flex flex-col gap-2">
          <header className="flex items-center justify-between">
            <div className="flex flex-col">
              <h1 className="text-sm font-semibold">
                スケジュール / 店舗リクエスト予定
              </h1>
              <p className="mt-0.5 text-[11px] text-muted">
                日付ごとに「店舗の必要人数・条件」を登録します。
                ここで登録した予定を元に、割当確認・マッチング画面の店舗条件へ反映していく想定です。
              </p>
              {shopsError && (
                <p className="mt-0.5 text-[11px] text-amber-300">
                  {shopsError}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] px-2 py-0.5 rounded-full bg白/15 border border-white/10">
                build: {buildStamp}
              </span>
            </div>
          </header>

          {/* 日付選択・フィルタ */}
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
            <div className="flex items-center gap-1">
              <span className="text-muted whitespace-nowrap">表示日付</span>
              <div className="inline-flex items-center gap-1">
                <button
                  type="button"
                  className="rounded-full border border-white/20 bg-white/10 px-2 py-1 text-[11px]"
                  onClick={() => moveDate(-1)}
                >
                  ← 前日
                </button>
                <input
                  type="date"
                  className="tiara-input h-8 text-xs"
                  value={selectedDate}
                  onChange={(e) => {
                    if (e.target.value) setSelectedDate(e.target.value);
                  }}
                />
                <button
                  type="button"
                  className="rounded-full border border-white/20 bg-white/10 px-2 py-1 text-[11px]"
                  onClick={() => moveDate(1)}
                >
                  翌日 →
                </button>
              </div>
              <span className="ml-2 text-[11px] text-muted">
                ラベル: {selectedDateLabel}
              </span>
            </div>

            <div className="flex items-center gap-1">
              <span className="text-muted whitespace-nowrap">
                ショートカット
              </span>
              <div className="inline-flex rounded-full bg-white/70 border border-slate-200 overflow-hidden">
                <button
                  type="button"
                  className={`px-3 py-1 ${
                    selectedDate === TODAY
                      ? "bg-slate-900 text-ink"
                      : "bg-transparent text-slate-700"
                  } text-[11px`}
                  onClick={jumpToToday}
                >
                  本日
                </button>
                <button
                  type="button"
                  className={`px-3 py-1 ${
                    selectedDate === TOMORROW
                      ? "bg-slate-900 text-ink"
                      : "bg-transparent text-slate-700"
                  } text-[11px`}
                  onClick={jumpToTomorrow}
                >
                  明日
                </button>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <span className="text-muted whitespace-nowrap">キーワード</span>
              <input
                className="tiara-input h-8 w-[260px] text-xs"
                placeholder="店舗番号・店舗名・メモで検索"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
              />
            </div>

            <div className="ml-auto flex items-center gap-1">
              <span className="text-muted whitespace-nowrap">表示</span>
              <div className="inline-flex rounded-full bg-white/70 border border-slate-200 overflow-hidden">
                <button
                  type="button"
                  className={`px-3 py-1 ${
                    rangeView === "day"
                      ? "bg-slate-900 text-ink"
                      : "bg-transparent text-slate-700"
                  } text-[11px`}
                  onClick={() => setRangeView("day")}
                >
                  1日
                </button>
                <button
                  type="button"
                  className={`px-3 py-1 ${
                    rangeView === "week"
                      ? "bg-slate-900 text-ink"
                      : "bg-transparent text-slate-700"
                  } text-[11px`}
                  onClick={() => setRangeView("week")}
                >
                  選択日から1週間
                </button>
              </div>
            </div>
          </div>

          {/* ローディング・エラー表示 */}
          {loading && (
            <p className="mt-1 text-xs text-muted">
              店舗リクエストを取得中です…
            </p>
          )}
          {loadError && !loading && (
            <p className="mt-1 text-xs text-red-400">{loadError}</p>
          )}
        </section>

        {/* メイン */}
        <div className="flex-1 flex gap-3">
          {/* 左：当日リスト */}
          <section className="tiara-panel flex-1 p-3 flex flex-col overflow-hidden">
            <div className="flex items-center justify-between mb-2 text-[11px] text-muted">
              <span>
                {selectedDateLabel} の店舗リクエスト：
                <span className="font-semibold text-ink">
                  {dailyItems.length}
                </span>{" "}
                件
              </span>
              <button
                type="button"
                className="tiara-btn text-[11px] px-3 py-1"
                onClick={openNew}
              >
                ＋ この日に店舗リクエストを追加
              </button>
            </div>

            <div className="flex-1 overflow-auto rounded-xl border border-white/10 bg-white/5">
              <table className="w-full text-xs">
                <thead className="bg-slate-900/60 text-[11px] text-muted sticky top-0 z-10">
                  <tr>
                    <th className="px-3 py-2 text-left w-[80px]">店舗番号</th>
                    <th className="px-3 py-2 text-left">店舗名</th>
                    <th className="px-3 py-2 text-right w-[80px]">希望人数</th>
                    <th className="px-3 py-2 text-right w-[120px]">
                      時給レンジ
                    </th>
                    <th className="px-3 py-2 text-right w-[120px]">
                      年齢レンジ
                    </th>
                    <th className="px-3 py-2 text-center w-[80px]">
                      飲酒条件
                    </th>
                    <th className="px-3 py-2 text-left">メモ</th>
                    <th className="px-3 py-2 text-center w-[120px]">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td
                        className="px-3 py-4 text-center text-[11px] text-muted"
                        colSpan={8}
                      >
                        データを読み込み中です…
                      </td>
                    </tr>
                  ) : loadError ? (
                    <tr>
                      <td
                        className="px-3 py-4 text-center text-[11px] text-red-300"
                        colSpan={8}
                      >
                        {loadError}
                      </td>
                    </tr>
                  ) : dailyItems.length === 0 ? (
                    <tr>
                      <td
                        className="px-3 py-4 text-center text-[11px] text-muted"
                        colSpan={8}
                      >
                        {selectedDate === TODAY
                          ? "本日のリクエスト店舗がセットされていません。"
                          : "この日付にはまだ店舗リクエストが登録されていません。"}
                      </td>
                    </tr>
                  ) : (
                    dailyItems.map((req: UiShopRequest) => (
                      <tr
                        key={req.id}
                        className="border-t border-white/5 hover:bg-slate-900/30"
                      >
                        <td className="px-3 py-2 font-mono">{req.code}</td>
                        <td className="px-3 py-2">{req.name}</td>
                        <td className="px-3 py-2 text-right">
                          {req.requestedHeadcount} 名
                        </td>
                        <td className="px-3 py-2 text-right">
                          {req.minHourly
                            ? `¥${req.minHourly.toLocaleString()}`
                            : "-"}
                          {" 〜 "}
                          {req.maxHourly
                            ? `¥${req.maxHourly.toLocaleString()}`
                            : "-"}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {req.minAge ?? "-"}{" 〜 "}
                          {req.maxAge ?? "-"} 歳
                        </td>
                        <td className="px-3 py-2 text-center">
                          {req.requireDrinkOk ? "飲酒OK必須" : "不問"}
                        </td>
                        <td className="px-3 py-2 max-w-[260px]">
                          <span className="line-clamp-2 text-[11px] text-ink/80">
                            {req.note || "-"}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-center">
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              className="tiara-btn text-[11px] px-3 py-1"
                              onClick={() => openEdit(req)}
                            >
                              編集
                            </button>
                            <button
                              type="button"
                              className="rounded-xl border border-red-500/70 bg-red-500/10 text-red-100 px-3 py-1 text-[11px]"
                              onClick={() => void deleteItem(req)}
                              disabled={saving}
                            >
                              削除
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* 右：1週間サマリー */}
          <aside className="tiara-panel w-[260px] shrink-0 p-3 flex flex-col">
            <header className="pb-2 border-b border-white/10">
              <h2 className="text-xs font-semibold text-ink">
                {selectedDateLabel} から 1 週間の予定
              </h2>
              <p className="mt-0.5 text-[11px] text-muted">
                日付ごとの登録件数のざっくりサマリーです。
                将来的にカレンダー表示に差し替え予定。
              </p>
            </header>

            <div className="mt-2 flex-1 overflow-auto text-xs">
              <ul className="space-y-1.5">
                {weeklySummary.range.map((dKey: string) => {
                  const count = weeklySummary.counts[dKey] ?? 0;
                  const isToday = dKey === TODAY;
                  const isSelected = dKey === selectedDate;

                  const label =
                    dKey === TODAY
                      ? "本日"
                      : dKey === TOMORROW
                      ? "明日"
                      : dKey;

                  return (
                    <li key={dKey}>
                      <button
                        type="button"
                        className={
                          "w-full flex items-center justify-between rounded-lg border px-2 py-1.5 transition-colors " +
                          (isSelected
                            ? "bg-sky-600/30 border-sky-400 text-ink"
                            : "bg-white/5 border-white/10 text-ink/80 hover:border-sky-400")
                        }
                        onClick={() => setSelectedDate(dKey)}
                      >
                        <div className="flex flex-col text-left">
                          <span className="font-mono text-[11px]">
                            {dKey}
                          </span>
                          <span className="text-[10px] text-muted">
                            {label}
                            {isToday ? "（Today）" : ""}
                          </span>
                        </div>
                        <span className="text-[11px]">{count} 件</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </aside>
        </div>
      </div>

      {/* 編集 / 新規追加モーダル */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={closeEdit} />
          <div className="relative z-10 w-full max-w-2xl max-h-[85vh] rounded-2xl bg-slate-950 border border-white/10 shadow-xl flex flex-col overflow-hidden">
            <header className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-ink">
                  {editingIsNew
                    ? "新規店舗リクエストを追加"
                    : "店舗リクエストを編集"}
                </h2>
                <p className="mt-0.5 text-[11px] text-muted">
                  指定日の店舗リクエスト条件を設定します。
                </p>
              </div>
              <button
                type="button"
                className="text-xs text-muted hover:text-ink"
                onClick={closeEdit}
              >
                ✕
              </button>
            </header>

            <div className="flex-1 overflow-auto p-4 space-y-4 text-xs text-ink">
              <div>
                <label className="block text-[11px] text-muted mb-1">
                  日付（変更すると別の日付の予定になります）
                </label>
                <input
                  type="date"
                  className="tiara-input h-8 w-full text-xs"
                  value={editing.date}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      date: e.target.value || editing.date,
                    })
                  }
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-[11px] text-muted mb-1">
                    店舗番号
                  </label>
                  <input
                    className="tiara-input h-8 w-full text-xs"
                    placeholder="例）001"
                    value={editing.code}
                    onChange={(e) =>
                      setEditing({ ...editing, code: e.target.value })
                    }
                    onBlur={(e) => {
                      if (!editing) return;
                      const code = e.target.value.trim();
                      if (!code) return;
                      const shop = findShopByCode(code);
                      if (!shop) return;
                      setEditing((prev) =>
                        prev ? applyShopSelection(prev, shop) : prev,
                      );
                    }}
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-[11px] text-muted mb-1">
                    店舗名
                  </label>
                  <input
                    className="tiara-input h-8 w-full text-xs"
                    placeholder="例）クラブ ティアラ本店"
                    value={editing.name}
                    onChange={(e) =>
                      setEditing({ ...editing, name: e.target.value })
                    }
                    onBlur={(e) => {
                      if (!editing) return;
                      const name = e.target.value.trim();
                      if (!name) return;
                      const shop = findShopByName(name);
                      if (!shop) return;
                      setEditing((prev) =>
                        prev ? applyShopSelection(prev, shop) : prev,
                      );
                    }}
                  />
                </div>
              </div>

              {/* ★ 開発用: 店舗ID 直接入力フィールド */}
              <div>
                <label className="block text-[11px] text-muted mb-1">
                  店舗ID（開発用）
                </label>
                <input
                  className="tiara-input h-8 w-full text-xs font-mono"
                  placeholder="例）shops.id を貼り付け"
                  value={editing.shopId ?? ""}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      shopId: e.target.value.trim() || "",
                    })
                  }
                  onBlur={(e) => {
                    if (!editing) return;
                    const id = e.target.value.trim();
                    if (!id) return;
                    const shop = findShopById(id);
                    if (!shop) return;
                    setEditing((prev) =>
                      prev ? applyShopSelection(prev, shop) : prev,
                    );
                  }}
                />
                <p className="mt-1 text-[10px] text-muted">
                  ※ 現状は店舗マスタ連携前のため、テスト時は{" "}
                  <code className="mx-1">shops.id</code>（UUID）を Swagger や
                  DB からコピーして貼り付けてください。
                  本番ではプルダウン選択に置き換える予定です。
                </p>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-[11px] text-muted mb-1">
                    希望人数
                  </label>
                  <input
                    type="number"
                    className="tiara-input h-8 w-full text-xs text-right"
                    min={0}
                    value={editing.requestedHeadcount}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        requestedHeadcount: Number(e.target.value || 0),
                      })
                    }
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-muted mb-1">
                    飲酒条件
                  </label>
                  <select
                    className="tiara-input h-8 w-full text-xs"
                    value={editing.requireDrinkOk ? "require" : "any"}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        requireDrinkOk: e.target.value === "require",
                      })
                    }
                  >
                    <option value="any">不問（飲酒NGも可）</option>
                    <option value="require">飲酒OK必須</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* ★ 希望時給レンジ：プリセット式ドロップダウン */}
                <div>
                  <label className="block text-[11px] text-muted mb-1">
                    希望時給レンジ（円）
                  </label>
                  <select
                    className="tiara-input h-8 w-full text-xs"
                    value={getHourlyLabelFromRange(
                      editing.minHourly,
                      editing.maxHourly,
                    )}
                    onChange={(e) => {
                      const label = e.target.value;
                      const opt = HOURLY_RANGE_OPTIONS.find(
                        (o) => o.label === label,
                      );
                      setEditing({
                        ...editing,
                        minHourly: opt?.min,
                        maxHourly: opt?.max,
                      });
                    }}
                  >
                    {HOURLY_RANGE_OPTIONS.map((opt) => (
                      <option key={opt.label} value={opt.label}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-[11px] text-muted">
                    店舗管理ページの「時給」と同じプリセットで揃えています。
                  </p>
                </div>

                <div>
                  <label className="block text-[11px] text-muted mb-1">
                    希望年齢レンジ（歳）
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      className="tiara-input h-8 w-full text-xs text-right"
                      placeholder="min"
                      value={editing.minAge ?? ""}
                      onChange={(e) =>
                        setEditing({
                          ...editing,
                          minAge: e.target.value
                            ? Number(e.target.value)
                            : undefined,
                        })
                      }
                    />
                    <span className="text-muted">〜</span>
                    <input
                      type="number"
                      className="tiara-input h-8 w-full text-xs text-right"
                      placeholder="max"
                      value={editing.maxAge ?? ""}
                      onChange={(e) =>
                        setEditing({
                          ...editing,
                          maxAge: e.target.value
                            ? Number(e.target.value)
                            : undefined,
                        })
                      }
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-[11px] text-muted mb-1">
                  備考メモ（NG情報・客層など）
                </label>
                <textarea
                  className="tiara-input w-full text-xs min-h-[80px]"
                  value={editing.note ?? ""}
                  onChange={(e) =>
                    setEditing({ ...editing, note: e.target.value })
                  }
                  placeholder="例）NGキャスト: A101 / A205 など。客層・希望タイプ・注意事項などを記載。"
                />
              </div>

              {saveError && (
                <p className="text-[11px] text-red-400">{saveError}</p>
              )}
            </div>

            <footer className="px-4 py-3 border-t border-white/10 flex items-center justify-end gap-2">
              <button
                type="button"
                className="rounded-xl border border-white/20 bg-white/5 text-ink px-4 py-1.5 text-xs"
                onClick={closeEdit}
                disabled={saving}
              >
                キャンセル
              </button>
              <button
                type="button"
                className="tiara-btn text-xs disabled:opacity-60"
                onClick={() => void saveEdit()}
                disabled={saving}
              >
                {editingIsNew ? "追加（API保存）" : "保存（API保存）"}
              </button>
            </footer>
          </div>
        </div>
      )}
    </AppShell>
  );
}
