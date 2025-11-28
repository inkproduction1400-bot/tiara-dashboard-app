// src/app/casts/page.tsx
"use client";

import {
  useMemo,
  useState,
  useEffect,
  type MouseEvent,
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
import {
  listShops,
  type ShopListItem,
} from "@/lib/api.shops";

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

// ★ 並び替えモード：50音順 or 旧スタッフID順
type SortMode = "kana" | "legacy";

/** ジャンル選択肢（複数選択） */
const CAST_GENRE_OPTIONS = ["クラブ", "キャバ", "スナック", "ガルバ"] as const;
type CastGenre = (typeof CAST_GENRE_OPTIONS)[number];

/** モーダルを document.body 直下に出すためのポータル */
function ModalPortal({ children }: { children: React.ReactNode }) {
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
            castCode: "-", // 仕様確定後に API フィールドと紐付け
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
      const hay = `${r.managementNumber} ${r.name} ${r.furigana} ${legacy}`;
      return hay.includes(query);
    });

    result = result.slice().sort((a, b) => {
      if (sortMode === "legacy") {
        // 旧スタッフID順（数値昇順, null は末尾）
        const aNull = a.legacyStaffId == null;
        const bNull = b.legacyStaffId == null;
        if (aNull && bNull) {
          // 両方 null → 管理番号 → ふりがな/名前
          const cmpMng = a.managementNumber.localeCompare(
            b.managementNumber,
            "ja",
          );
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

    const updatedAge =
      calcAgeFromBirthdate(updated.birthdate ?? null) ?? null;

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
            managementNumber:
              updated.managementNumber ?? prev.managementNumber,
            desiredHourly:
              updated.preferences?.desiredHourly ?? prev.desiredHourly,
            age: updatedAge ?? prev.age,
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
              desiredHourly:
                updated.preferences?.desiredHourly ?? r.desiredHourly,
              age:
                calcAgeFromBirthdate(updated.birthdate ?? null) ?? r.age,
            }
          : r,
      ),
    );
  };

  // 削除ボタン押下 → 確認モーダル表示
  const handleClickDelete = (
    e: MouseEvent<HTMLButtonElement>,
    row: CastRow,
  ) => {
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
              <td className="px-2 py-1 font-mono text-[11px]">
                {r.managementNumber}
              </td>
              <td className="px-2 py-1 truncate">{r.name}</td>
              <td className="px-2 py-1 text-center">
                {r.age != null ? r.age : "-"}
              </td>
              <td className="px-2 py-1">
                {r.desiredHourly
                  ? `¥${r.desiredHourly.toLocaleString()}`
                  : "-"}
              </td>
              <td className="px-2 py-1 font-mono text-[11px]">
                {r.legacyStaffId != null ? r.legacyStaffId : "-"}
              </td>
              <td className="px-2 py-1 truncate">
                {r.ownerStaffName || "-"}
              </td>
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
            {loadError && (
              <span className="ml-2 text-red-400">（{loadError}）</span>
            )}
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
            <div className="flex itemscenter gap-1">
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
                旧ID順
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
            <div className="mt-4 text-center text-xs text-muted">
              一覧を読み込み中…
            </div>
          )}

          {!loading && total === 0 && (
            <div className="mt-4 text-center text-sm text-muted">
              該当データがありません
            </div>
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
  // 希望時給（テキスト入力だが中身は数値を期待）
  tiaraHourly: string;
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
}: CastDetailModalProps) {
  const [shiftModalOpen, setShiftModalOpen] = useState(false);
  const [ngModalOpen, setNgModalOpen] = useState(false);
  const [exclusiveModalOpen, setExclusiveModalOpen] = useState(false);
  const [favoriteModalOpen, setFavoriteModalOpen] = useState(false);
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
      (rawExclusive
        ? String(rawExclusive.id ?? rawExclusive.shopId ?? "")
        : null);
    const exclusiveShopName: string | null =
      rawExclusive && (rawExclusive.name ?? rawExclusive.shopName)
        ? String(rawExclusive.name ?? rawExclusive.shopName)
        : null;

    // 指名（複数）: nominatedShops を優先し、なければ legacy favoriteShops
    const nominatedFromApi: any[] = Array.isArray(
      (detail as any).nominatedShops,
    )
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

    setForm({
      displayName: detail.displayName ?? cast.name,
      birthdate: detail.birthdate ?? "",
      address: detail.address ?? "",
      phone: detail.phone ?? "",
      email: detail.email ?? "",
      tiaraHourly:
        detail.preferences?.desiredHourly != null
          ? String(detail.preferences.desiredHourly)
          : "",
      salaryNote: (detail.background as any)?.salaryNote ?? "",
      preferredDays: detail.preferences?.preferredDays?.join(" / ") ?? "",
      preferredTimeFrom: detail.preferences?.preferredTimeFrom ?? "",
      preferredTimeTo: detail.preferences?.preferredTimeTo ?? "",
      preferredArea: detail.preferences?.preferredArea ?? "",
      heightCm:
        detail.attributes?.heightCm != null
          ? String(detail.attributes.heightCm)
          : "",
      clothingSize: detail.attributes?.clothingSize ?? "",
      shoeSizeCm:
        detail.attributes?.shoeSizeCm != null
          ? String(detail.attributes.shoeSizeCm)
          : "",
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
        detail.attributes?.tattoo == null
          ? ""
          : detail.attributes.tattoo
          ? "有"
          : "無",
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
      hasExperience:
        detail.hasExperience == null
          ? ""
          : detail.hasExperience
          ? "あり"
          : "なし",
      workHistory: detail.note ?? "",

      referrerName: (detail.background as any)?.referrerName ?? "",
      compareOtherAgencies:
        (detail.background as any)?.compareOtherAgencies ?? "",
      otherAgencyName: (detail.background as any)?.otherAgencyName ?? "",
      otherNotes: (detail.background as any)?.otherNotes ?? "",
      thirtyKComment: (detail.background as any)?.thirtyKComment ?? "",

      idDocType:
        ((detail.background as any)?.idDocType as CastDetailForm["idDocType"]) ??
        "",
      residencyProof:
        ((detail.background as any)?.residencyProof as
          CastDetailForm["residencyProof"]) ?? "",
      oathStatus:
        ((detail.background as any)?.oathStatus as CastDetailForm["oathStatus"]) ??
        "",
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
    });
    setSaveDone(false);
    setSaveError(null);
  }, [detail, cast.name]);

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
  const legacyStaffId =
    detail?.legacyStaffId ?? cast.legacyStaffId ?? null;

  const birthdateStr =
    form?.birthdate || detail?.birthdate || null;
  const computedAge = calcAgeFromBirthdate(birthdateStr);
  const birth =
    birthdateStr != null && birthdateStr !== ""
      ? computedAge != null
        ? `${birthdateStr}（${computedAge}歳）`
        : birthdateStr
      : "—";

  const address = form?.address || "—";
  const phone = form?.phone || "—";
  const email = form?.email || "—";
  const tiaraHourlyLabel =
    form?.tiaraHourly && form.tiaraHourly.trim()
      ? `¥${Number(
          form.tiaraHourly.replace(/[^\d]/g, "") || "0",
        ).toLocaleString()}`
      : "—";

  const handleSave = async () => {
    if (!detail || !form) return;
    setSaving(true);
    setSaveError(null);
    setSaveDone(false);
    try {
      // 数値系のパース
      const hourlyRaw = form.tiaraHourly.replace(/[^\d]/g, "");
      const desiredHourly =
        hourlyRaw.trim().length > 0 ? Number(hourlyRaw) || null : null;

      const heightRaw = form.heightCm.replace(/[^\d]/g, "");
      const heightCm =
        heightRaw.trim().length > 0 ? Number(heightRaw) || null : null;

      const shoeRaw = form.shoeSizeCm.replace(/[^\d]/g, "");
      const shoeSizeCm =
        shoeRaw.trim().length > 0 ? Number(shoeRaw) || null : null;

      // 出勤希望日を配列へ
      const preferredDays =
        form.preferredDays
          .split(/[\/、,\s]+/)
          .map((x) => x.trim())
          .filter(Boolean) || [];

      // 就業可否系
      const tattooFlag =
        form.tattoo === ""
          ? null
          : form.tattoo === "有"
          ? true
          : false;
      const needPickupFlag =
        form.needPickup === ""
          ? null
          : form.needPickup === "要"
          ? true
          : false;
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
        form.hasExperience === ""
          ? null
          : form.hasExperience === "あり"
          ? true
          : false;

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
        favoriteShopMemo: form.favoriteShopMemo || null, // 旧仕様との互換
        exclusiveShopMemo: form.exclusiveShopMemo || null,
        nominatedShopMemo: form.favoriteShopMemo || null,
      };

      const exclusiveShopIds =
        form.exclusiveShopId ? [form.exclusiveShopId] : [];
      const nominatedShopIds = form.favoriteShopIds ?? [];

      const payload = {
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
        },
        preferences: {
          desiredHourly,
          desiredMonthly: detail.preferences?.desiredMonthly ?? null,
          preferredDays,
          preferredTimeFrom: form.preferredTimeFrom || null,
          preferredTimeTo: form.preferredTimeTo || null,
          preferredArea: form.preferredArea || null,
          // NG メモ・備考欄は今のところ background 側で管理
          ngShopNotes: detail.preferences?.ngShopNotes ?? null,
          notes: detail.preferences?.notes ?? null,
        },
        background,
        hasExperience: hasExperienceFlag,
        // ★ NG店舗ID（モーダルで更新）
        ngShopIds: form.ngShopIds?.length ? form.ngShopIds : null,
        // ★ 専属指名・指名店舗
        exclusiveShopIds,
        nominatedShopIds,
      } as Parameters<typeof updateCast>[1];

      const updated = await updateCast(cast.id, payload);

      // ★ フロント側で NG店舗情報・専属指名・指名情報とメモをパッチしてから親に渡す
      const updatedAny = updated as any;
      const patchedUpdated: CastDetail = {
        ...(updatedAny as CastDetail),
        background: {
          ...(updatedAny.background ?? {}),
          // フォームで編集した値を優先
          ngShopMemo:
            form.ngShopMemo || updatedAny.background?.ngShopMemo || null,
          favoriteShopMemo:
            form.favoriteShopMemo ||
            updatedAny.background?.favoriteShopMemo ||
            null,
          exclusiveShopMemo:
            form.exclusiveShopMemo ||
            updatedAny.background?.exclusiveShopMemo ||
            null,
          nominatedShopMemo:
            form.favoriteShopMemo ||
            updatedAny.background?.nominatedShopMemo ||
            null,
          salaryNote:
            form.salaryNote || updatedAny.background?.salaryNote || null,
          genres: form.genres?.length
            ? form.genres
            : updatedAny.background?.genres ?? null,
        },
        ngShops:
          form.ngShopIds.length > 0
            ? form.ngShopIds.map((id, idx) => ({
                id,
                name: form.ngShopNames[idx] ?? "",
              }))
            : (updatedAny.ngShops ?? []),
        exclusiveShopId:
          form.exclusiveShopId ??
          updatedAny.exclusiveShopId ??
          null,
        exclusiveShop:
          form.exclusiveShopId
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
      {/* viewport 基準で中央固定 */}
      <div className="fixed inset-0 z-[100] flex items-center justify-center px-3 py-6">
        {/* オーバーレイ */}
        <div className="absolute inset-0 bg-black/60" onClick={onClose} />

        {/* 本体：横幅広め・高さは 90vh に収める（中身はスクロール） */}
        <div className="relative z-10 w-full max-w-7xl max-h-[90vh] min-h-[60vh] bg-white rounded-2xl shadow-2xl border border-gray-300 overflow-hidden flex flex-col">
          {/* ヘッダー */}
          <div className="flex items-center justify-between px-5 py-1.5 border-b border-gray-200 bg-gray-50">
            <div className="flex items-center gap-3">
              <h3 className="text-sm font-semibold">
                キャスト詳細（{displayName}）
              </h3>
              <span className="text-[10px] text-muted">
                管理番号: {managementNumber} / 旧スタッフID:{" "}
                {legacyStaffId ?? "-"} / キャストID: {cast.castCode}
              </span>
              {detailLoading && (
                <span className="text-[10px] text-emerald-600">
                  詳細読み込み中…
                </span>
              )}
              {!detailLoading && detailError && (
                <span className="text-[10px] text-red-500">{detailError}</span>
              )}
              {!detailLoading && saveDone && !saveError && (
                <span className="text-[10px] text-emerald-600">
                  保存しました
                </span>
              )}
              {saveError && (
                <span className="text-[10px] text-red-500">
                  保存エラー: {saveError}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {/* ① 文言変更：LINE → チャット */}
              <button className="px-3 py-1 rounded-xl text-[11px] border border-gray-300 bg-gray-50">
                チャットで連絡
              </button>
              {/* ② 保存ボタン */}
              <button
                className="px-3 py-1 rounded-xl text-[11px] border border-emerald-400/60 bg-emerald-500/80 text-white disabled:opacity-60 disabled:cursor-not-allowed"
                onClick={handleSave}
                disabled={!detail || !form || saving}
              >
                {saving ? "保存中…" : "保存"}
              </button>
              {/* ③ 閉じるボタン */}
              <button
                className="px-3 py-1 rounded-xl text-[11px] border border-red-400/80 bg-red-500/80 text-white"
                onClick={onClose}
              >
                × 閉じる
              </button>
            </div>
          </div>

          {/* コンテンツ（ここをスクロールさせる） */}
          <div className="flex-1 overflow-auto px-4 py-2 bg-white">
            {/* 2x2 グリッド */}
            <div className="grid grid-cols-1 xl:grid-cols-2 xl:auto-rows-fr gap-2 h-full">
              {/* 左上：登録情報① */}
              <section className="bg-gray-50 rounded-2xl p-2.5 border border-gray-200 flex flex-col">
                <h4 className="text-[11px] font-semibold mb-2">
                  登録情報①（プロフィール・希望・確認）
                </h4>

                <div className="grid grid-cols-[140px_minmax(0,1fr)] gap-3 flex-1">
                  {/* 写真 */}
                  <div>
                    <div className="w-full aspect-[3/4] rounded-2xl bg-gray-200 overflow-hidden flex items-center justify-center text-[11px] text-muted">
                      写真
                    </div>
                  </div>

                  {/* 氏名など */}
                  <div className="space-y-2 text-[13px] pr-1">
                    <MainInfoRow
                      label="ふりがな"
                      value={form?.furigana ?? ""}
                      onChange={(v) =>
                        setForm((prev) =>
                          prev ? { ...prev, furigana: v } : prev,
                        )
                      }
                    />
                    <MainInfoRow
                      label="氏名"
                      value={form?.displayName ?? ""}
                      onChange={(v) =>
                        setForm((prev) =>
                          prev ? { ...prev, displayName: v } : prev,
                        )
                      }
                    />
                    <MainInfoRow
                      label="生年月日"
                      value={form?.birthdate ?? ""}
                      placeholder={birth === "—" ? "" : birth}
                      onChange={(v) =>
                        setForm((prev) =>
                          prev ? { ...prev, birthdate: v } : prev,
                        )
                      }
                    />
                    <MainInfoRow
                      label="現住所"
                      value={form?.address ?? ""}
                      onChange={(v) =>
                        setForm((prev) =>
                          prev ? { ...prev, address: v } : prev,
                        )
                      }
                    />
                    <MainInfoRow
                      label="TEL"
                      value={form?.phone ?? ""}
                      onChange={(v) =>
                        setForm((prev) =>
                          prev ? { ...prev, phone: v } : prev,
                        )
                      }
                    />
                    <MainInfoRow
                      label="アドレス"
                      value={form?.email ?? ""}
                      onChange={(v) =>
                        setForm((prev) =>
                          prev ? { ...prev, email: v } : prev,
                        )
                      }
                    />
                    {/* ジャンル（クラブ・キャバ・スナック・ガルバ 複数選択） */}
                    <div className="flex flex-col sm:flex-row sm:items-center sm:gap-3">
                      <div className="sm:w-32 text-[12px] text-muted shrink-0">
                        ジャンル
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap gap-1">
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
                                            ? prev.genres.filter(
                                                (x) => x !== g,
                                              )
                                            : [...prev.genres, g],
                                        }
                                      : prev,
                                  )
                                }
                                className={`px-3 py-1 rounded-full text-[11px] border ${
                                  active
                                    ? "bg-indigo-500 text-white border-indigo-500"
                                    : "bg-white text-ink/80 border-gray-300"
                                }`}
                              >
                                {g}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                    {/* ティアラ査定時給 */}
                    <MainInfoRow
                      label="ティアラ査定時給"
                      value={form?.tiaraHourly ?? ""}
                      placeholder={
                        tiaraHourlyLabel === "—" ? "例: 2500" : tiaraHourlyLabel
                      }
                      onChange={(v) =>
                        setForm((prev) =>
                          prev ? { ...prev, tiaraHourly: v } : prev,
                        )
                      }
                    />
                    {/* NG店舗（複数登録可） */}
                    <MainInfoRow
                      label="NG店舗（複数登録可）"
                      value={form?.ngShopMemo ?? ""}
                      placeholder={
                        detail && (detail as any).ngShops
                          ? `${((detail as any).ngShops as any[]).length}件登録（例: 備考を記入）`
                          : "例: 備考を記入"
                      }
                      onChange={(v) =>
                        setForm((prev) =>
                          prev ? { ...prev, ngShopMemo: v } : prev,
                        )
                      }
                    />
                    {form && (
                      <div className="flex items-center justify-between gap-2 pl-0.5">
                        <div className="text-[11px] text-muted">
                          選択中:{" "}
                          {form.ngShopNames.length
                            ? form.ngShopNames.join(" / ")
                            : "未選択"}
                        </div>
                        <button
                          type="button"
                          onClick={() => setNgModalOpen(true)}
                          className="px-3 py-1.5 rounded-lg text-[11px] border border-indigo-400/70 bg-indigo-500/80 text-white"
                        >
                          店舗から選択
                        </button>
                      </div>
                    )}
                    {/* 専属指名（1店舗） */}
                    <MainInfoRow
                      label="専属指名"
                      value={form?.exclusiveShopMemo ?? ""}
                      placeholder="例: 特に優先して送りたい店舗メモ"
                      onChange={(v) =>
                        setForm((prev) =>
                          prev ? { ...prev, exclusiveShopMemo: v } : prev,
                        )
                      }
                    />
                    {form && (
                      <div className="flex items-center justify-between gap-2 pl-0.5">
                        <div className="text-[11px] text-muted">
                          選択中:{" "}
                          {form.exclusiveShopName
                            ? form.exclusiveShopName
                            : "未選択"}
                        </div>
                        <button
                          type="button"
                          onClick={() => setExclusiveModalOpen(true)}
                          className="px-3 py-1.5 rounded-lg text-[11px] border border-indigo-400/70 bg-indigo-500/80 text-white"
                        >
                          店舗を選択
                        </button>
                      </div>
                    )}
                    {/* 指名（複数店舗可） */}
                    <MainInfoRow
                      label="指名（複数店舗可）"
                      value={form?.favoriteShopMemo ?? ""}
                      placeholder={
                        detail &&
                        ((detail as any).nominatedShops ||
                          (detail as any).favoriteShops)
                          ? `${(
                              ((detail as any).nominatedShops ??
                                (detail as any).favoriteShops) as any[]
                            ).length}件登録（例: 備考を記入）`
                          : "例: 備考を記入"
                      }
                      onChange={(v) =>
                        setForm((prev) =>
                          prev ? { ...prev, favoriteShopMemo: v } : prev,
                        )
                      }
                    />
                    {form && (
                      <div className="flex items-center justify-between gap-2 pl-0.5">
                        <div className="text-[11px] text-muted">
                          選択中:{" "}
                          {form.favoriteShopNames.length
                            ? form.favoriteShopNames.join(" / ")
                            : "未選択"}
                        </div>
                        <button
                          type="button"
                          onClick={() => setFavoriteModalOpen(true)}
                          className="px-3 py-1.5 rounded-lg text-[11px] border border-indigo-400/70 bg-indigo-500/80 text-white"
                        >
                          店舗から選択
                        </button>
                      </div>
                    )}
                    {/* ★ シフト情報（直近2日）＋シフト編集ボタン */}
                    <div className="flex flex-col sm:flex-row sm:items-center sm:gap-3">
                      <div className="sm:w-28 text-[12px] text-muted shrink-0">
                        シフト情報（直近2日）
                      </div>
                      <div className="flex-1 min-w-0 flex items-center gap-2">
                        <div className="w-full text-[12px] px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-slate-900">
                          本日 {todayLabel}: {formatSlot(todaySlot)} / 翌日{" "}
                          {tomorrowLabel}: {formatSlot(tomorrowSlot)}
                        </div>
                        <button
                          type="button"
                          onClick={() => setShiftModalOpen(true)}
                          className="whitespace-nowrap px-3 py-1.5 rounded-lg text-[11px] border border-indigo-400/70 bg-indigo-500/80 text-white"
                        >
                          シフト編集
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

{/* 右上：身分証＋備考 */}
<section className="bg-gray-50 rounded-2xl p-2 border border-gray-200 text-[11px] space-y-1.5">
  <h4 className="text-[11px] font-semibold">
    身分証明書確認 / 申告・備考
  </h4>

  <div className="grid grid-cols-1 gap-1.5">
    {/* 上段：プルダウン 3つ */}
    <div className="bg-white rounded-xl p-2 border border-gray-200 space-y-1">
      {/* 身分証類 → 顔写真 */}
      <SelectRow
        label="顔写真"
        value={form?.idDocType ?? ""}
        onChange={(v) =>
          setForm((prev) =>
            prev
              ? {
                  ...prev,
                  idDocType: v as CastDetailForm["idDocType"],
                }
              : prev,
          )
        }
        options={[
          { value: "パスポート", label: "パスポート" },
          { value: "マイナンバー", label: "マイナンバー" },
          { value: "学生証", label: "学生証" },
          { value: "免許証", label: "免許証" },
          { value: "社員証", label: "社員証" },
          { value: "その他", label: "その他" },
        ]}
      />

      {/* 住民票・郵便物 → 本籍地 */}
      <SelectRow
        label="本籍地"
        value={form?.residencyProof ?? ""}
        onChange={(v) =>
          setForm((prev) =>
            prev
              ? {
                  ...prev,
                  residencyProof:
                    v as CastDetailForm["residencyProof"],
                }
              : prev,
          )
        }
        options={[
          { value: "パスポート", label: "パスポート" },
          {
            value: "本籍地記載住民票",
            label: "本籍地記載住民票",
          },
        ]}
      />

      {/* 宣誓はそのまま */}
      <SelectRow
        label="宣誓（身分証のない・更新時）"
        value={form?.oathStatus ?? ""}
        onChange={(v) =>
          setForm((prev) =>
            prev
              ? {
                  ...prev,
                  oathStatus:
                    v as CastDetailForm["oathStatus"],
                }
              : prev,
          )
        }
        options={[
          { value: "済", label: "済" },
          { value: "未", label: "未" },
        ]}
      />
    </div>

    {/* 中段：備考 */}
    <div className="bg-white rounded-xl p-2 border border-gray-200">
      <InfoRow
        label="備考"
        value={form?.idMemo ?? ""}
        onChange={(v) =>
          setForm((prev) =>
            prev ? { ...prev, idMemo: v } : prev,
          )
        }
      />
    </div>

    {/* 下段：身分証写真（顔写真／本籍地）
        → プロフィール写真と同程度のサイズ＋削除ボタン */}
    <div className="bg-white rounded-xl p-2 border border-gray-200">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* 左：顔写真 */}
        <div className="flex flex-col items-center">
          <div className="w-full text-left text-[11px] text-muted mb-1">
            顔写真
          </div>
          <div className="w-24 sm:w-28 aspect-[3/4] rounded-2xl bg-gray-200 overflow-hidden flex items-center justify-center text-[11px] text-muted">
            写真
          </div>
          <button
            type="button"
            className="mt-2 w-full sm:w-auto px-3 py-1.5 rounded-lg border border-gray-300 bg-gray-50 text-[11px] text-ink hover:bg-gray-100"
            onClick={() => {
              // TODO: 顔写真削除処理（ストレージ削除/API連携は別タスク）
            }}
          >
            顔写真を削除
          </button>
        </div>

        {/* 右：本籍地 */}
        <div className="flex flex-col items-center">
          <div className="w-full text-left text-[11px] text-muted mb-1">
            本籍地
          </div>
          <div className="w-24 sm:w-28 aspect-[3/4] rounded-2xl bg-gray-200 overflow-hidden flex items-center justify-center text-[11px] text-muted">
            写真
          </div>
          <button
            type="button"
            className="mt-2 w-full sm:w-auto px-3 py-1.5 rounded-lg border border-gray-300 bg-gray-50 text-[11px] text-ink hover:bg-gray-100"
            onClick={() => {
              // TODO: 本籍地写真削除処理（ストレージ削除/API連携は別タスク）
            }}
          >
            本籍地の写真を削除
          </button>
        </div>
      </div>
    </div>
  </div>
</section>


              {/* 左下：基本情報 */}
              <section className="bg-gray-50 rounded-2xl p-2 border border-gray-200 space-y-1.5 text-[11px]">
                <h4 className="text-[11px] font-semibold mb-1">
                  基本情報（プロフィール・希望条件・就業可否）
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <div className="bg-white rounded-xl p-2 border border-gray-200">
                    <div className="font-semibold mb-1.5 text-[12px]">
                      プロフィール
                    </div>
                    <InfoRow
                      label="身長"
                      value={form?.heightCm ?? ""}
                      placeholder={
                        detail?.attributes?.heightCm != null
                          ? `${detail.attributes.heightCm} cm`
                          : ""
                      }
                      onChange={(v) =>
                        setForm((prev) =>
                          prev ? { ...prev, heightCm: v } : prev,
                        )
                      }
                    />
                    <InfoRow
                      label="服のサイズ"
                      value={form?.clothingSize ?? ""}
                      onChange={(v) =>
                        setForm((prev) =>
                          prev ? { ...prev, clothingSize: v } : prev,
                        )
                      }
                    />
                    <InfoRow
                      label="靴のサイズ"
                      value={form?.shoeSizeCm ?? ""}
                      placeholder={
                        detail?.attributes?.shoeSizeCm != null
                          ? `${detail.attributes.shoeSizeCm} cm`
                          : ""
                      }
                      onChange={(v) =>
                        setForm((prev) =>
                          prev ? { ...prev, shoeSizeCm: v } : prev,
                        )
                      }
                    />
                  </div>

                  <div className="bg-white rounded-xl p-2 border border-gray-200">
                    <div className="font-semibold mb-1.5 text-[12px]">
                      希望条件
                    </div>
                    <InfoRow
                      label="出勤希望"
                      value={form?.preferredDays ?? ""}
                      placeholder={
                        detail?.preferences?.preferredDays?.length
                          ? detail.preferences.preferredDays.join(" / ")
                          : ""
                      }
                      onChange={(v) =>
                        setForm((prev) =>
                          prev ? { ...prev, preferredDays: v } : prev,
                        )
                      }
                    />
                    <InfoRow
                      label="時間帯"
                      value={
                        form
                          ? `${form.preferredTimeFrom ?? ""}${
                              form.preferredTimeFrom || form.preferredTimeTo
                                ? "〜"
                                : ""
                            }${form.preferredTimeTo ?? ""}`
                          : ""
                      }
                      placeholder={
                        detail?.preferences?.preferredTimeFrom &&
                        detail.preferences?.preferredTimeTo
                          ? `${detail.preferences.preferredTimeFrom}〜${detail.preferences.preferredTimeTo}`
                          : ""
                      }
                      onChange={(v) => {
                        // 簡易パース（"HH:MM〜HH:MM" を想定）
                        const [from, to] = v.split("〜");
                        setForm((prev) =>
                          prev
                            ? {
                                ...prev,
                                preferredTimeFrom: from?.trim() ?? "",
                                preferredTimeTo: to?.trim() ?? "",
                              }
                            : prev,
                        );
                      }}
                    />
                    <InfoRow
                      label="希望エリア"
                      value={form?.preferredArea ?? ""}
                      placeholder={detail?.preferences?.preferredArea ?? ""}
                      onChange={(v) =>
                        setForm((prev) =>
                          prev ? { ...prev, preferredArea: v } : prev,
                        )
                      }
                    />
                    <InfoRow
                      label="時給・月給"
                      value={form?.salaryNote ?? ""}
                      placeholder={
                        detail?.preferences
                          ? [
                              detail.preferences.desiredHourly != null
                                ? `¥${detail.preferences.desiredHourly.toLocaleString()}以上`
                                : null,
                              detail.preferences.desiredMonthly != null
                                ? `${detail.preferences.desiredMonthly.toLocaleString()}万円以上`
                                : null,
                            ]
                              .filter(Boolean)
                              .join(" / ") || ""
                          : ""
                      }
                      onChange={(v) =>
                        setForm((prev) =>
                          prev ? { ...prev, salaryNote: v } : prev,
                        )
                      }
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <div className="bg-white rounded-xl p-2 border border-gray-200">
                    <div className="font-semibold mb-1.5 text-[12px]">
                      就業可否
                    </div>
                    <SelectRow
                      label="タトゥー"
                      value={form?.tattoo ?? ""}
                      onChange={(v) =>
                        setForm((prev) =>
                          prev
                            ? {
                                ...prev,
                                tattoo: v as CastDetailForm["tattoo"],
                              }
                            : prev,
                        )
                      }
                      options={[
                        { value: "有", label: "有" },
                        { value: "無", label: "無" },
                      ]}
                    />
                    <SelectRow
                      label="送迎の要否"
                      value={form?.needPickup ?? ""}
                      onChange={(v) =>
                        setForm((prev) =>
                          prev
                            ? {
                                ...prev,
                                needPickup: v as CastDetailForm["needPickup"],
                              }
                            : prev,
                        )
                      }
                      options={[
                        { value: "要", label: "要" },
                        { value: "不要", label: "不要" },
                      ]}
                    />
                    <SelectRow
                      label="飲酒"
                      value={form?.drinkLevel ?? ""}
                      onChange={(v) =>
                        setForm((prev) =>
                          prev
                            ? {
                                ...prev,
                                drinkLevel: v as CastDetailForm["drinkLevel"],
                              }
                            : prev,
                        )
                      }
                      options={[
                        { value: "NG", label: "NG" },
                        { value: "弱い", label: "弱い" },
                        { value: "普通", label: "普通" },
                        { value: "強い", label: "強い" },
                      ]}
                    />
                  </div>

                  <div className="bg-white rounded-xl p-2 border border-gray-200">
                    <div className="font-semibold mb-1.5 text-[12px]">
                      水商売の経験
                    </div>
                    <SelectRow
                      label="経験"
                      value={form?.hasExperience ?? ""}
                      onChange={(v) =>
                        setForm((prev) =>
                          prev
                            ? {
                                ...prev,
                                hasExperience:
                                  v as CastDetailForm["hasExperience"],
                              }
                            : prev,
                        )
                      }
                      options={[
                        { value: "あり", label: "あり" },
                        { value: "なし", label: "なし" },
                      ]}
                    />
                    <InfoRow
                      label="勤務歴"
                      value={form?.workHistory ?? ""}
                      onChange={(v) =>
                        setForm((prev) =>
                          prev ? { ...prev, workHistory: v } : prev,
                        )
                      }
                    />
                  </div>
                </div>
              </section>

              {/* 右下：登録情報② */}
              <section className="bg-gray-50 rounded-2xl p-2.5 border border-gray-200 text-[11px] space-y-1.5">
                <h4 className="text-[11px] font-semibold mb-1">
                  登録情報②（動機・比較・選定理由）
                </h4>

                <InfoRow
                  label="知った経路"
                  value={form?.howFound ?? ""}
                  onChange={(v) =>
                    setForm((prev) =>
                      prev ? { ...prev, howFound: v } : prev,
                    )
                  }
                />
                <InfoRow
                  label="紹介者名 / サイト名"
                  value={form?.referrerName ?? ""}
                  onChange={(v) =>
                    setForm((prev) =>
                      prev ? { ...prev, referrerName: v } : prev,
                    )
                  }
                />
                <InfoRow
                  label="お仕事を始めるきっかけ"
                  value={form?.motivation ?? ""}
                  onChange={(v) =>
                    setForm((prev) =>
                      prev ? { ...prev, motivation: v } : prev,
                    )
                  }
                />
                <InfoRow
                  label="他の派遣会社との比較"
                  value={form?.compareOtherAgencies ?? ""}
                  onChange={(v) =>
                    setForm((prev) =>
                      prev
                        ? { ...prev, compareOtherAgencies: v }
                        : prev,
                    )
                  }
                />
                <InfoRow
                  label="比較状況"
                  value={form?.otherAgencies ?? ""}
                  onChange={(v) =>
                    setForm((prev) =>
                      prev ? { ...prev, otherAgencies: v } : prev,
                    )
                  }
                />
                <InfoRow
                  label="派遣会社名"
                  value={form?.otherAgencyName ?? ""}
                  onChange={(v) =>
                    setForm((prev) =>
                      prev ? { ...prev, otherAgencyName: v } : prev,
                    )
                  }
                />

                <div className="h-px bg-gray-200 my-1" />

                <InfoRow
                  label="ティアラを選んだ理由"
                  value={form?.reasonChoose ?? ""}
                  onChange={(v) =>
                    setForm((prev) =>
                      prev ? { ...prev, reasonChoose: v } : prev,
                    )
                  }
                />
                <InfoRow
                  label="派遣先のお店選びで重要なポイント"
                  value={form?.shopSelectionPoints ?? ""}
                  onChange={(v) =>
                    setForm((prev) =>
                      prev ? { ...prev, shopSelectionPoints: v } : prev,
                    )
                  }
                />
                <InfoRow
                  label="その他（備考）"
                  value={form?.otherNotes ?? ""}
                  onChange={(v) =>
                    setForm((prev) =>
                      prev ? { ...prev, otherNotes: v } : prev,
                    )
                  }
                />

                <div className="h-px bg-gray-200 my-1" />

                <InfoRow
                  label="30,000円到達への所感"
                  value={form?.thirtyKComment ?? ""}
                  onChange={(v) =>
                    setForm((prev) =>
                      prev ? { ...prev, thirtyKComment: v } : prev,
                    )
                  }
                />
              </section>
            </div>
          </div>
        </div>
      </div>

      {/* シフト編集モーダル */}
      {shiftModalOpen && (
        <ShiftEditModal
          onClose={() => setShiftModalOpen(false)}
          castName={displayName}
        />
      )}

      {/* NG店舗選択モーダル */}
      {ngModalOpen && form && (
        <NgShopSelectModal
          onClose={() => setNgModalOpen(false)}
          selectedIds={form.ngShopIds}
          onChange={(ids, names) => {
            setForm((prev) =>
              prev ? { ...prev, ngShopIds: ids, ngShopNames: names } : prev,
            );
          }}
        />
      )}

      {/* 専属指名店舗選択モーダル */}
      {exclusiveModalOpen && form && (
        <ExclusiveShopSelectModal
          onClose={() => setExclusiveModalOpen(false)}
          selectedId={form.exclusiveShopId}
          onChange={(id, name) => {
            setForm((prev) =>
              prev
                ? {
                    ...prev,
                    exclusiveShopId: id,
                    exclusiveShopName: name,
                  }
                : prev,
            );
          }}
        />
      )}

      {/* 指名店舗（旧お気に入り）選択モーダル */}
      {favoriteModalOpen && form && (
        <FavoriteShopSelectModal
          onClose={() => setFavoriteModalOpen(false)}
          selectedIds={form.favoriteShopIds}
          onChange={(ids, names) => {
            setForm((prev) =>
              prev
                ? { ...prev, favoriteShopIds: ids, favoriteShopNames: names }
                : prev,
            );
          }}
        />
      )}
    </>
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
    <div className="fixed inset-0 z-[120] flex items-center justify-center px-3">
      <div className="absolute inset-0 bg-black/60" onClick={onCancel} />
      <div className="relative z-10 w-full max-w-md bg-white rounded-2xl border border-gray-300 shadow-2xl p-4">
        <h4 className="text-sm font-semibold text-ink mb-2">
          キャスト削除の確認
        </h4>
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
              旧スタッフID:{" "}
              <span className="font-mono">{target.legacyStaffId}</span>
            </>
          )}
        </p>
        {error && (
          <p className="text-xs text-red-500 mb-2">削除エラー: {error}</p>
        )}
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
    <div className="fixed inset-0 z-[120] flex items-center justify-center px-3">
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
                    const isToday =
                      d.date.toDateString() === now.toDateString();
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
                        <div className="text-[10px] text-muted">
                          シフト: 未設定
                        </div>
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
function NgShopSelectModal({
  onClose,
  selectedIds,
  onChange,
}: {
  onClose: () => void;
  selectedIds: string[];
  onChange: (ids: string[], names: string[]) => void;
}) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<ShopListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localSelected, setLocalSelected] = useState<string[]>(selectedIds ?? []);

  // 追加: ジャンル絞り込み & 並び替え
  const [genreFilter, setGenreFilter] = useState<string>("");
  const [sortMode, setSortMode] = useState<"kana" | "number">("kana");

  useEffect(() => {
    setLocalSelected(selectedIds ?? []);
  }, [selectedIds]);

  // 店舗一覧取得：limit を 10,000 にして「全件」取得する想定
  const fetchShops = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listShops({
        q: q.trim() || undefined,
        limit: 10_000, // 全件取得（API 側でクランプされる想定）
      });
      setItems((res as any).items ?? []);
    } catch (e: any) {
      console.error(e);
      setError(e?.message ?? "店舗一覧の取得に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // 初回ロードで全件取得
    fetchShops();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleSelect = (id: string) => {
    setLocalSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const handleApply = () => {
    const idSet = new Set(localSelected);
    const names = items
      .filter((s: any) => idSet.has(String(s.id)))
      .map((s: any) => String(s.name ?? s.shopName ?? ""))
      .filter((n) => n && n.trim());
    onChange(localSelected, names);
    onClose();
  };

  // ジャンル候補（items から動的に生成）
  const genreOptions = ["クラブ", "キャバ", "スナック", "ガルバ"] as const;

  // フィルタ・並び替えを適用したリスト
  const filteredItems = useMemo(() => {
    let list: any[] = [...items];

    // ジャンル絞り込み
    if (genreFilter) {
      list = list.filter((s) => {
        const g: string | undefined =
          (s.genre as string | undefined) ??
          (Array.isArray(s.genres) ? s.genres[0] : undefined);
        return g ? g.trim() === genreFilter : false;
      });
    }

    // 並び替え
    list.sort((a, b) => {
      const nameA = String(a.name ?? a.shopName ?? "");
      const nameB = String(b.name ?? b.shopName ?? "");
      const numAraw =
        (a.shopNumber as string | number | undefined) ??
        (a.number as string | number | undefined) ??
        "";
      const numBraw =
        (b.shopNumber as string | number | undefined) ??
        (b.number as string | number | undefined) ??
        "";

      if (sortMode === "number") {
        const numA = Number(String(numAraw).replace(/[^\d]/g, "")) || 0;
        const numB = Number(String(numBraw).replace(/[^\d]/g, "")) || 0;
        if (numA !== numB) return numA - numB;
        return nameA.localeCompare(nameB, "ja");
      }

      // デフォルト: 50音順（店舗名）
      return nameA.localeCompare(nameB, "ja");
    });

    return list as ShopListItem[];
  }, [items, genreFilter, sortMode]);

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center px-3">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative z-10 w-[96vw] max-w-4xl max-h-[82vh] bg-white rounded-2xl border border-gray-300 shadow-2xl p-4 flex flex-col">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h4 className="text-sm font-semibold">NG店舗の選択</h4>
            <p className="text-[11px] text-muted">
              NGにしたい店舗を複数選択してください。
            </p>
          </div>
          <button
            className="px-3 py-1 rounded-lg text-[11px] border border-red-400/80 bg-red-500/80 text-white"
            onClick={onClose}
          >
            閉じる
          </button>
        </div>

        {/* 検索 + ジャンル絞り込み + 並び替え */}
        <div className="flex flex-wrap items-center gap-2 mb-2">
          {/* 検索テキスト：横幅を今の半分に調整 */}
          <input
            className="tiara-input w-full md:w-1/2"
            placeholder="店舗名・エリアなどで検索"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />

          {/* ジャンル絞り込み */}
          <select
            className="tiara-input w-[120px] text-[11px]"
            value={genreFilter}
            onChange={(e) => setGenreFilter(e.target.value)}
          >
            <option value="">ジャンル（すべて）</option>
            {genreOptions.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>

          {/* 並び替え */}
          <select
            className="tiara-input w-[140px] text-[11px]"
            value={sortMode}
            onChange={(e) =>
              setSortMode(e.target.value === "number" ? "number" : "kana")
            }
          >
            <option value="kana">並び順：50音順</option>
            <option value="number">並び順：店舗番号順</option>
          </select>

          <button
            type="button"
            className="px-3 py-1.5 rounded-lg text-[11px] border border-indigo-400/70 bg-indigo-500/80 text-white disabled:opacity-60"
            onClick={fetchShops}
            disabled={loading}
          >
            {loading ? "検索中…" : "検索"}
          </button>
        </div>

        {error && (
          <div className="mb-2 text-[11px] text-red-500">エラー: {error}</div>
        )}

        {/* 店舗一覧（フィルタ・並び替え後を表示） */}
        <div className="flex-1 overflow-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-[11px]">
            <thead className="bg-gray-50">
              <tr>
                <th className="w-10 px-2 py-1 text-left">NG</th>
                <th className="px-2 py-1 text-left">店舗名</th>
                <th className="px-2 py-1 text-left">エリア</th>
                <th className="px-2 py-1 text-left">住所</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((s: any) => {
                const id = String(s.id);
                const checked = localSelected.includes(id);
                return (
                  <tr
                    key={id}
                    className="border-t border-gray-100 hover:bg-gray-50 cursor-pointer"
                    onClick={() => toggleSelect(id)}
                  >
                    <td className="px-2 py-1">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleSelect(id)}
                      />
                    </td>
                    <td className="px-2 py-1">
                      {s.name ?? s.shopName}
                    </td>
                    <td className="px-2 py-1">
                      {s.area ?? s.city ?? ""}
                    </td>
                    <td className="px-2 py-1 text-xs text-muted">
                      {s.address ?? ""}
                    </td>
                  </tr>
                );
              })}
              {!loading && filteredItems.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-3 py-3 text-center text-[11px] text-muted"
                  >
                    該当する店舗がありません
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* フッター */}
        <div className="mt-3 flex items-center justify-between text-[11px]">
          <div className="text-muted">
            選択中: {localSelected.length} 件
          </div>
          <div className="flex items-center gap-2">
            <button
              className="px-3 py-1 rounded-lg border border-gray-300 bg-gray-50 text-ink"
              onClick={() => {
                setLocalSelected([]);
              }}
            >
              すべて解除
            </button>
            <button
              className="px-3 py-1 rounded-lg border border-emerald-400/60 bg-emerald-500/80 text-white disabled:opacity-60"
              disabled={loading}
              onClick={handleApply}
            >
              この内容で登録
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
  selectedId,
  onChange,
}: {
  onClose: () => void;
  selectedId: string | null;
  onChange: (id: string | null, name: string | null) => void;
}) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<ShopListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localSelected, setLocalSelected] = useState<string | null>(
    selectedId ?? null,
  );

  const [genreFilter, setGenreFilter] = useState<string>("");
  const [sortMode, setSortMode] = useState<"kana" | "number">("kana");

  useEffect(() => {
    setLocalSelected(selectedId ?? null);
  }, [selectedId]);

  const fetchShops = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listShops({
        q: q.trim() || undefined,
        limit: 10_000,
      });
      setItems((res as any).items ?? []);
    } catch (e: any) {
      console.error(e);
      setError(e?.message ?? "店舗一覧の取得に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchShops();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleSelect = (id: string) => {
    setLocalSelected((prev) => (prev === id ? null : id));
  };

  const handleApply = () => {
    if (!localSelected) {
      onChange(null, null);
      onClose();
      return;
    }
    const shop = items.find((s: any) => String(s.id) === localSelected) as any;
    const name =
      shop && (shop.name ?? shop.shopName)
        ? String(shop.name ?? shop.shopName)
        : null;
    onChange(localSelected, name);
    onClose();
  };

  const genreOptions = ["クラブ", "キャバ", "スナック", "ガルバ"] as const;

  const filteredItems = useMemo(() => {
    let list: any[] = [...items];
    if (genreFilter) {
      list = list.filter((s) => {
        const g: string | undefined =
          (s.genre as string | undefined) ??
          (Array.isArray(s.genres) ? s.genres[0] : undefined);
        return g ? g.trim() === genreFilter : false;
      });
    }
    list.sort((a, b) => {
      const nameA = String(a.name ?? a.shopName ?? "");
      const nameB = String(b.name ?? b.shopName ?? "");
      const numAraw =
        (a.shopNumber as string | number | undefined) ??
        (a.number as string | number | undefined) ??
        "";
      const numBraw =
        (b.shopNumber as string | number | undefined) ??
        (b.number as string | number | undefined) ??
        "";
      if (sortMode === "number") {
        const numA = Number(String(numAraw).replace(/[^\d]/g, "")) || 0;
        const numB = Number(String(numBraw).replace(/[^\d]/g, "")) || 0;
        if (numA !== numB) return numA - numB;
        return nameA.localeCompare(nameB, "ja");
      }
      return nameA.localeCompare(nameB, "ja");
    });
    return list as ShopListItem[];
  }, [items, genreFilter, sortMode]);

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center px-3">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative z-10 w-[96vw] max-w-4xl max-h-[82vh] bg-white rounded-2xl border border-gray-300 shadow-2xl p-4 flex flex-col">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h4 className="text-sm font-semibold">専属指名店舗の選択</h4>
            <p className="text-[11px] text-muted">
              専属で優先的に配属したい店舗を1件選択してください。
            </p>
          </div>
          <button
            className="px-3 py-1 rounded-lg text-[11px] border border-red-400/80 bg-red-500/80 text-white"
            onClick={onClose}
          >
            閉じる
          </button>
        </div>

        {/* 検索 + ジャンル絞り込み + 並び替え */}
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <input
            className="tiara-input w-full md:w-1/2"
            placeholder="店舗名・エリアなどで検索"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select
            className="tiara-input w-[120px] text-[11px]"
            value={genreFilter}
            onChange={(e) => setGenreFilter(e.target.value)}
          >
            <option value="">ジャンル（すべて）</option>
            {genreOptions.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
          <select
            className="tiara-input w-[140px] text-[11px]"
            value={sortMode}
            onChange={(e) =>
              setSortMode(e.target.value === "number" ? "number" : "kana")
            }
          >
            <option value="kana">並び順：50音順</option>
            <option value="number">並び順：店舗番号順</option>
          </select>
          <button
            type="button"
            className="px-3 py-1.5 rounded-lg text-[11px] border border-indigo-400/70 bg-indigo-500/80 text-white disabled:opacity-60"
            onClick={fetchShops}
            disabled={loading}
          >
            {loading ? "検索中…" : "検索"}
          </button>
        </div>

        {error && (
          <div className="mb-2 text-[11px] text-red-500">エラー: {error}</div>
        )}

        <div className="flex-1 overflow-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-[11px]">
            <thead className="bg-gray-50">
              <tr>
                <th className="w-10 px-2 py-1 text-left">専属</th>
                <th className="px-2 py-1 text-left">店舗名</th>
                <th className="px-2 py-1 text-left">エリア</th>
                <th className="px-2 py-1 text-left">住所</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((s: any) => {
                const id = String(s.id);
                const checked = localSelected === id;
                return (
                  <tr
                    key={id}
                    className="border-t border-gray-100 hover:bg-gray-50 cursor-pointer"
                    onClick={() => toggleSelect(id)}
                  >
                    <td className="px-2 py-1">
                      <input
                        type="radio"
                        checked={checked}
                        onChange={() => toggleSelect(id)}
                      />
                    </td>
                    <td className="px-2 py-1">
                      {s.name ?? s.shopName}
                    </td>
                    <td className="px-2 py-1">
                      {s.area ?? s.city ?? ""}
                    </td>
                    <td className="px-2 py-1 text-xs text-muted">
                      {s.address ?? ""}
                    </td>
                  </tr>
                );
              })}
              {!loading && filteredItems.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-3 py-3 text-center text-[11px] text-muted"
                  >
                    該当する店舗がありません
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex items-center justify-between text-[11px]">
          <div className="text-muted">
            選択中: {localSelected ? 1 : 0} 件
          </div>
          <div className="flex items-center gap-2">
            <button
              className="px-3 py-1 rounded-lg border border-gray-300 bg-gray-50 text-ink"
              onClick={() => {
                setLocalSelected(null);
              }}
            >
              解除
            </button>
            <button
              className="px-3 py-1 rounded-lg border border-emerald-400/60 bg-emerald-500/80 text-white disabled:opacity-60"
              disabled={loading}
              onClick={handleApply}
            >
              この内容で登録
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
  selectedIds,
  onChange,
}: {
  onClose: () => void;
  selectedIds: string[];
  onChange: (ids: string[], names: string[]) => void;
}) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<ShopListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localSelected, setLocalSelected] = useState<string[]>(selectedIds ?? []);

  // 追加: ジャンル絞り込み & 並び替え
  const [genreFilter, setGenreFilter] = useState<string>("");
  const [sortMode, setSortMode] = useState<"kana" | "number">("kana");

  useEffect(() => {
    setLocalSelected(selectedIds ?? []);
  }, [selectedIds]);

  // 店舗一覧取得：limit を 10,000 にして「全件」取得する想定
  const fetchShops = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listShops({
        q: q.trim() || undefined,
        limit: 10_000, // 全件取得（API 側でクランプされる想定）
      });
      setItems((res as any).items ?? []);
    } catch (e: any) {
      console.error(e);
      setError(e?.message ?? "店舗一覧の取得に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // 初回ロードで全件取得
    fetchShops();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleSelect = (id: string) => {
    setLocalSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const handleApply = () => {
    const idSet = new Set(localSelected);
    const names = items
      .filter((s: any) => idSet.has(String(s.id)))
      .map((s: any) => String(s.name ?? s.shopName ?? ""))
      .filter((n) => n && n.trim());
    onChange(localSelected, names);
    onClose();
  };

  // ジャンル候補（items から動的に生成）
  const genreOptions = ["クラブ", "キャバ", "スナック", "ガルバ"] as const;

  // フィルタ・並び替えを適用したリスト
  const filteredItems = useMemo(() => {
    let list: any[] = [...items];

    // ジャンル絞り込み
    if (genreFilter) {
      list = list.filter((s) => {
        const g: string | undefined =
          (s.genre as string | undefined) ??
          (Array.isArray(s.genres) ? s.genres[0] : undefined);
        return g ? g.trim() === genreFilter : false;
      });
    }

    // 並び替え
    list.sort((a, b) => {
      const nameA = String(a.name ?? a.shopName ?? "");
      const nameB = String(b.name ?? b.shopName ?? "");
      const numAraw =
        (a.shopNumber as string | number | undefined) ??
        (a.number as string | number | undefined) ??
        "";
      const numBraw =
        (b.shopNumber as string | number | undefined) ??
        (b.number as string | number | undefined) ??
        "";

      if (sortMode === "number") {
        const numA = Number(String(numAraw).replace(/[^\d]/g, "")) || 0;
        const numB = Number(String(numBraw).replace(/[^\d]/g, "")) || 0;
        if (numA !== numB) return numA - numB;
        return nameA.localeCompare(nameB, "ja");
      }

      // デフォルト: 50音順（店舗名）
      return nameA.localeCompare(nameB, "ja");
    });

    return list as ShopListItem[];
  }, [items, genreFilter, sortMode]);

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center px-3">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative z-10 w-[96vw] max-w-4xl max-h-[82vh] bg-white rounded-2xl border border-gray-300 shadow-2xl p-4 flex flex-col">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h4 className="text-sm font-semibold">指名店舗の選択</h4>
            <p className="text-[11px] text-muted">
              よく配属したい店舗を複数選択してください。
            </p>
          </div>
          <button
            className="px-3 py-1 rounded-lg text-[11px] border border-red-400/80 bg-red-500/80 text-white"
            onClick={onClose}
          >
            閉じる
          </button>
        </div>

        {/* 検索 + ジャンル絞り込み + 並び替え */}
        <div className="flex flex-wrap items-center gap-2 mb-2">
          {/* 検索テキスト：横幅を今の半分に調整 */}
          <input
            className="tiara-input w-full md:w-1/2"
            placeholder="店舗名・エリアなどで検索"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />

          {/* ジャンル絞り込み */}
          <select
            className="tiara-input w-[120px] text-[11px]"
            value={genreFilter}
            onChange={(e) => setGenreFilter(e.target.value)}
          >
            <option value="">ジャンル（すべて）</option>
            {genreOptions.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>

          {/* 並び替え */}
          <select
            className="tiara-input w-[140px] text-[11px]"
            value={sortMode}
            onChange={(e) =>
              setSortMode(e.target.value === "number" ? "number" : "kana")
            }
          >
            <option value="kana">並び順：50音順</option>
            <option value="number">並び順：店舗番号順</option>
          </select>

          <button
            type="button"
            className="px-3 py-1.5 rounded-lg text-[11px] border border-indigo-400/70 bg-indigo-500/80 text-white disabled:opacity-60"
            onClick={fetchShops}
            disabled={loading}
          >
            {loading ? "検索中…" : "検索"}
          </button>
        </div>

        {error && (
          <div className="mb-2 text-[11px] text-red-500">エラー: {error}</div>
        )}

        {/* 店舗一覧（フィルタ・並び替え後を表示） */}
        <div className="flex-1 overflow-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-[11px]">
            <thead className="bg-gray-50">
              <tr>
                <th className="w-10 px-2 py-1 text-left">指名</th>
                <th className="px-2 py-1 text-left">店舗名</th>
                <th className="px-2 py-1 text-left">エリア</th>
                <th className="px-2 py-1 text-left">住所</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((s: any) => {
                const id = String(s.id);
                const checked = localSelected.includes(id);
                return (
                  <tr
                    key={id}
                    className="border-t border-gray-100 hover:bg-gray-50 cursor-pointer"
                    onClick={() => toggleSelect(id)}
                  >
                    <td className="px-2 py-1">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleSelect(id)}
                      />
                    </td>
                    <td className="px-2 py-1">
                      {s.name ?? s.shopName}
                    </td>
                    <td className="px-2 py-1">
                      {s.area ?? s.city ?? ""}
                    </td>
                    <td className="px-2 py-1 text-xs text-muted">
                      {s.address ?? ""}
                    </td>
                  </tr>
                );
              })}
              {!loading && filteredItems.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-3 py-3 text-center text-[11px] text-muted"
                  >
                    該当する店舗がありません
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* フッター */}
        <div className="mt-3 flex items-center justify-between text-[11px]">
          <div className="text-muted">
            選択中: {localSelected.length} 件
          </div>
          <div className="flex items-center gap-2">
            <button
              className="px-3 py-1 rounded-lg border border-gray-300 bg-gray-50 text-ink"
              onClick={() => {
                setLocalSelected([]);
              }}
            >
              すべて解除
            </button>
            <button
              className="px-3 py-1 rounded-lg border border-emerald-400/60 bg-emerald-500/80 text-white disabled:opacity-60"
              disabled={loading}
              onClick={handleApply}
            >
              この内容で登録
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** 登録情報①用：文字を大きくしてメイン情報を強調する行（編集可） */
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
