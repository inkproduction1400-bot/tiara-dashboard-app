// src/app/casts/page.tsx
"use client";

import {
  useMemo,
  useState,
  useEffect,
  type MouseEvent,
  useCallback,
  type Dispatch,
  type SetStateAction,
  type ReactNode,
} from "react";
import AppShell from "@/components/AppShell";
import { createPortal } from "react-dom";
import {
  listCasts,
  getCast,
  updateCast,
  deleteCast,
  type CastDetail,
  type CastListItem,
} from "@/lib/api.casts";
import { listShops } from "@/lib/api.shops";

/**
 * 一覧用キャスト行（API からの view model）
 * - 管理番号（4桁数字）
 * - 名前
 * - ふりがな
 * - 年齢（生年月日からフロントで自動算出。なければ API の age）
 * - 希望時給
 * - キャストID（A001 など）※現状はプレースホルダ
 * - 担当者名 ※現状はプレースホルダ
 * - 旧システムのスタッフID（legacyStaffId）
 */
type CastRow = {
  id: string;
  managementNumber: string; // 管理番号（4桁など）
  name: string;
  furigana: string;
  age: number | null;
  desiredHourly: number | null;
  castCode: string;
  ownerStaffName: string;
  legacyStaffId: number | null;
};

// ★ 並び替えモード：50音順 or 旧スタッフID昇順/降順
type SortMode = "kana" | "legacy" | "legacyDesc";

/** ジャンル選択肢（複数選択） */
const CAST_GENRE_OPTIONS = ["クラブ", "キャバ", "スナック", "ガルバ"] as const;
type CastGenre = (typeof CAST_GENRE_OPTIONS)[number];

/** ティアラ査定時給の選択肢（2500〜10000） */
const TIARA_HOURLY_OPTIONS = [
  2500, 3000, 3500, 4000, 4500, 5000, 5500, 6000, 6500, 7000, 7500, 8000, 8500,
  9000, 9500, 10000,
] as const;

/** ランク選択肢 */
const CAST_RANK_OPTIONS = ["S", "A", "B", "C"] as const;
type CastRank = (typeof CAST_RANK_OPTIONS)[number];

/** 体型（スクショ「体系」ドロップダウン相当：保存先未確定なので UI 優先でローカル保持） */
const BODY_TYPE_OPTIONS = ["細身", "普通", "グラマー", "ぽっちゃり", "不明"] as const;
type BodyType = (typeof BODY_TYPE_OPTIONS)[number];

/** モーダルを document.body 直下に出すためのポータル */
function ModalPortal({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  if (!mounted) return null;
  return createPortal(children, document.body);
}

/** 旧システム由来のゴミ値（NULL 配列 / PHP シリアライズなど）を空文字に正規化 */
function sanitizeBackgroundField(raw?: string | null): string {
  if (raw == null) return "";
  const v = String(raw).trim();
  if (!v) return "";

  const lower = v.toLowerCase();

  // 単純な NULL 文字列
  if (lower === "null" || lower === "none") return "";

  // PHP シリアライズっぽい a:6:{...}
  if (v.startsWith("a:")) return "";

  // [[null,null]] など配列文字列っぽいもの
  if (v.startsWith("[[") || v.startsWith("{{")) return "";
  if (/^\[.*null.*\]$/.test(lower)) return "";

  return v;
}

/** 生年月日(YYYY-MM-DD / YYYY/MM/DD / YYYY.MM.DD など)から年齢を計算 */
function calcAgeFromBirthdate(birthdate?: string | null): number | null {
  if (!birthdate) return null;
  const src = birthdate.trim();
  if (!src) return null;

  const safe = src.replace(/\./g, "-").replace(/\//g, "-");
  const d = new Date(safe);
  if (Number.isNaN(d.getTime())) return null;

  const today = new Date();
  let age = today.getFullYear() - d.getFullYear();
  const m = today.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < d.getDate())) {
    age -= 1;
  }
  if (age < 0 || age > 130) return null;
  return age;
}

export default function Page() {
  const [q, setQ] = useState("");
  const [staffFilter, setStaffFilter] = useState<string>("");
  const [sortMode, setSortMode] = useState<SortMode>("kana");

  const [baseRows, setBaseRows] = useState<CastRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selected, setSelected] = useState<CastRow | null>(null);
  const [detail, setDetail] = useState<CastDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // 削除モーダル用
  const [deleteTarget, setDeleteTarget] = useState<CastRow | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // ★ ページング
  const [limit, setLimit] = useState(40); // 1ページ最大件数（2列なので 20×2 のイメージ）
  const [offset, setOffset] = useState(0);

  // フィルタ変更時は先頭ページに戻す
  useEffect(() => {
    setOffset(0);
  }, [q, staffFilter, sortMode]);

  // 一覧取得：初回に最大 10,000 件を一括ロード（検索はフロント側で実施）
  useEffect(() => {
    let canceled = false;

    async function run() {
      setLoading(true);
      setLoadError(null);

      try {
        // API 側は take のみ受付（offset は送らない）
        const res = await listCasts({
          limit: 10_000, // 安全な最大件数（API 側で 1〜10,000 にクランプされる想定）
        });

        if (canceled) return;

        const allItems: CastListItem[] = res.items ?? [];

        const mapped: CastRow[] = allItems.map((c: CastListItem | any) => {
          const birthdate: string | null = (c as any).birthdate ?? null;
          const ageFromBirth =
            calcAgeFromBirthdate(birthdate) ?? ((c as any).age ?? null);

          return {
            id: (c as any).userId ?? (c as any).id, // userId / id どちらでも対応
            managementNumber: (c as any).managementNumber ?? "----",
            name: (c as any).displayName ?? "(名前未設定)",
            furigana:
              (c as any).furigana ??
              (c as any).displayNameKana ??
              (c as any).displayName ??
              "(名前未設定)",
            age: ageFromBirth,
            // 希望時給は preferences.desiredHourly を API が flatten していない前提なので any でケア
            desiredHourly: (c as any).desiredHourly ?? null,
            // API からのキャストID（例: A001 など）。castCode / cast_code 両方ケア
            castCode: (c as any).castCode ?? (c as any).cast_code ?? "-",
            ownerStaffName: "-", // 仕様確定後に API フィールドと紐付け
            legacyStaffId: (c as any).legacyStaffId ?? null,
          };
        });

        setBaseRows(mapped);
      } catch (e: any) {
        console.error(e);
        if (!canceled) {
          setLoadError(e?.message ?? "キャスト一覧の取得に失敗しました");
        }
      } finally {
        if (!canceled) {
          setLoading(false);
        }
      }
    }

    run();

    return () => {
      canceled = true;
    };
  }, []);

  // 担当者ドロップダウン用の一覧
  const staffOptions = useMemo(() => {
    const set = new Set<string>();
    baseRows.forEach((r) => {
      if (r.ownerStaffName && r.ownerStaffName !== "-") set.add(r.ownerStaffName);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ja"));
  }, [baseRows]);

  // 検索＋担当者フィルタ＋ソート（完全にフロント側で実施）
  const rows = useMemo(() => {
    const query = q.trim();
    let result = baseRows.filter((r) => {
      if (staffFilter && r.ownerStaffName !== staffFilter) return false;
      if (!query) return true;

      // 管理番号 / 名前 / ふりがな / 旧スタッフID に含まれていればヒット（旧ID検索対応）
      const legacy = r.legacyStaffId != null ? String(r.legacyStaffId) : "";
      const hay = `${r.managementNumber} ${r.castCode} ${r.name} ${r.furigana} ${legacy}`;
      return hay.includes(query);
    });

    result = result.slice().sort((a, b) => {
      if (sortMode === "legacy") {
        // 旧スタッフID昇順（数値昇順, null は末尾）
        const aNull = a.legacyStaffId == null;
        const bNull = b.legacyStaffId == null;
        if (aNull && bNull) {
          // 両方 null → 管理番号 → ふりがな/名前
          const cmpMng = a.managementNumber.localeCompare(b.managementNumber, "ja");
          if (cmpMng !== 0) return cmpMng;
          const aKey = a.furigana || a.name;
          const bKey = b.furigana || b.name;
          return aKey.localeCompare(bKey, "ja");
        }
        if (aNull) return 1;
        if (bNull) return -1;

        const av = a.legacyStaffId as number;
        const bv = b.legacyStaffId as number;
        if (av !== bv) return av - bv;
        // 同じ旧IDなら ふりがな/名前 → 管理番号
        const aKey = a.furigana || a.name;
        const bKey = b.furigana || b.name;
        const cmpKana = aKey.localeCompare(bKey, "ja");
        if (cmpKana !== 0) return cmpKana;
        return a.managementNumber.localeCompare(b.managementNumber, "ja");
      }

      if (sortMode === "legacyDesc") {
        // 旧スタッフID降順（数値降順, null は末尾）
        const aNull = a.legacyStaffId == null;
        const bNull = b.legacyStaffId == null;
        if (aNull && bNull) {
          // 両方 null → 管理番号 → ふりがな/名前（昇順のままでOK）
          const cmpMng = a.managementNumber.localeCompare(b.managementNumber, "ja");
          if (cmpMng !== 0) return cmpMng;
          const aKey = a.furigana || a.name;
          const bKey = b.furigana || b.name;
          return aKey.localeCompare(bKey, "ja");
        }
        if (aNull) return 1;
        if (bNull) return -1;

        const av = a.legacyStaffId as number;
        const bv = b.legacyStaffId as number;
        if (av !== bv) return bv - av; // ★ 降順
        // 同じ旧IDなら ふりがな/名前 → 管理番号（昇順のままでOK）
        const aKey = a.furigana || a.name;
        const bKey = b.furigana || b.name;
        const cmpKana = aKey.localeCompare(bKey, "ja");
        if (cmpKana !== 0) return cmpKana;
        return a.managementNumber.localeCompare(b.managementNumber, "ja");
      }

      // デフォルト: 50音順（ふりがな or 名前）→ 管理番号
      const aKey = a.furigana || a.name;
      const bKey = b.furigana || b.name;
      const cmpKana = aKey.localeCompare(bKey, "ja");
      if (cmpKana !== 0) return cmpKana;
      return a.managementNumber.localeCompare(b.managementNumber, "ja");
    });

    return result;
  }, [q, staffFilter, sortMode, baseRows]);

  // ★ ページング後の 2 列用データ
  const total = rows.length;
  const safeOffset = Math.min(offset, Math.max(total - 1, 0));
  const pagedRows = total ? rows.slice(safeOffset, safeOffset + limit) : [];
  const leftRows = pagedRows.filter((_, idx) => idx % 2 === 0);
  const rightRows = pagedRows.filter((_, idx) => idx % 2 === 1);

  const pageStart = total === 0 ? 0 : safeOffset + 1;
  const pageEnd = total === 0 ? 0 : Math.min(safeOffset + limit, total);
  const canPrev = safeOffset > 0;
  const canNext = safeOffset + limit < total;

  const pagination = (
    <div className="flex items-center justify-end gap-2 text-[11px] text-muted">
      <span>
        {total
          ? `${total.toLocaleString()}件中 ${pageStart.toLocaleString()}〜${pageEnd.toLocaleString()}件を表示`
          : "0件"}
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          className="px-2 py-1 rounded-lg border border-gray-300 bg-gray-50 disabled:opacity-50"
          disabled={!canPrev}
          onClick={() => {
            if (!canPrev) return;
            setOffset(Math.max(safeOffset - limit, 0));
          }}
        >
          前へ
        </button>
        <button
          type="button"
          className="px-2 py-1 rounded-lg border border-gray-300 bg-gray-50 disabled:opacity-50"
          disabled={!canNext}
          onClick={() => {
            if (!canNext) return;
            setOffset(safeOffset + limit);
          }}
        >
          次へ
        </button>
        <select
          className="tiara-input h-[26px] text-[11px] w-[70px]"
          value={limit}
          onChange={(e) => {
            const v = Number(e.target.value) || 40;
            setLimit(v);
            setOffset(0);
          }}
        >
          <option value={20}>20件</option>
          <option value={40}>40件</option>
          <option value={80}>80件</option>
        </select>
      </div>
    </div>
  );

  // 行クリック → 詳細 API 取得
  const handleRowClick = (r: CastRow) => {
    setSelected(r);
    setDetail(null);
    setDetailError(null);
    setDetailLoading(true);

    let canceled = false;

    (async () => {
      try {
        const d = await getCast(r.id);
        if (canceled) return;
        setDetail(d);
      } catch (e: any) {
        console.error(e);
        if (!canceled) {
          setDetailError(e?.message ?? "キャスト詳細の取得に失敗しました");
        }
      } finally {
        if (!canceled) {
          setDetailLoading(false);
        }
      }
    })();

    return () => {
      canceled = true;
    };
  };

  const handleCloseModal = () => {
    setSelected(null);
    setDetail(null);
    setDetailError(null);
    setDetailLoading(false);
  };

  // 保存成功時：detail と一覧の表示を更新（年齢も生年月日から再計算）
  const handleDetailUpdated = (updated: CastDetail) => {
    setDetail(updated);

    const updatedAge = calcAgeFromBirthdate(updated.birthdate ?? null) ?? null;

    const updatedAny = updated as any;
    const updatedOwnerStaffNameRaw =
      updatedAny.background?.ownerStaffName ?? updatedAny.ownerStaffName ?? null;

    setSelected((prev) =>
      prev
        ? {
            ...prev,
            name: updated.displayName ?? prev.name,
            furigana:
              (updated as any).furigana ??
              (updated as any).displayNameKana ??
              updated.displayName ??
              prev.furigana,
            managementNumber: updated.managementNumber ?? prev.managementNumber,
            desiredHourly: updated.preferences?.desiredHourly ?? prev.desiredHourly,
            age: updatedAge ?? prev.age,
            ownerStaffName:
              typeof updatedOwnerStaffNameRaw === "string" &&
              updatedOwnerStaffNameRaw.trim()
                ? updatedOwnerStaffNameRaw
                : prev.ownerStaffName,
          }
        : prev,
    );

    setBaseRows((prev) =>
      prev.map((r) =>
        r.id === updated.userId
          ? {
              ...r,
              name: updated.displayName ?? r.name,
              furigana:
                (updated as any).furigana ??
                (updated as any).displayNameKana ??
                updated.displayName ??
                r.furigana,
              managementNumber: updated.managementNumber ?? r.managementNumber,
              desiredHourly: updated.preferences?.desiredHourly ?? r.desiredHourly,
              age: calcAgeFromBirthdate(updated.birthdate ?? null) ?? r.age,
              ownerStaffName:
                typeof updatedOwnerStaffNameRaw === "string" &&
                updatedOwnerStaffNameRaw.trim()
                  ? updatedOwnerStaffNameRaw
                  : r.ownerStaffName,
            }
          : r,
      ),
    );
  };

  // 削除ボタン押下 → 確認モーダル表示
  const handleClickDelete = (e: MouseEvent<HTMLButtonElement>, row: CastRow) => {
    e.stopPropagation(); // 行クリック（詳細表示）を止める
    setDeleteTarget(row);
    setDeleteError(null);
  };

  // 削除確定処理
  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await deleteCast(deleteTarget.id);
      // 一覧から除外
      setBaseRows((prev) => prev.filter((r) => r.id !== deleteTarget.id));
      // 詳細を開いていたら閉じる
      if (selected && selected.id === deleteTarget.id) {
        handleCloseModal();
      }
      setDeleteTarget(null);
    } catch (e: any) {
      console.error(e);
      setDeleteError(e?.message ?? "削除に失敗しました");
    } finally {
      setDeleteBusy(false);
    }
  };

  const handleCancelDelete = () => {
    if (deleteBusy) return;
    setDeleteTarget(null);
    setDeleteError(null);
  };

  // 一覧テーブル（2列用共通）
  const renderTable = (slice: CastRow[]) => (
    <div className="overflow-auto rounded-xl border border-gray-200 bg-white">
      <table className="w-full text-[12px]">
        <thead className="bg-gray-50 text-muted">
          <tr>
            <th className="text-left px-2 py-1 w-24">管理番号</th>
            <th className="text-left px-2 py-1 w-20">キャストID</th>
            <th className="text-left px-2 py-1">名前</th>
            <th className="text-left px-2 py-1 w-10">年齢</th>
            <th className="text-left px-2 py-1 w-20">希望時給</th>
            <th className="text-left px-2 py-1 w-20">旧ID</th>
            <th className="text-left px-2 py-1 w-24">担当者</th>
            <th className="text-left px-2 py-1 w-16">操作</th>
          </tr>
        </thead>
        <tbody>
          {slice.map((r) => (
            <tr
              key={r.id}
              className="border-t border-gray-100 hover:bg-gray-50 cursor-pointer"
              onClick={() => handleRowClick(r)}
            >
              <td className="px-2 py-1 font-mono text-[11px]">{r.managementNumber}</td>
              <td className="px-2 py-1 font-mono text-[11px]">{r.castCode || "-"}</td>
              <td className="px-2 py-1 truncate">{r.name}</td>
              <td className="px-2 py-1 text-center">{r.age != null ? r.age : "-"}</td>
              <td className="px-2 py-1">
                {r.desiredHourly ? `¥${r.desiredHourly.toLocaleString()}` : "-"}
              </td>
              <td className="px-2 py-1 font-mono text-[11px]">
                {r.legacyStaffId != null ? r.legacyStaffId : "-"}
              </td>
              <td className="px-2 py-1 truncate">{r.ownerStaffName || "-"}</td>
              <td className="px-2 py-1">
                <button
                  type="button"
                  className="text-[10px] px-2 py-0.5 rounded-lg border border-red-400/60 bg-red-500/80 text-white hover:bg-red-500 disabled:opacity-60"
                  onClick={(e) => handleClickDelete(e, r)}
                >
                  削除
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <AppShell>
      <section className="tiara-panel h-full flex flex-col p-3 bg-white text-ink">
        <header className="pb-2 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-extrabold">キャスト管理</h2>
            <p className="text-xs text-muted">
              管理番号・名前・旧IDで検索／担当者と並び替えでソート
            </p>
          </div>
          <div className="text-[11px] text-muted">
            {loading
              ? "一覧を読み込み中…"
              : `${total.toLocaleString()} 件中 ${pageStart.toLocaleString()}〜${pageEnd.toLocaleString()} 件表示中`}
            {loadError && <span className="ml-2 text-red-400">（{loadError}）</span>}
          </div>
        </header>

        {/* フィルタ行 */}
        <div className="mt-3 grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.5fr)] gap-3">
          {/* 左：キーワード検索 */}
          <div className="flex flex-col gap-2">
            <input
              className="tiara-input"
              placeholder="管理番号・名前・旧IDで検索"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>

          {/* 右：担当者＆並び替え */}
          <div className="flex flex-col md:flex-row gap-2 md:items-center justify-end">
            {/* 担当者ドロップダウン */}
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted">担当者</span>
              <select
                className="tiara-input min-w-[120px]"
                value={staffFilter}
                onChange={(e) => setStaffFilter(e.target.value)}
              >
                <option value="">（すべて）</option>
                {staffOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>

            {/* 並び替え：チェックボタン風（実際はラジオ的な挙動） */}
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1 text-xs text-muted">
                <input
                  type="checkbox"
                  checked={sortMode === "kana"}
                  onChange={() => setSortMode("kana")}
                />
                50音順
              </label>
              <label className="flex items-center gap-1 text-xs text-muted">
                <input
                  type="checkbox"
                  checked={sortMode === "legacy"}
                  onChange={() => setSortMode("legacy")}
                />
                旧ID昇順
              </label>
              <label className="flex items-center gap-1 text-xs text-muted">
                <input
                  type="checkbox"
                  checked={sortMode === "legacyDesc"}
                  onChange={() => setSortMode("legacyDesc")}
                />
                旧ID降順
              </label>
              <button
                className="rounded-xl border border-gray-300 bg-gray-50 text-ink px-3 py-2 text-xs"
                onClick={() => {
                  setQ("");
                  setStaffFilter("");
                  setSortMode("kana");
                  setOffset(0);
                }}
              >
                クリア
              </button>
            </div>
          </div>
        </div>

        {/* 一覧（2列＋ページング） */}
        <div className="mt-3 flex flex-col gap-2 flex-1">
          {/* 上部ページング */}
          {pagination}

          {loading && (
            <div className="mt-4 text-center text-xs text-muted">一覧を読み込み中…</div>
          )}

          {!loading && total === 0 && (
            <div className="mt-4 text-center text-sm text-muted">該当データがありません</div>
          )}

          {total > 0 && (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
              {renderTable(leftRows)}
              {renderTable(rightRows)}
            </div>
          )}

          {/* 下部ページング */}
          {total > 0 && <div className="mt-2">{pagination}</div>}
        </div>

        {/* キャスト詳細モーダル（ポータル経由で body 直下に出す） */}
        {selected && (
          <ModalPortal>
            <CastDetailModal
              cast={selected}
              detail={detail}
              detailLoading={detailLoading}
              detailError={detailError}
              onClose={handleCloseModal}
              onUpdated={handleDetailUpdated}
              staffOptions={staffOptions}
            />
          </ModalPortal>
        )}

        {/* 削除確認モーダル */}
        {deleteTarget && (
          <ModalPortal>
            <DeleteCastModal
              target={deleteTarget}
              busy={deleteBusy}
              error={deleteError}
              onCancel={handleCancelDelete}
              onConfirm={handleConfirmDelete}
            />
          </ModalPortal>
        )}
      </section>
    </AppShell>
  );
}

type CastDetailModalProps = {
  cast: CastRow;
  detail: CastDetail | null;
  detailLoading: boolean;
  detailError: string | null;
  onClose: () => void;
  onUpdated: (d: CastDetail) => void;
  staffOptions: string[];
};

/**
 * シフトカレンダー用の簡易データ型
 */
type ShiftSlot = "free" | "21:00" | "21:30" | "22:00" | null;

type ShiftDay = {
  date: Date;
  inCurrentMonth: boolean;
  slot: ShiftSlot;
};

/**
 * 指定月のカレンダーデータ生成（前後の月の分も含めて 6 行分を返す）
 */
function buildMonthDays(year: number, month: number): ShiftDay[] {
  const first = new Date(year, month, 1);
  const firstWeekday = first.getDay(); // 0=日
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const days: ShiftDay[] = [];

  // 前月
  if (firstWeekday > 0) {
    const prevMonthDays = new Date(year, month, 0).getDate();
    for (let i = firstWeekday - 1; i >= 0; i--) {
      const d = prevMonthDays - i;
      days.push({
        date: new Date(year, month - 1, d),
        inCurrentMonth: false,
        slot: null,
      });
    }
  }

  // 当月
  for (let d = 1; d <= daysInMonth; d++) {
    days.push({
      date: new Date(year, month, d),
      inCurrentMonth: true,
      slot: null,
    });
  }

  // 次月
  while (days.length % 7 !== 0) {
    const nextIndex = days.length - (firstWeekday + daysInMonth);
    days.push({
      date: new Date(year, month + 1, nextIndex + 1),
      inCurrentMonth: false,
      slot: null,
    });
  }

  // 6 行そろえる
  while (days.length < 42) {
    const last = days[days.length - 1].date;
    const next = new Date(last);
    next.setDate(last.getDate() + 1);
    days.push({
      date: next,
      inCurrentMonth: false,
      slot: null,
    });
  }

  return days;
}

/** Cast 詳細モーダル用のフォーム state 型 */
type CastDetailForm = {
  displayName: string;
  birthdate: string;
  address: string;
  phone: string;
  email: string;
  // ティアラ査定時給（プルダウン: 2500〜10000）
  tiaraHourly: string;
  // ランク（S/A/B/C）
  rank: CastRank | "";
  // 担当者（プルダウン）
  ownerStaffName: string;
  // 希望出勤日（"月/火" などを想定）
  preferredDays: string;
  preferredTimeFrom: string;
  preferredTimeTo: string;
  preferredArea: string;
  // 時給・月給の自由入力メモ
  salaryNote: string;
  // プロフィール
  heightCm: string;
  clothingSize: string;
  shoeSizeCm: string;
  // 背景
  howFound: string;
  motivation: string;
  otherAgencies: string;
  reasonChoose: string;
  shopSelectionPoints: string;

  // 追加フィールド
  furigana: string;

  tattoo: "" | "有" | "無";
  needPickup: "" | "要" | "不要";
  drinkLevel: "" | "NG" | "弱い" | "普通" | "強い";
  hasExperience: "" | "あり" | "なし";
  workHistory: string;

  referrerName: string; // 紹介者名 / サイト名
  compareOtherAgencies: string; // 他の派遣会社との比較
  otherAgencyName: string; // 派遣会社名
  otherNotes: string; // その他（備考）
  thirtyKComment: string; // 30,000円到達への所感

  idDocType:
    | ""
    | "パスポート"
    | "マイナンバー"
    | "学生証"
    | "免許証"
    | "社員証"
    | "その他";

  /** 本籍地の証明種別 */
  residencyProof: "" | "パスポート" | "本籍地記載住民票";

  /** 宣誓（身分証のない・更新時） */
  oathStatus: "" | "済" | "未";

  idMemo: string; // 身分証関連の備考

  // ジャンル・NG店舗・専属指名・指名
  genres: CastGenre[];
  ngShopMemo: string;
  ngShopIds: string[];
  ngShopNames: string[];
  // UI上は「指名（複数店舗可）」として使用
  favoriteShopMemo: string;
  favoriteShopIds: string[];
  favoriteShopNames: string[];
  // 専属指名（1店舗）
  exclusiveShopMemo: string;
  exclusiveShopId: string | null;
  exclusiveShopName: string | null;

  // ===== スクショ「スタッフ入力項目」追加（保存先未確定なので UI 優先でフォーム保持）=====
  pickupDestination: string; // 送迎先（スクショ：自動入力）
  pickupDestinationExtra: string; // 送迎先追加（スクショ：アプリから反映）
  bodyType: BodyType | ""; // 体型（スクショ：プルダウン）
  atmosphere: number; // 雰囲気（スクショ：スライダー）
};

/**
 * キャスト詳細モーダル
 */
function CastDetailModal({
  cast,
  detail,
  detailLoading,
  detailError,
  onClose,
  onUpdated,
  staffOptions,
}: CastDetailModalProps) {
  const [shiftModalOpen, setShiftModalOpen] = useState(false);
  const [ngModalOpen, setNgModalOpen] = useState(false);
  const [exclusiveModalOpen, setExclusiveModalOpen] = useState(false);
  const [favoriteModalOpen, setFavoriteModalOpen] = useState(false);

  // ===== 店舗マスタ（NG/専属/指名モーダルで共通）=====
  const [shopsMaster, setShopsMaster] = useState<ShopLite[]>([]);
  const [shopsMasterLoaded, setShopsMasterLoaded] = useState(false);
  const [shopsMasterLoading, setShopsMasterLoading] = useState(false);

  const ensureShopsMasterLoaded = useCallback(async () => {
    if (shopsMasterLoaded || shopsMasterLoading) return;
    setShopsMasterLoading(true);
    try {
      const res = await listShops({ limit: 10000 });
      const items = (res as any)?.items ?? [];
      const lite: ShopLite[] = items.map((x: any) => ({
        id: x.id,
        name: x.name,
        genre: x.genre ?? null,
      }));
      setShopsMaster(lite);
      setShopsMasterLoaded(true);
    } catch (e) {
      console.error("[casts/page] failed to load shops master", e);
    } finally {
      setShopsMasterLoading(false);
    }
  }, [shopsMasterLoaded, shopsMasterLoading]);

  useEffect(() => {
    if (ngModalOpen || exclusiveModalOpen || favoriteModalOpen) {
      void ensureShopsMasterLoaded();
    }
  }, [ngModalOpen, exclusiveModalOpen, favoriteModalOpen, ensureShopsMasterLoaded]);

  useEffect(() => {
    if (shopsMasterLoaded || shopsMasterLoading) return;

    // 3モーダルで共通利用するため、初回に 1 回だけ 10,000 件まで取得して保持
    setShopsMasterLoading(true);
    (async () => {
      try {
        const res = await listShops({ limit: 10000 });
        const items = (res?.items ?? []) as any[];
        const lite: ShopLite[] = items.map((x) => ({
          id: String(x.id),
          name: String(x.name ?? ""),
          genre: x.genre ?? null,
        }));
        setShopsMaster(lite);
        setShopsMasterLoaded(true);
      } catch (e) {
        console.error("[CastDetailModal] failed to load shops master", e);
        setShopsMaster([]);
        setShopsMasterLoaded(true); // 失敗でも無限リトライしない
      } finally {
        setShopsMasterLoading(false);
      }
    })();
  }, [shopsMasterLoaded, shopsMasterLoading]);

  const [form, setForm] = useState<CastDetailForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveDone, setSaveDone] = useState(false);

  // detail 取得完了時にフォーム初期化
  useEffect(() => {
    if (!detail) {
      setForm(null);
      setSaveDone(false);
      setSaveError(null);
      return;
    }

    // ジャンル
    const rawGenres = (detail.background as any)?.genres;
    const genres: CastGenre[] = Array.isArray(rawGenres)
      ? (rawGenres as any[]).filter((g: any): g is CastGenre =>
          CAST_GENRE_OPTIONS.includes(g as CastGenre),
        )
      : [];

    // NG店舗（API: detail.ngShops）
    const existingNgShops: any[] = Array.isArray((detail as any).ngShops)
      ? ((detail as any).ngShops as any[])
      : [];
    const ngShopIds: string[] = existingNgShops
      .map((s) => String(s.id ?? s.shopId ?? ""))
      .filter(Boolean);
    const ngShopNames: string[] = existingNgShops
      .map((s) => (s.name ?? s.shopName ?? "") as string)
      .filter((n) => n && n.trim());

    // 専属指名（単一）
    const rawExclusive = (detail as any).exclusiveShop ?? null;
    const exclusiveShopId: string | null =
      (detail as any).exclusiveShopId ??
      (rawExclusive ? String(rawExclusive.id ?? rawExclusive.shopId ?? "") : null);
    const exclusiveShopName: string | null =
      rawExclusive && (rawExclusive.name ?? rawExclusive.shopName)
        ? String(rawExclusive.name ?? rawExclusive.shopName)
        : null;

    // 指名（複数）: nominatedShops を優先し、なければ legacy favoriteShops
    const nominatedFromApi: any[] = Array.isArray((detail as any).nominatedShops)
      ? ((detail as any).nominatedShops as any[])
      : Array.isArray((detail as any).favoriteShops)
      ? ((detail as any).favoriteShops as any[])
      : [];
    const favoriteShopIds: string[] = nominatedFromApi
      .map((s) => String(s.id ?? s.shopId ?? ""))
      .filter(Boolean);
    const favoriteShopNames: string[] = nominatedFromApi
      .map((s) => (s.name ?? s.shopName ?? "") as string)
      .filter((n) => n && n.trim());

    // ===== スクショ追加項目（存在すれば detail から拾う / なければ UI 初期値）=====
    const pickupDestination =
      (detail as any)?.attributes?.pickupDestination ??
      (detail as any)?.pickupDestination ??
      "";
    const pickupDestinationExtra =
      (detail as any)?.attributes?.pickupDestinationExtra ??
      (detail as any)?.pickupDestinationExtra ??
      "";
    const bodyTypeRaw =
      (detail as any)?.attributes?.bodyType ??
      (detail as any)?.bodyType ??
      "";
    const bodyType: CastDetailForm["bodyType"] = BODY_TYPE_OPTIONS.includes(bodyTypeRaw as any)
      ? (bodyTypeRaw as BodyType)
      : "";
    const atmosphereRaw =
      (detail as any)?.background?.atmosphere ??
      (detail as any)?.atmosphere ??
      50;
    const atmosphere =
      typeof atmosphereRaw === "number" && Number.isFinite(atmosphereRaw)
        ? Math.max(0, Math.min(100, Math.floor(atmosphereRaw)))
        : 50;

    setForm({
      displayName: detail.displayName ?? cast.name,
      birthdate: detail.birthdate ?? "",
      address: detail.address ?? "",
      phone: detail.phone ?? "",
      email: detail.email ?? "",
      tiaraHourly: (() => {
        const v = detail.preferences?.desiredHourly ?? null;
        if (
          v != null &&
          v >= TIARA_HOURLY_OPTIONS[0] &&
          v <= TIARA_HOURLY_OPTIONS[TIARA_HOURLY_OPTIONS.length - 1]
        ) {
          return String(v);
        }
        return "";
      })(),
      rank: ((detail.background as any)?.rank as CastDetailForm["rank"]) ?? "",
      ownerStaffName:
        (detail.background as any)?.ownerStaffName ??
        (cast.ownerStaffName && cast.ownerStaffName !== "-" ? cast.ownerStaffName : ""),
      salaryNote: (detail.background as any)?.salaryNote ?? "",
      preferredDays: detail.preferences?.preferredDays?.join(" / ") ?? "",
      preferredTimeFrom: detail.preferences?.preferredTimeFrom ?? "",
      preferredTimeTo: detail.preferences?.preferredTimeTo ?? "",
      preferredArea: detail.preferences?.preferredArea ?? "",
      heightCm: detail.attributes?.heightCm != null ? String(detail.attributes.heightCm) : "",
      clothingSize: detail.attributes?.clothingSize ?? "",
      shoeSizeCm:
        detail.attributes?.shoeSizeCm != null ? String(detail.attributes.shoeSizeCm) : "",
      // ★ SQLそのまま表示されたくない3項目は sanitize
      howFound: sanitizeBackgroundField(detail.background?.howFound),
      motivation: sanitizeBackgroundField(detail.background?.motivation),
      otherAgencies: sanitizeBackgroundField(detail.background?.otherAgencies),
      reasonChoose: detail.background?.reasonChoose ?? "",
      shopSelectionPoints: detail.background?.shopSelectionPoints ?? "",

      // 追加フィールド
      furigana:
        (detail as any).furigana ??
        (detail as any).displayNameKana ??
        detail.displayName ??
        cast.name,

      tattoo:
        detail.attributes?.tattoo == null ? "" : detail.attributes.tattoo ? "有" : "無",
      needPickup:
        detail.attributes?.needPickup == null
          ? ""
          : detail.attributes.needPickup
          ? "要"
          : "不要",
      drinkLevel:
        detail.attributes?.drinkLevel === "ng"
          ? "NG"
          : detail.attributes?.drinkLevel === "weak"
          ? "弱い"
          : detail.attributes?.drinkLevel === "strong"
          ? "強い"
          : detail.attributes?.drinkLevel === "normal"
          ? "普通"
          : (detail as any).drinkOk == null
          ? ""
          : (detail as any).drinkOk
          ? "普通"
          : "NG",
      hasExperience: detail.hasExperience == null ? "" : detail.hasExperience ? "あり" : "なし",
      workHistory: detail.note ?? "",

      referrerName: (detail.background as any)?.referrerName ?? "",
      compareOtherAgencies: (detail.background as any)?.compareOtherAgencies ?? "",
      otherAgencyName: (detail.background as any)?.otherAgencyName ?? "",
      otherNotes: (detail.background as any)?.otherNotes ?? "",
      thirtyKComment: (detail.background as any)?.thirtyKComment ?? "",

      idDocType: ((detail.background as any)?.idDocType as CastDetailForm["idDocType"]) ?? "",
      residencyProof:
        ((detail.background as any)?.residencyProof as CastDetailForm["residencyProof"]) ?? "",
      oathStatus: ((detail.background as any)?.oathStatus as CastDetailForm["oathStatus"]) ?? "",
      idMemo: (detail.background as any)?.idMemo ?? "",

      genres,
      ngShopMemo: (detail.background as any)?.ngShopMemo ?? "",
      ngShopIds,
      ngShopNames,
      favoriteShopMemo:
        (detail.background as any)?.nominatedShopMemo ??
        (detail.background as any)?.favoriteShopMemo ??
        "",
      favoriteShopIds,
      favoriteShopNames,
      exclusiveShopMemo: (detail.background as any)?.exclusiveShopMemo ?? "",
      exclusiveShopId,
      exclusiveShopName,

      // ===== 追加（スクショ）=====
      pickupDestination,
      pickupDestinationExtra,
      bodyType,
      atmosphere,
    });
    setSaveDone(false);
    setSaveError(null);
  }, [detail, cast.name, cast.ownerStaffName]);

  // 直近2日のシフト（とりあえずダミー。API detail.latestShifts 連携は後続タスク）
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);

  const todayLabel = `${today.getMonth() + 1}/${today.getDate()}`;
  const tomorrowLabel = `${tomorrow.getMonth() + 1}/${tomorrow.getDate()}`;

  const todaySlot: ShiftSlot = "free";
  const tomorrowSlot: ShiftSlot = "21:30";

  const formatSlot = (slot: ShiftSlot) => {
    if (!slot) return "—";
    if (slot === "free") return "FREE";
    return slot;
  };

  const displayName = form?.displayName ?? detail?.displayName ?? cast.name;
  const managementNumber = detail?.managementNumber ?? cast.managementNumber;
  const legacyStaffId = detail?.legacyStaffId ?? cast.legacyStaffId ?? null;

  const birthdateStr = form?.birthdate || detail?.birthdate || null;
  const computedAge = calcAgeFromBirthdate(birthdateStr);
  const birth =
    birthdateStr != null && birthdateStr !== ""
      ? computedAge != null
        ? `${birthdateStr}（${computedAge}歳）`
        : birthdateStr
      : "—";

  const handleSave = async () => {
    if (!detail || !form) return;
    setSaving(true);
    setSaveError(null);
    setSaveDone(false);
    try {
      // 数値系のパース
      const hourlyRaw = form.tiaraHourly.replace(/[^\d]/g, "");
      const desiredHourly = hourlyRaw.trim().length > 0 ? Number(hourlyRaw) || null : null;

      const heightRaw = form.heightCm.replace(/[^\d]/g, "");
      const heightCm = heightRaw.trim().length > 0 ? Number(heightRaw) || null : null;

      const shoeRaw = form.shoeSizeCm.replace(/[^\d]/g, "");
      const shoeSizeCm = shoeRaw.trim().length > 0 ? Number(shoeRaw) || null : null;

      // 出勤希望日を配列へ
      const preferredDays =
        form.preferredDays
          .split(/[\/、,\s]+/)
          .map((x) => x.trim())
          .filter(Boolean) || [];

      // 就業可否系
      const tattooFlag = form.tattoo === "" ? null : form.tattoo === "有" ? true : false;
      const needPickupFlag =
        form.needPickup === "" ? null : form.needPickup === "要" ? true : false;
      const drinkLevelInternal =
        form.drinkLevel === "NG"
          ? "ng"
          : form.drinkLevel === "弱い"
          ? "weak"
          : form.drinkLevel === "強い"
          ? "strong"
          : form.drinkLevel === "普通"
          ? "normal"
          : null;
      const hasExperienceFlag =
        form.hasExperience === "" ? null : form.hasExperience === "あり" ? true : false;

      const background: any = {
        howFound: form.howFound || null,
        motivation: form.motivation || null,
        otherAgencies: form.otherAgencies || null,
        reasonChoose: form.reasonChoose || null,
        shopSelectionPoints: form.shopSelectionPoints || null,
        // 追加分
        referrerName: form.referrerName || null,
        compareOtherAgencies: form.compareOtherAgencies || null,
        otherAgencyName: form.otherAgencyName || null,
        otherNotes: form.otherNotes || null,
        thirtyKComment: form.thirtyKComment || null,
        salaryNote: form.salaryNote || null,
        idDocType: form.idDocType || null,
        residencyProof: form.residencyProof || null,
        oathStatus: form.oathStatus || null,
        idMemo: form.idMemo || null,
        genres: form.genres?.length ? form.genres : null,
        ngShopMemo: form.ngShopMemo || null,
        favoriteShopMemo: form.favoriteShopMemo || null,
        exclusiveShopMemo: form.exclusiveShopMemo || null,
        nominatedShopMemo: form.favoriteShopMemo || null,
        rank: form.rank || null,
        ownerStaffName: form.ownerStaffName || null,

        // ★ スクショ「雰囲気」：保存先未確定だが UI 値は保持（API 側が受けるなら反映される想定）
        atmosphere: typeof form.atmosphere === "number" ? form.atmosphere : null,
      };

      // ★ NG / 専属 / 指名の ID 配列を仕様に合わせて構築
      const ngShopIds = form.ngShopIds ?? [];
      const exclusiveShopIds = form.exclusiveShopId ? [form.exclusiveShopId] : [];
      const nominatedShopIds = form.favoriteShopIds ?? [];

      const payload: Parameters<typeof updateCast>[1] = {
        displayName: form.displayName || null,
        furigana: form.furigana || null,
        birthdate: form.birthdate || null,
        address: form.address || null,
        phone: form.phone || null,
        email: form.email || null,
        // 勤務歴は暫定的に note に保存
        note: form.workHistory || detail.note || null,
        attributes: {
          heightCm,
          clothingSize: form.clothingSize || null,
          shoeSizeCm,
          tattoo: tattooFlag,
          needPickup: needPickupFlag,
          drinkLevel: drinkLevelInternal,
          // ★ pickupDestination / bodyType 等は DTO 側が未知なので attributes に入れない（400回避）
        },
        preferences: {
          desiredHourly,
          desiredMonthly: detail.preferences?.desiredMonthly ?? null,
          preferredDays,
          preferredTimeFrom: form.preferredTimeFrom || null,
          preferredTimeTo: form.preferredTimeTo || null,
          preferredArea: form.preferredArea || null,
          // NG メモは background 側で統一管理。ngShopNotes は送信しない。
          notes: detail.preferences?.notes ?? null,
        },
        background,
        hasExperience: hasExperienceFlag,
        // ★ NG店舗ID（モーダルで更新）
        ngShopIds,
        // ★ 専属指名・指名店舗
        exclusiveShopIds,
        nominatedShopIds,
      };

      const updated = await updateCast(cast.id, payload);

      // ★ フロント側で NG店舗情報・専属指名・指名情報とメモをパッチしてから親に渡す
      const updatedAny = updated as any;
      const patchedUpdated: CastDetail = {
        ...(updatedAny as CastDetail),
        background: {
          ...(updatedAny.background ?? {}),
          // フォームで編集した値を優先
          ngShopMemo: form.ngShopMemo || updatedAny.background?.ngShopMemo || null,
          favoriteShopMemo: form.favoriteShopMemo || updatedAny.background?.favoriteShopMemo || null,
          exclusiveShopMemo:
            form.exclusiveShopMemo || updatedAny.background?.exclusiveShopMemo || null,
          nominatedShopMemo:
            form.favoriteShopMemo || updatedAny.background?.nominatedShopMemo || null,
          salaryNote: form.salaryNote || updatedAny.background?.salaryNote || null,
          genres: form.genres?.length ? form.genres : updatedAny.background?.genres ?? null,
          rank: form.rank || updatedAny.background?.rank || null,
          ownerStaffName: form.ownerStaffName || updatedAny.background?.ownerStaffName || null,
          atmosphere:
            typeof form.atmosphere === "number"
              ? form.atmosphere
              : updatedAny.background?.atmosphere ?? null,
        },
        ngShops:
          form.ngShopIds.length > 0
            ? form.ngShopIds.map((id, idx) => ({
                id,
                name: form.ngShopNames[idx] ?? "",
              }))
            : (updatedAny.ngShops ?? []),
        exclusiveShopId: form.exclusiveShopId ?? updatedAny.exclusiveShopId ?? null,
        exclusiveShop: form.exclusiveShopId
          ? {
              id: form.exclusiveShopId,
              name: form.exclusiveShopName ?? "",
            }
          : updatedAny.exclusiveShop ?? null,
        nominatedShops:
          form.favoriteShopIds.length > 0
            ? form.favoriteShopIds.map((id, idx) => ({
                id,
                name: form.favoriteShopNames[idx] ?? "",
              }))
            : (updatedAny.nominatedShops ?? updatedAny.favoriteShops ?? []),
        favoriteShops:
          form.favoriteShopIds.length > 0
            ? form.favoriteShopIds.map((id, idx) => ({
                id,
                name: form.favoriteShopNames[idx] ?? "",
              }))
            : (updatedAny.favoriteShops ?? []),
      };

      onUpdated(patchedUpdated);
      setSaveDone(true);
    } catch (e: any) {
      console.error(e);
      setSaveError(e?.message ?? "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {/* viewport 基準で中央固定（スクショ版） */}
      <div className="fixed inset-0 z-50 flex items-center justify-center px-3 py-6">
        {/* オーバーレイ */}
        <div className="absolute inset-0 bg-black/60" onClick={onClose} />

        {/* 本体 */}
        <div className="relative z-10 w-full max-w-7xl max-h-[92vh] bg-white rounded-2xl shadow-2xl border border-gray-300 overflow-hidden flex flex-col">
          {/* ヘッダー（現行のまま） */}
          <div className="flex items-center justify-between px-5 py-1.5 border-b border-gray-200 bg-gray-50">
            <div className="flex items-center gap-3">
              <h3 className="text-sm font-semibold">キャスト詳細（{displayName}）</h3>
              <span className="text-[10px] text-muted">
                管理番号: {managementNumber} / 旧スタッフID: {legacyStaffId ?? "-"} / キャストID:{" "}
                {cast.castCode}
              </span>
              {detailLoading && (
                <span className="text-[10px] text-emerald-600">詳細読み込み中…</span>
              )}
              {!detailLoading && detailError && (
                <span className="text-[10px] text-red-500">{detailError}</span>
              )}
              {!detailLoading && saveDone && !saveError && (
                <span className="text-[10px] text-emerald-600">保存しました</span>
              )}
              {saveError && (
                <span className="text-[10px] text-red-500">保存エラー: {saveError}</span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button className="px-3 py-1 rounded-xl text-[11px] border border-gray-300 bg-gray-50">
                チャットで連絡
              </button>
              <button
                className="px-3 py-1 rounded-xl text-[11px] border border-emerald-400/60 bg-emerald-500/80 text-white disabled:opacity-60 disabled:cursor-not-allowed"
                onClick={handleSave}
                disabled={!detail || !form || saving}
              >
                {saving ? "保存中…" : "登録"}
              </button>
              <button
                className="px-3 py-1 rounded-xl text-[11px] border border-red-400/80 bg-red-500/80 text-white"
                onClick={onClose}
              >
                終了
              </button>
            </div>
          </div>

          {/* 本文（スクショの緑＋オレンジ） */}
          <div className="flex-1 overflow-auto">
            {/* 上段：登録情報①/②（グリーン） */}
            <div className="border-b border-black/30">
              <div className="grid grid-cols-1 xl:grid-cols-2">
                {/* 左：登録情報① */}
                <div className="bg-[#6aa84f] p-4 border-r border-black/40">
                  <div className="inline-flex items-center px-3 py-1 text-xs font-semibold bg-white/90 border border-black/40 rounded">
                    登録情報①
                  </div>

                  <div className="mt-4 grid grid-cols-[170px_minmax(0,1fr)] gap-4">
                    {/* 写真枠 */}
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-full aspect-[3/4] bg-[#3d6ab3] border border-black/40 flex items-center justify-center text-white text-sm">
                        写真
                      </div>
                    </div>

                    {/* フォーム */}
                    <div className="space-y-2">
                      {/* ふりがな */}
                      <div className="grid grid-cols-[110px_minmax(0,1fr)] items-center gap-2">
                        <div className="text-xs text-white font-semibold">ふりがな</div>
                        <input
                          className="w-full h-8 bg-white border border-black/40 px-2 text-sm"
                          value={form?.furigana ?? ""}
                          onChange={(e) =>
                            setForm((p) => (p ? { ...p, furigana: e.target.value } : p))
                          }
                        />
                      </div>

                      {/* 氏名 */}
                      <div className="grid grid-cols-[110px_minmax(0,1fr)] items-center gap-2">
                        <div className="text-xs text-white font-semibold">氏名</div>
                        <input
                          className="w-full h-8 bg-white border border-black/40 px-2 text-sm"
                          value={form?.displayName ?? ""}
                          onChange={(e) =>
                            setForm((p) => (p ? { ...p, displayName: e.target.value } : p))
                          }
                        />
                      </div>

                      {/* 生年月日 */}
                      <div className="grid grid-cols-[110px_minmax(0,1fr)] items-center gap-2">
                        <div className="text-xs text-white font-semibold">生年月日</div>
                        <div className="flex items-center gap-2">
                          <input
                            className="w-full h-8 bg-white border border-black/40 px-2 text-sm"
                            value={form?.birthdate ?? ""}
                            onChange={(e) =>
                              setForm((p) => (p ? { ...p, birthdate: e.target.value } : p))
                            }
                            placeholder={birth === "—" ? "" : birth}
                          />
                          <button
                            type="button"
                            className="h-8 px-2 text-xs bg-white border border-black/40"
                            onClick={() => {
                              // ここは既存の「自動計算」要件があれば後で実装（現状はUIのみ）
                            }}
                          >
                            自動計算
                          </button>
                          <div className="text-xs text-white font-semibold">歳</div>
                        </div>
                      </div>

                      {/* 現住所 */}
                      <div className="grid grid-cols-[110px_minmax(0,1fr)] items-center gap-2">
                        <div className="text-xs text-white font-semibold">現住所</div>
                        <input
                          className="w-full h-8 bg-white border border-black/40 px-2 text-sm"
                          value={form?.address ?? ""}
                          onChange={(e) =>
                            setForm((p) => (p ? { ...p, address: e.target.value } : p))
                          }
                        />
                      </div>

                      {/* TEL */}
                      <div className="grid grid-cols-[110px_minmax(0,1fr)] items-center gap-2">
                        <div className="text-xs text-white font-semibold">TEL</div>
                        <input
                          className="w-full h-8 bg-white border border-black/40 px-2 text-sm"
                          value={form?.phone ?? ""}
                          onChange={(e) =>
                            setForm((p) => (p ? { ...p, phone: e.target.value } : p))
                          }
                        />
                      </div>

                      {/* アドレス */}
                      <div className="grid grid-cols-[110px_minmax(0,1fr)] items-center gap-2">
                        <div className="text-xs text-white font-semibold">アドレス</div>
                        <input
                          className="w-full h-8 bg-white border border-black/40 px-2 text-sm"
                          value={form?.email ?? ""}
                          onChange={(e) =>
                            setForm((p) => (p ? { ...p, email: e.target.value } : p))
                          }
                        />
                      </div>

                      {/* ジャンル */}
                      <div className="grid grid-cols-[110px_minmax(0,1fr)] items-start gap-2">
                        <div className="text-xs text-white font-semibold pt-1">ジャンル</div>
                        <div className="flex flex-wrap gap-2">
                          {CAST_GENRE_OPTIONS.map((g) => {
                            const active = form?.genres?.includes(g) ?? false;
                            return (
                              <button
                                key={g}
                                type="button"
                                onClick={() =>
                                  setForm((prev) =>
                                    prev
                                      ? {
                                          ...prev,
                                          genres: prev.genres.includes(g)
                                            ? prev.genres.filter((x) => x !== g)
                                            : [...prev.genres, g],
                                        }
                                      : prev,
                                  )
                                }
                                className={`h-8 px-3 text-xs border border-black/40 ${
                                  active ? "bg-[#2b78e4] text-white" : "bg-white text-black"
                                }`}
                              >
                                {g}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* 希望時給（スクショ位置に合わせる：既存は salaryNote / tiaraHourly があるのでメモ入力に寄せる） */}
                      <div className="grid grid-cols-[110px_minmax(0,1fr)] items-center gap-2">
                        <div className="text-xs text-white font-semibold">希望時給</div>
                        <input
                          className="w-full h-8 bg-white border border-black/40 px-2 text-sm"
                          value={form?.salaryNote ?? ""}
                          onChange={(e) =>
                            setForm((p) => (p ? { ...p, salaryNote: e.target.value } : p))
                          }
                          placeholder="フォームで自由入力を反映"
                        />
                      </div>

                      {/* キャストからの店舗NG */}
                      <div className="grid grid-cols-[110px_minmax(0,1fr)] items-center gap-2">
                        <div className="text-xs text-white font-semibold">
                          キャストからの店舗NG
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            className="w-full h-8 bg-white border border-black/40 px-2 text-sm"
                            value={form?.ngShopMemo ?? ""}
                            onChange={(e) =>
                              setForm((p) => (p ? { ...p, ngShopMemo: e.target.value } : p))
                            }
                          />
                          <button
                            type="button"
                            className="h-8 w-10 bg-[#2b78e4] text-white border border-black/40"
                            onClick={() => setNgModalOpen(true)}
                          >
                            +
                          </button>
                        </div>
                      </div>

                      {/* シフト情報（既存のまま中身を利用） */}
                      <div className="grid grid-cols-[110px_minmax(0,1fr)] items-center gap-2">
                        <div className="text-xs text-white font-semibold">シフト情報</div>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-8 bg-white border border-black/40 px-2 text-xs flex items-center">
                            本日 {todayLabel}: {formatSlot(todaySlot)} / 翌日 {tomorrowLabel}:{" "}
                            {formatSlot(tomorrowSlot)}
                          </div>
                          <button
                            type="button"
                            className="h-8 px-3 text-xs bg-white border border-black/40"
                            onClick={() => setShiftModalOpen(true)}
                          >
                            編集
                          </button>
                        </div>
                      </div>

                      {/* 身長 */}
                      <div className="grid grid-cols-[110px_minmax(0,1fr)] items-center gap-2">
                        <div className="text-xs text-white font-semibold">身長</div>
                        <input
                          className="w-full h-8 bg-white border border-black/40 px-2 text-sm"
                          value={form?.heightCm ?? ""}
                          onChange={(e) =>
                            setForm((p) => (p ? { ...p, heightCm: e.target.value } : p))
                          }
                        />
                      </div>

                      {/* 服のサイズ */}
                      <div className="grid grid-cols-[110px_minmax(0,1fr)] items-center gap-2">
                        <div className="text-xs text-white font-semibold">服のサイズ</div>
                        <input
                          className="w-full h-8 bg-white border border-black/40 px-2 text-sm"
                          value={form?.clothingSize ?? ""}
                          onChange={(e) =>
                            setForm((p) => (p ? { ...p, clothingSize: e.target.value } : p))
                          }
                        />
                      </div>

                      {/* 靴のサイズ */}
                      <div className="grid grid-cols-[110px_minmax(0,1fr)] items-center gap-2">
                        <div className="text-xs text-white font-semibold">靴のサイズ</div>
                        <input
                          className="w-full h-8 bg-white border border-black/40 px-2 text-sm"
                          value={form?.shoeSizeCm ?? ""}
                          onChange={(e) =>
                            setForm((p) => (p ? { ...p, shoeSizeCm: e.target.value } : p))
                          }
                        />
                      </div>

                      {/* タトゥー */}
                      <div className="grid grid-cols-[110px_minmax(0,1fr)] items-center gap-2">
                        <div className="text-xs text-white font-semibold">タトゥー</div>
                        <select
                          className="w-full h-8 bg-white border border-black/40 px-2 text-sm"
                          value={form?.tattoo ?? ""}
                          onChange={(e) =>
                            setForm((p) => (p ? { ...p, tattoo: e.target.value as any } : p))
                          }
                        >
                          <option value=""></option>
                          <option value="有">有</option>
                          <option value="無">無</option>
                        </select>
                      </div>

                      {/* 飲酒 */}
                      <div className="grid grid-cols-[110px_minmax(0,1fr)] items-center gap-2">
                        <div className="text-xs text-white font-semibold">飲酒</div>
                        <select
                          className="w-full h-8 bg-white border border-black/40 px-2 text-sm"
                          value={form?.drinkLevel ?? ""}
                          onChange={(e) =>
                            setForm((p) => (p ? { ...p, drinkLevel: e.target.value as any } : p))
                          }
                        >
                          <option value=""></option>
                          <option value="NG">NG</option>
                          <option value="弱い">弱い</option>
                          <option value="普通">普通</option>
                          <option value="強い">強い</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 右：登録情報② */}
                <div className="bg-[#6aa84f] p-4">
                  <RegisterInfo2 form={form} setForm={setForm} />
                </div>
              </div>
            </div>

            {/* 下段：スタッフ入力項目（オレンジ） */}
            <div className="bg-[#f1b500] p-4">
              <div className="inline-flex items-center px-3 py-1 text-xs font-semibold bg-white/90 border border-black/40 rounded">
                スタッフ入力項目
              </div>

              <div className="mt-4 grid grid-cols-1 xl:grid-cols-2 gap-6">
                {/* 左列（スクショ：ティアラ査定給 / 送迎先 / 送迎先追加 / 担当 / 体型 / 身長 ＋ 添付ボタン） */}
                <div className="space-y-3">
                  {/* ティアラ査定給 */}
                  <div className="grid grid-cols-[140px_minmax(0,1fr)] items-center gap-2">
                    <div className="text-xs font-semibold text-ink">ティアラ査定給</div>
                    <select
                      className="w-full h-8 bg-white border border-black/40 px-2 text-sm"
                      value={form?.tiaraHourly ?? ""}
                      onChange={(e) =>
                        setForm((p) => (p ? { ...p, tiaraHourly: e.target.value } : p))
                      }
                    >
                      <option value=""></option>
                      {TIARA_HOURLY_OPTIONS.map((n) => (
                        <option key={n} value={String(n)}>
                          ¥{n.toLocaleString()}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* 送迎先（スクショ：自動入力） */}
                  <div className="grid grid-cols-[140px_minmax(0,1fr)] items-center gap-2">
                    <div className="text-xs font-semibold text-ink">送迎先</div>
                    <input
                      className="w-full h-8 bg-white border border-black/40 px-2 text-sm"
                      value={form?.pickupDestination ?? ""}
                      onChange={(e) =>
                        setForm((p) => (p ? { ...p, pickupDestination: e.target.value } : p))
                      }
                      placeholder="自動入力"
                    />
                  </div>

                  {/* 送迎先追加（スクショ：アプリから反映） */}
                  <div className="grid grid-cols-[140px_minmax(0,1fr)] items-center gap-2">
                    <div className="text-xs font-semibold text-ink">送迎先追加</div>
                    <input
                      className="w-full h-8 bg-white border border-black/40 px-2 text-sm"
                      value={form?.pickupDestinationExtra ?? ""}
                      onChange={(e) =>
                        setForm((p) =>
                          p ? { ...p, pickupDestinationExtra: e.target.value } : p,
                        )
                      }
                      placeholder="アプリから反映"
                    />
                  </div>

                  {/* 担当 */}
                  <div className="grid grid-cols-[140px_minmax(0,1fr)] items-center gap-2">
                    <div className="text-xs font-semibold text-ink">担当</div>
                    <select
                      className="w-full h-8 bg-white border border-black/40 px-2 text-sm"
                      value={form?.ownerStaffName ?? ""}
                      onChange={(e) =>
                        setForm((p) => (p ? { ...p, ownerStaffName: e.target.value } : p))
                      }
                    >
                      <option value=""></option>
                      {staffOptions.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* 体型（スクショ：体系） */}
                  <div className="grid grid-cols-[140px_minmax(0,1fr)] items-center gap-2">
                    <div className="text-xs font-semibold text-ink">体型</div>
                    <select
                      className="w-full h-8 bg-white border border-black/40 px-2 text-sm"
                      value={form?.bodyType ?? ""}
                      onChange={(e) =>
                        setForm((p) => (p ? { ...p, bodyType: e.target.value as any } : p))
                      }
                    >
                      <option value=""></option>
                      {BODY_TYPE_OPTIONS.map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* 身長（スクショ：自動反映） */}
                  <div className="grid grid-cols-[140px_minmax(0,1fr)] items-center gap-2">
                    <div className="text-xs font-semibold text-ink">身長</div>
                    <input
                      className="w-full h-8 bg-white border border-black/40 px-2 text-sm"
                      value={form?.heightCm ?? ""}
                      onChange={(e) =>
                        setForm((p) => (p ? { ...p, heightCm: e.target.value } : p))
                      }
                      placeholder="自動反映"
                    />
                  </div>

                  {/* 添付系ボタン（スクショ：顔写真＋ / 本籍地記載書類） */}
                  <div className="flex items-center gap-3 pt-1">
                    <button
                      type="button"
                      className="px-4 h-9 rounded-md bg-[#2b78e4] text-white border border-black/40 text-xs"
                      onClick={() => {
                        // 保存先・アップロード仕様が確定したら実装
                        alert("顔写真アップロード（未実装）");
                      }}
                    >
                      顔写真＋
                    </button>
                    <button
                      type="button"
                      className="px-4 h-9 rounded-md bg-[#2b78e4] text-white border border-black/40 text-xs"
                      onClick={() => {
                        // 保存先・アップロード仕様が確定したら実装
                        alert("本籍地記載書類アップロード（未実装）");
                      }}
                    >
                      本籍地記載書類
                    </button>
                  </div>
                </div>

                {/* 右列（スクショ：ランク / 店舗からNG / 専属指名 / タトゥー / 雰囲気スライダー ＋ 既存の指名(複数)は残す） */}
                <div className="space-y-3">
                  {/* ランク（スクショ） */}
                  <div className="grid grid-cols-[140px_minmax(0,1fr)] items-center gap-2">
                    <div className="text-xs font-semibold text-ink">ランク</div>
                    <select
                      className="w-full h-8 bg-white border border-black/40 px-2 text-sm"
                      value={form?.rank ?? ""}
                      onChange={(e) =>
                        setForm((p) => (p ? { ...p, rank: e.target.value as any } : p))
                      }
                    >
                      <option value=""></option>
                      {CAST_RANK_OPTIONS.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* 店舗からのNG（スクショ：＋追加） */}
                  <div className="grid grid-cols-[140px_minmax(0,1fr)] items-center gap-2">
                    <div className="text-xs font-semibold text-ink">店舗からのNG</div>
                    <div className="flex items-center gap-2">
                      <input
                        className="w-full h-8 bg-white border border-black/40 px-2 text-sm"
                        value={form?.ngShopMemo ?? ""}
                        onChange={(e) =>
                          setForm((p) => (p ? { ...p, ngShopMemo: e.target.value } : p))
                        }
                        placeholder="店舗検索入力"
                      />
                      <button
                        type="button"
                        className="h-8 w-14 bg-[#2b78e4] text-white border border-black/40 text-xs"
                        onClick={() => setNgModalOpen(true)}
                      >
                        +追加
                      </button>
                    </div>
                  </div>

                  {/* 専属指名 */}
                  <div className="grid grid-cols-[140px_minmax(0,1fr)] items-center gap-2">
                    <div className="text-xs font-semibold text-ink">専属指名</div>
                    <div className="flex items-center gap-2">
                      <input
                        className="w-full h-8 bg-white border border-black/40 px-2 text-sm"
                        value={form?.exclusiveShopMemo ?? ""}
                        onChange={(e) =>
                          setForm((p) => (p ? { ...p, exclusiveShopMemo: e.target.value } : p))
                        }
                        placeholder="店舗検索入力"
                      />
                      <button
                        type="button"
                        className="h-8 w-10 bg-[#2b78e4] text-white border border-black/40"
                        onClick={() => setExclusiveModalOpen(true)}
                      >
                        +
                      </button>
                    </div>
                  </div>

                  {/* タトゥー（スクショ：自動反映） */}
                  <div className="grid grid-cols-[140px_minmax(0,1fr)] items-center gap-2">
                    <div className="text-xs font-semibold text-ink">タトゥー</div>
                    <div className="h-8 bg-white border border-black/40 px-2 flex items-center text-sm">
                      {form?.tattoo ? form.tattoo : "自動反映"}
                    </div>
                  </div>

                  {/* 雰囲気（スクショ：スライダー） */}
                  <div className="grid grid-cols-[140px_minmax(0,1fr)] items-center gap-2">
                    <div className="text-xs font-semibold text-ink">雰囲気</div>
                    <div className="h-8 bg-white border border-black/40 px-2 flex items-center">
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={1}
                        className="w-full"
                        value={form?.atmosphere ?? 50}
                        onChange={(e) =>
                          setForm((p) =>
                            p ? { ...p, atmosphere: Number(e.target.value) || 0 } : p,
                          )
                        }
                      />
                    </div>
                  </div>

                  {/* 既存：指名（複数） ※スクショ外でも要件として残しているため削除しない */}
                  <div className="grid grid-cols-[140px_minmax(0,1fr)] items-center gap-2">
                    <div className="text-xs font-semibold text-ink">指名（複数）</div>
                    <div className="flex items-center gap-2">
                      <input
                        className="w-full h-8 bg-white border border-black/40 px-2 text-sm"
                        value={form?.favoriteShopMemo ?? ""}
                        onChange={(e) =>
                          setForm((p) => (p ? { ...p, favoriteShopMemo: e.target.value } : p))
                        }
                        placeholder="店舗検索入力"
                      />
                      <button
                        type="button"
                        className="h-8 w-10 bg-[#2b78e4] text-white border border-black/40"
                        onClick={() => setFavoriteModalOpen(true)}
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* 下端ボタン列（スクショ） */}
              <div className="mt-6 flex items-center justify-center gap-6">
                <button
                  type="button"
                  className="px-8 h-9 bg-[#6aa84f] text-white border border-black/40"
                >
                  チャット連絡
                </button>
                <button
                  type="button"
                  className="px-10 h-9 bg-[#6aa84f] text-white border border-black/40"
                  onClick={handleSave}
                  disabled={!detail || !form || saving}
                >
                  {saving ? "登録中…" : "登録"}
                </button>
                <button
                  type="button"
                  className="px-8 h-9 bg-[#6aa84f] text-white border border-black/40"
                  onClick={onClose}
                >
                  終了
                </button>
                <button
                  type="button"
                  className="px-10 h-9 bg-[#6aa84f] text-white border border-black/40"
                >
                  一時保存
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* シフト編集モーダル */}
      {shiftModalOpen && (
        <ShiftEditModal onClose={() => setShiftModalOpen(false)} castName={displayName} />
      )}

      {/* NG店舗選択モーダル */}
      {ngModalOpen && form && (
        <NgShopSelectModal
          shops={shopsMaster}
          onClose={() => setNgModalOpen(false)}
          initialSelectedIds={form.ngShopIds}
          onSubmit={(selectedIds) => {
            const names = selectedIds.map(
              (id) => shopsMaster.find((x) => x.id === id)?.name ?? "",
            );
            setForm((prev) =>
              prev ? { ...prev, ngShopIds: selectedIds, ngShopNames: names } : prev,
            );
          }}
        />
      )}

      {/* 専属指名店舗選択モーダル */}
      {exclusiveModalOpen && form && (
        <ExclusiveShopSelectModal
          shops={shopsMaster}
          onClose={() => setExclusiveModalOpen(false)}
          initialSelectedId={form.exclusiveShopId ?? null}
          onSubmit={(selectedId) => {
            const name = selectedId
              ? shopsMaster.find((x) => x.id === selectedId)?.name ?? ""
              : "";
            setForm((prev) =>
              prev ? { ...prev, exclusiveShopId: selectedId, exclusiveShopName: name } : prev,
            );
          }}
        />
      )}

      {/* 指名店舗（旧お気に入り）選択モーダル */}
      {favoriteModalOpen && form && (
        <FavoriteShopSelectModal
          shops={shopsMaster}
          onClose={() => setFavoriteModalOpen(false)}
          initialSelectedIds={form.favoriteShopIds}
          onSubmit={(selectedIds) => {
            const names = selectedIds.map(
              (id) => shopsMaster.find((x) => x.id === id)?.name ?? "",
            );
            setForm((prev) =>
              prev ? { ...prev, favoriteShopIds: selectedIds, favoriteShopNames: names } : prev,
            );
          }}
        />
      )}
    </>
  );
}

function RegisterInfo2({
  form,
  setForm,
}: {
  form: any;
  setForm: Dispatch<SetStateAction<any>>;
}) {
  // スクショ項目のうち、保存先（既存フォームキー）が未定なものはローカル保持（UI完全再現を優先）
  const [otherAgency, setOtherAgency] = useState<string>("");
  const [dissatisfied, setDissatisfied] = useState<string>("");
  const [serviceExp, setServiceExp] = useState<string>("");
  const [tbManner, setTbManner] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [preferredWorkplace, setPreferredWorkplace] = useState<string>("");
  const [preferredTime, setPreferredTime] = useState<string>("");

  const HOW_FOUND_OPTIONS = [
    "Google検索",
    "Yahoo検索",
    "SNS",
    "Instagram",
    "TikTok",
    "紹介",
    "口コミ",
  ] as const;

  const currentHowFound: string[] = (form?.howFound ?? "")
    .split("/")
    .map((s: string) => s.trim())
    .filter(Boolean);

  const toggleHowFound = (label: string) => {
    const checked = currentHowFound.includes(label);
    const next = checked ? currentHowFound.filter((x) => x !== label) : [...currentHowFound, label];

    setForm((p: any) => (p ? { ...p, howFound: next.join(" / ") } : p));
  };

  return (
    <div>
      {/* header（スクショ：左に質問＋登録情報②、右にチェック群） */}
      <div className="grid grid-cols-[190px_minmax(0,1fr)] gap-3 items-start">
        <div className="space-y-2">
          <div className="bg-[#2b78e4] text-white text-xs font-semibold px-3 py-1.5 border border-black/60 inline-block">
            登録情報②
          </div>
          <div className="text-xs text-white font-semibold">どのように応募しましたか？</div>
        </div>

        <div className="grid grid-cols-4 gap-x-6 gap-y-2 pt-1 text-xs text-white">
          {HOW_FOUND_OPTIONS.map((label) => {
            const checked = currentHowFound.includes(label);
            return (
              <label key={label} className="flex items-center gap-2 select-none">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={checked}
                  onChange={() => toggleHowFound(label)}
                />
                <span>{label}</span>
              </label>
            );
          })}
        </div>
      </div>

      {/* fields（スクショの並び順・種別を再現） */}
      <div className="mt-4 space-y-2">
        {/* 検索したワード（自由入力） */}
        <div className="grid grid-cols-[190px_minmax(0,1fr)] items-center gap-3">
          <div className="text-xs text-white font-semibold">検索したワードを教えてください</div>
          <input
            className="w-full h-8 bg-white border border-black/40 px-2 text-sm"
            value={form?.referrerName ?? ""}
            onChange={(e) =>
              setForm((p: any) => (p ? { ...p, referrerName: e.target.value } : p))
            }
            placeholder="自由入力（キーワードとキーワードの間は,で区切る）"
          />
        </div>

        {/* 他派遣会社への登録（プルダウン） */}
        <div className="grid grid-cols-[190px_minmax(0,1fr)] items-center gap-3">
          <div className="text-xs text-white font-semibold">他派遣会社への登録</div>
          <select
            className="w-full h-8 bg-white border border-black/40 px-2 text-sm"
            value={otherAgency}
            onChange={(e) => setOtherAgency(e.target.value)}
          >
            <option value=""></option>
            <option value="あり">あり</option>
            <option value="なし">なし</option>
            <option value="不明">不明</option>
          </select>
        </div>

        {/* 不満だった点（自由入力） */}
        <div className="grid grid-cols-[190px_minmax(0,1fr)] items-center gap-3">
          <div className="text-xs text-white font-semibold">不満だった点を教えてください</div>
          <input
            className="w-full h-8 bg-white border border-black/40 px-2 text-sm"
            value={dissatisfied}
            onChange={(e) => setDissatisfied(e.target.value)}
          />
        </div>

        {/* 求める接客経験（プルダウン） */}
        <div className="grid grid-cols-[190px_minmax(0,1fr)] items-center gap-3">
          <div className="text-xs text-white font-semibold">求める接客の経験を教えてください</div>
          <select
            className="w-full h-8 bg-white border border-black/40 px-2 text-sm"
            value={serviceExp}
            onChange={(e) => setServiceExp(e.target.value)}
          >
            <option value=""></option>
            <option value="ある">ある</option>
            <option value="少しある">少しある</option>
            <option value="なし">なし</option>
          </select>
        </div>

        {/* TBマナー講習（プルダウン） */}
        <div className="grid grid-cols-[190px_minmax(0,1fr)] items-center gap-3">
          <div className="text-xs text-white font-semibold">TBマナーの講習が必要ですか？</div>
          <select
            className="w-full h-8 bg-white border border-black/40 px-2 text-sm"
            value={tbManner}
            onChange={(e) => setTbManner(e.target.value)}
          >
            <option value=""></option>
            <option value="必要">必要</option>
            <option value="不要">不要</option>
          </select>
        </div>

        {/* その他（備考）テキストエリア */}
        <div className="grid grid-cols-[190px_minmax(0,1fr)] gap-3 items-start pt-1">
          <div className="text-xs text-white font-semibold pt-2">その他（備考）</div>
          <textarea
            className="w-full h-40 bg-white border border-black/40 px-2 py-2 text-sm resize-none"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        {/* 下段4項目 */}
        <div className="mt-3 space-y-2">
          <div className="grid grid-cols-[190px_minmax(0,1fr)] items-center gap-3">
            <div className="text-xs text-white font-semibold">希望勤務地</div>
            <input
              className="w-full h-8 bg-white border border-black/40 px-2 text-sm"
              value={preferredWorkplace}
              onChange={(e) => setPreferredWorkplace(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-[190px_minmax(0,1fr)] items-center gap-3">
            <div className="text-xs text-white font-semibold">希望時間帯</div>
            <input
              className="w-full h-8 bg-white border border-black/40 px-2 text-sm"
              value={preferredTime}
              onChange={(e) => setPreferredTime(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-[190px_minmax(0,1fr)] items-center gap-3">
            <div className="text-xs text-white font-semibold">希望エリア</div>
            <input
              className="w-full h-8 bg-white border border-black/40 px-2 text-sm"
              value={form?.preferredArea ?? ""}
              onChange={(e) =>
                setForm((p: any) => (p ? { ...p, preferredArea: e.target.value } : p))
              }
            />
          </div>

          <div className="grid grid-cols-[190px_minmax(0,1fr)] items-center gap-3">
            <div className="text-xs text-white font-semibold">希望出勤日数</div>
            <input
              className="w-full h-8 bg-white border border-black/40 px-2 text-sm"
              value={form?.preferredDays ?? ""}
              onChange={(e) =>
                setForm((p: any) => (p ? { ...p, preferredDays: e.target.value } : p))
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/** 削除確認モーダル */
function DeleteCastModal({
  target,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  target: CastRow;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-3">
      <div className="absolute inset-0 bg-black/60" onClick={onCancel} />
      <div className="relative z-10 w-full max-w-md bg-white rounded-2xl border border-gray-300 shadow-2xl p-4">
        <h4 className="text-sm font-semibold text-ink mb-2">キャスト削除の確認</h4>
        <p className="text-xs text-red-500 mb-2">
          このキャストを削除すると、元に戻せません。
        </p>
        <p className="text-xs text-ink/90 mb-3">
          管理番号: <span className="font-mono">{target.managementNumber}</span>
          <br />
          名前: <span className="font-semibold">{target.name}</span>
          {target.legacyStaffId != null && (
            <>
              <br />
              旧スタッフID: <span className="font-mono">{target.legacyStaffId}</span>
            </>
          )}
        </p>
        {error && <p className="text-xs text-red-500 mb-2">削除エラー: {error}</p>}
        <div className="mt-3 flex items-center justify-end gap-2 text-xs">
          <button
            type="button"
            className="px-3 py-1.5 rounded-lg border border-gray-300 bg-gray-50 text-ink disabled:opacity-60"
            onClick={onCancel}
            disabled={busy}
          >
            キャンセル
          </button>
          <button
            type="button"
            className="px-3 py-1.5 rounded-lg border border-red-400/70 bg-red-500/90 text-white disabled:opacity-60 disabled:cursor-not-allowed"
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? "削除中…" : "削除する"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** シフト編集モーダル */
function ShiftEditModal({
  onClose,
  castName,
}: {
  onClose: () => void;
  castName: string;
}) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth()); // 0-origin

  const days = useMemo(() => buildMonthDays(year, month), [year, month]);

  const prevMonth = () => {
    setMonth((m) => {
      if (m === 0) {
        setYear((y) => y - 1);
        return 11;
      }
      return m - 1;
    });
  };

  const nextMonth = () => {
    setMonth((m) => {
      if (m === 11) {
        setYear((y) => y + 1);
        return 0;
      }
      return m + 1;
    });
  };

  const monthLabel = `${year}年 ${month + 1}月`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-3">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative z-10 w-[94vw] max-w-4xl max-h-[82vh] bg-white rounded-2xl border border-gray-300 shadow-2xl p-4 flex flex-col">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h4 className="text-sm font-semibold">シフト編集（{castName}）</h4>
            <p className="text-[11px] text-muted">
              キャストアプリから連携されたシフト情報を月ごとに確認・調整します。
            </p>
          </div>
          <button
            className="px-3 py-1 rounded-lg text-[11px] border border-red-400/80 bg-red-500/80 text-white"
            onClick={onClose}
          >
            閉じる
          </button>
        </div>

        {/* 月切り替え */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <button
              className="px-2 py-1 rounded-md border border-gray-300 text-[11px]"
              onClick={prevMonth}
            >
              ← 前月
            </button>
            <span className="text-[13px] font-semibold">{monthLabel}</span>
            <button
              className="px-2 py-1 rounded-md border border-gray-300 text-[11px]"
              onClick={nextMonth}
            >
              次月 →
            </button>
          </div>
          <div className="flex items-center gap-2 text-[10px] text-muted">
            <span>free = 出勤なし</span>
            <span>21:00 / 21:30 / 22:00 = 出勤予定</span>
          </div>
        </div>

        {/* カレンダー */}
        <div className="flex-1 overflow-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="bg-gray-50">
                {["日", "月", "火", "水", "木", "金", "土"].map((w) => (
                  <th key={w} className="py-1 border-b border-gray-200">
                    {w}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 6 }).map((_, rowIdx) => (
                <tr key={rowIdx} className="border-t border-gray-100">
                  {days.slice(rowIdx * 7, rowIdx * 7 + 7).map((d, i) => {
                    const dayNum = d.date.getDate();
                    const isToday = d.date.toDateString() === now.toDateString();
                    return (
                      <td
                        key={i}
                        className={`align-top h-20 px-1.5 py-1 border-l border-gray-100 ${
                          d.inCurrentMonth ? "" : "opacity-40"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span
                            className={`text-[10px] ${
                              isToday ? "text-emerald-600 font-semibold" : ""
                            }`}
                          >
                            {dayNum}
                          </span>
                          <span className="text-[9px] px-1 py-0.5 rounded bg-gray-100 border border-gray-300">
                            -
                          </span>
                        </div>
                        <div className="text-[10px] text-muted">シフト: 未設定</div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex items-center justify-end gap-2 text-[11px]">
          <button className="px-3 py-1 rounded-lg border border-gray-300 bg-gray-50">
            変更を破棄
          </button>
          <button className="px-3 py-1 rounded-lg border border-emerald-400/60 bg-emerald-500/80 text-white">
            保存して閉じる
          </button>
        </div>
      </div>
    </div>
  );
}

/** NG店舗選択モーダル */
/** 共通: 店舗マスタ（NG/専属/指名モーダルで共有） */
type ShopLite = { id: string; name: string; genre?: string | null };

/** NG店舗選択モーダル */
function NgShopSelectModal({
  onClose,
  initialSelectedIds,
  onSubmit,
  shops,
}: {
  onClose: () => void;
  initialSelectedIds: string[];
  onSubmit: (selectedIds: string[]) => void;
  shops: ShopLite[];
}) {
  const [selected, setSelected] = useState<string[]>(initialSelectedIds ?? []);

  useEffect(() => {
    setSelected(initialSelectedIds ?? []);
  }, [initialSelectedIds]);

  const toggle = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  return (
    <div className="tiara-modal-backdrop">
      <div className="tiara-modal">
        <div className="tiara-modal__head">
          <div>
            <h4 className="text-sm font-semibold">NG店舗の選択</h4>
            <p className="text-xs text-muted mt-1">NGにしたい店舗を複数選択してください。</p>
          </div>
          <button className="tiara-btn tiara-btn--ghost h-9" onClick={onClose}>
            閉じる
          </button>
        </div>

        <div className="tiara-table-wrap mt-3">
          <table className="tiara-table">
            <thead>
              <tr>
                <th className="w-10 px-2 py-2 text-left">NG</th>
                <th className="px-2 py-2 text-left">店舗名</th>
                <th className="w-28 px-2 py-2 text-left">ジャンル</th>
              </tr>
            </thead>
            <tbody>
              {shops.map((shop) => {
                const on = selected.includes(shop.id);
                return (
                  <tr key={shop.id} className="hover:bg-black/5">
                    <td className="px-2 py-2">
                      <input type="checkbox" checked={on} onChange={() => toggle(shop.id)} />
                    </td>
                    <td className="px-2 py-2">{shop.name}</td>
                    <td className="px-2 py-2 text-xs text-muted">{shop.genre ?? ""}</td>
                  </tr>
                );
              })}
              {shops.length === 0 && (
                <tr>
                  <td className="px-2 py-6 text-center text-sm text-muted" colSpan={3}>
                    店舗がありません
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between mt-4">
          <p className="text-xs text-muted">・上記一覧からNG店舗を選択して「登録」ボタンで保存します。</p>
          <div className="flex gap-2">
            <button className="tiara-btn tiara-btn--ghost h-10" onClick={onClose}>
              キャンセル
            </button>
            <button
              className="tiara-btn h-10"
              onClick={() => {
                onSubmit(selected);
                onClose();
              }}
            >
              登録
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** 専属指名店舗選択モーダル（単一選択） */
function ExclusiveShopSelectModal({
  onClose,
  initialSelectedId,
  onSubmit,
  shops,
}: {
  onClose: () => void;
  initialSelectedId: string | null;
  onSubmit: (selectedId: string | null) => void;
  shops: ShopLite[];
}) {
  const [selected, setSelected] = useState<string | null>(initialSelectedId ?? null);

  useEffect(() => {
    setSelected(initialSelectedId ?? null);
  }, [initialSelectedId]);

  return (
    <div className="tiara-modal-backdrop">
      <div className="tiara-modal">
        <div className="tiara-modal__head">
          <div>
            <h4 className="text-sm font-semibold">専属指名店舗の選択</h4>
            <p className="text-xs text-muted mt-1">専属で優先的に配属したい店舗を1件選択してください。</p>
          </div>
          <button className="tiara-btn tiara-btn--ghost h-9" onClick={onClose}>
            閉じる
          </button>
        </div>

        <div className="tiara-table-wrap mt-3">
          <table className="tiara-table">
            <thead>
              <tr>
                <th className="w-10 px-2 py-2 text-left">専属</th>
                <th className="px-2 py-2 text-left">店舗名</th>
                <th className="w-28 px-2 py-2 text-left">ジャンル</th>
              </tr>
            </thead>
            <tbody>
              {shops.map((shop) => {
                const on = selected === shop.id;
                return (
                  <tr key={shop.id} className="hover:bg-black/5">
                    <td className="px-2 py-2">
                      <input
                        type="radio"
                        name="exclusiveShop"
                        checked={on}
                        onChange={() => setSelected(shop.id)}
                      />
                    </td>
                    <td className="px-2 py-2">{shop.name}</td>
                    <td className="px-2 py-2 text-xs text-muted">{shop.genre ?? ""}</td>
                  </tr>
                );
              })}
              {shops.length === 0 && (
                <tr>
                  <td className="px-2 py-6 text-center text-sm text-muted" colSpan={3}>
                    店舗がありません
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between mt-4">
          <p className="text-xs text-muted">・選択なしで登録すると専属指名は解除されます。</p>
          <div className="flex gap-2">
            <button className="tiara-btn tiara-btn--ghost h-10" onClick={onClose}>
              キャンセル
            </button>
            <button
              className="tiara-btn h-10"
              onClick={() => {
                onSubmit(selected);
                onClose();
              }}
            >
              登録
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** 指名店舗（複数）選択モーダル（旧お気に入り） */
function FavoriteShopSelectModal({
  onClose,
  initialSelectedIds,
  onSubmit,
  shops,
}: {
  onClose: () => void;
  initialSelectedIds: string[];
  onSubmit: (selectedIds: string[]) => void;
  shops: ShopLite[];
}) {
  const [selected, setSelected] = useState<string[]>(initialSelectedIds ?? []);

  useEffect(() => {
    setSelected(initialSelectedIds ?? []);
  }, [initialSelectedIds]);

  const toggle = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  return (
    <div className="tiara-modal-backdrop">
      <div className="tiara-modal">
        <div className="tiara-modal__head">
          <div>
            <h4 className="text-sm font-semibold">指名店舗の選択</h4>
            <p className="text-xs text-muted mt-1">
              指名（複数店舗可）。優先的に入りたい店舗を複数選択してください。
            </p>
          </div>
          <button className="tiara-btn tiara-btn--ghost h-9" onClick={onClose}>
            閉じる
          </button>
        </div>

        <div className="tiara-table-wrap mt-3">
          <table className="tiara-table">
            <thead>
              <tr>
                <th className="w-10 px-2 py-2 text-left">指名</th>
                <th className="px-2 py-2 text-left">店舗名</th>
                <th className="w-28 px-2 py-2 text-left">ジャンル</th>
              </tr>
            </thead>
            <tbody>
              {shops.map((shop) => {
                const on = selected.includes(shop.id);
                return (
                  <tr key={shop.id} className="hover:bg-black/5">
                    <td className="px-2 py-2">
                      <input type="checkbox" checked={on} onChange={() => toggle(shop.id)} />
                    </td>
                    <td className="px-2 py-2">{shop.name}</td>
                    <td className="px-2 py-2 text-xs text-muted">{shop.genre ?? ""}</td>
                  </tr>
                );
              })}
              {shops.length === 0 && (
                <tr>
                  <td className="px-2 py-6 text-center text-sm text-muted" colSpan={3}>
                    店舗がありません
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between mt-4">
          <p className="text-xs text-muted">・上記一覧から指名店舗を選択して「登録」ボタンで保存します。</p>
          <div className="flex gap-2">
            <button className="tiara-btn tiara-btn--ghost h-10" onClick={onClose}>
              キャンセル
            </button>
            <button
              className="tiara-btn h-10"
              onClick={() => {
                onSubmit(selected);
                onClose();
              }}
            >
              登録
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MainInfoRow({
  label,
  value,
  onChange,
  readOnly,
  placeholder,
}: {
  label: string;
  value: string;
  onChange?: (v: string) => void;
  readOnly?: boolean;
  placeholder?: string;
}) {
  const effectiveReadOnly = readOnly || !onChange;
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:gap-3">
      <div className="sm:w-32 text-[12px] text-muted shrink-0">{label}</div>
      <div className="flex-1 min-w-0">
        <input
          type="text"
          value={value ?? ""}
          placeholder={placeholder}
          onChange={(e) => onChange?.(e.target.value)}
          readOnly={effectiveReadOnly}
          className={`w-full text-[13px] px-3 py-1.5 rounded-lg border text-ink/95 outline-none focus:border-accent focus:ring-1 focus:ring-accent/60 ${
            effectiveReadOnly
              ? "bg-gray-100 border-gray-200 text-muted cursor-default"
              : "bg-white border-gray-300"
          }`}
        />
      </div>
    </div>
  );
}

/** ラベル＋値（1行）の小さい行パーツ（サブ情報用・編集可） */
function InfoRow({
  label,
  value,
  onChange,
  readOnly,
  placeholder,
}: {
  label: string;
  value: string;
  onChange?: (v: string) => void;
  readOnly?: boolean;
  placeholder?: string;
}) {
  const effectiveReadOnly = readOnly || !onChange;
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:gap-2 mb-1">
      <div className="sm:w-32 text-[11px] text-muted shrink-0">{label}</div>
      <div className="flex-1 min-w-0">
        <input
          type="text"
          value={value ?? ""}
          placeholder={placeholder}
          onChange={(e) => onChange?.(e.target.value)}
          readOnly={effectiveReadOnly}
          className={`w-full text-[11px] px-2 py-1.5 rounded-lg border text-ink/90 outline-none focus:border-accent focus:ring-1 focus:ring-accent/60 ${
            effectiveReadOnly
              ? "bg-gray-100 border-gray-200 text-muted cursor-default"
              : "bg-white border-gray-300"
          }`}
        />
      </div>
    </div>
  );
}

/** セレクト専用の行パーツ（就業可否など） */
function SelectRow({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:gap-2 mb-1">
      <div className="sm:w-32 text-[11px] text-muted shrink-0">{label}</div>
      <div className="flex-1 min-w-0">
        <select
          className="w-full text-[11px] px-2 py-1.5 rounded-lg border text-ink/90 bg-white border-gray-300 outline-none focus:border-accent focus:ring-1 focus:ring-accent/60"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">（選択してください）</option>
          {options.map((opt) => (
            <option key={opt.value || opt.label} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
