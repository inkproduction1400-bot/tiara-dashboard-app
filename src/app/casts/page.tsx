// src/app/casts/page.tsx
"use client";

import { useMemo, useState, useEffect } from "react";
import AppShell from "@/components/AppShell";
import { createPortal } from "react-dom";
import {
  listCasts,
  getCast,
  type CastDetail,
} from "@/lib/api.casts";

/**
 * 一覧用キャスト行（API からの view model）
 * - 管理番号（4桁数字）
 * - 名前
 * - 年齢
 * - 希望時給
 * - キャストID（A001 など）※現状はプレースホルダ
 * - 担当者名 ※現状はプレースホルダ
 * - 旧システムのスタッフID（legacyStaffId）
 */
type CastRow = {
  id: string;
  managementNumber: string; // 管理番号（4桁など）
  name: string;
  age: number | null;
  desiredHourly: number | null;
  castCode: string;
  ownerStaffName: string;
  legacyStaffId: number | null; // 👈 追加：旧システムのスタッフID
};

type SortMode = "kana" | "hourly";

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

  // 一覧取得（q でサーバー側検索）
  useEffect(() => {
    let canceled = false;

    async function run() {
      setLoading(true);
      setLoadError(null);
      try {
        const res = await listCasts({
          q: q.trim() || undefined,
        });

        if (canceled) return;

        const mapped: CastRow[] = (res.items ?? []).map((c) => ({
          id: c.userId,
          managementNumber: c.managementNumber ?? "----",
          name: c.displayName ?? "(名前未設定)",
          age: null, // 年齢は詳細 API からのみ取得できるのでここでは null
          desiredHourly: null, // 希望時給も詳細 API 側の preferences から取る
          castCode: "-", // 仕様確定後に API フィールドと紐付け
          ownerStaffName: "-", // 仕様確定後に API フィールドと紐付け
          legacyStaffId: c.legacyStaffId ?? null, // 👈 ここで旧IDをマッピング
        }));

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
  }, [q]);

  // 担当者ドロップダウン用の一覧
  const staffOptions = useMemo(() => {
    const set = new Set<string>();
    baseRows.forEach((r) => {
      if (r.ownerStaffName && r.ownerStaffName !== "-") set.add(r.ownerStaffName);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ja"));
  }, [baseRows]);

  // 検索＋担当者フィルタ＋ソート
  const rows = useMemo(() => {
    const query = q.trim();
    let result = baseRows.filter((r) => {
      if (staffFilter && r.ownerStaffName !== staffFilter) return false;
      if (!query) return true;
      // 管理番号 / 名前 / 旧スタッフID に含まれていればヒット
      const legacy = r.legacyStaffId != null ? String(r.legacyStaffId) : "";
      const hay = `${r.managementNumber} ${r.name} ${legacy}`;
      return hay.includes(query);
    });

    result = result.slice().sort((a, b) => {
      if (sortMode === "hourly") {
        const av = a.desiredHourly ?? 0;
        const bv = b.desiredHourly ?? 0;
        // 希望時給の高い順
        if (av !== bv) return bv - av;
        // 同額なら名前の50音順
        return a.name.localeCompare(b.name, "ja");
      }
      // 50音順（名前）
      const cmp = a.name.localeCompare(b.name, "ja");
      if (cmp !== 0) return cmp;
      // 同名なら管理番号昇順
      return a.managementNumber.localeCompare(b.managementNumber, "ja");
    });

    return result;
  }, [q, staffFilter, sortMode, baseRows]);

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

  return (
    <AppShell>
      <section className="tiara-panel h-full flex flex-col p-3">
        <header className="pb-2 border-b border-white/10 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-extrabold">キャスト管理</h2>
            <p className="text-xs text-muted">
              管理番号・名前・旧IDで検索／担当者と並び替えでソート
            </p>
          </div>
          <div className="text-[11px] text-muted">
            {loading
              ? "一覧を読み込み中…"
              : `${rows.length.toLocaleString()} 件表示中`}
            {loadError && (
              <span className="ml-2 text-red-400">
                （{loadError}）
              </span>
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
                  checked={sortMode === "hourly"}
                  onChange={() => setSortMode("hourly")}
                />
                時給順
              </label>
              <button
                className="rounded-xl border border-white/15 bg-white/5 text-ink px-3 py-2 text-xs"
                onClick={() => {
                  setQ("");
                  setStaffFilter("");
                  setSortMode("kana");
                }}
              >
                クリア
              </button>
            </div>
          </div>
        </div>

        {/* テーブル */}
        <div className="mt-3 overflow-auto rounded-xl border border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-white/5 text-muted">
              <tr>
                <th className="text-left px-3 py-2 w-28">管理番号</th>
                <th className="text-left px-3 py-2">名前</th>
                <th className="text-left px-3 py-2 w-16">年齢</th>
                <th className="text-left px-3 py-2 w-24">希望時給</th>
                <th className="text-left px-3 py-2 w-24">旧スタッフID</th>
                <th className="text-left px-3 py-2 w-32">担当者</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className="border-t border-white/10 hover:bg-white/5 cursor-pointer"
                  onClick={() => handleRowClick(r)}
                >
                  <td className="px-3 py-2 font-mono">{r.managementNumber}</td>
                  <td className="px-3 py-2">{r.name}</td>
                  <td className="px-3 py-2">{r.age ?? "-"}</td>
                  <td className="px-3 py-2">
                    {r.desiredHourly
                      ? `¥${r.desiredHourly.toLocaleString()}`
                      : "-"}
                  </td>
                  <td className="px-3 py-2 font-mono">
                    {r.legacyStaffId != null ? r.legacyStaffId : "-"}
                  </td>
                  <td className="px-3 py-2">{r.ownerStaffName || "-"}</td>
                </tr>
              ))}
              {!loading && rows.length === 0 && (
                <tr>
                  <td className="px-3 py-6 text-center text-muted" colSpan={6}>
                    該当データがありません
                  </td>
                </tr>
              )}
            </tbody>
          </table>
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

/**
 * キャスト詳細モーダル
 */
function CastDetailModal({
  cast,
  detail,
  detailLoading,
  detailError,
  onClose,
}: CastDetailModalProps) {
  const [shiftModalOpen, setShiftModalOpen] = useState(false);

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

  const displayName = detail?.displayName ?? cast.name;
  const managementNumber = detail?.managementNumber ?? cast.managementNumber;
  const legacyStaffId =
    detail?.legacyStaffId ?? cast.legacyStaffId ?? null; // 👈 詳細に旧IDが来ていれば優先
  const birth = detail?.birthdate
    ? detail.age != null
      ? `${detail.birthdate}（${detail.age}歳）`
      : detail.birthdate
    : "—";
  const address = detail?.address ?? "—";
  const phone = detail?.phone ?? "—";
  const email = detail?.email ?? "—";
  const tiaraHourly =
    detail?.preferences?.desiredHourly != null
      ? `¥${detail.preferences.desiredHourly.toLocaleString()}`
      : "—";

  return (
    <>
      {/* viewport 基準で中央固定 */}
      <div className="fixed inset-0 z-[100] flex items-center justify-center">
        {/* オーバーレイ */}
        <div className="absolute inset-0 bg-black/60" onClick={onClose} />

        {/* 本体：横幅広め・高さは 86vh に収める */}
        <div className="relative z-10 w-[96vw] max-w-7xl max-h-[86vh] min-h-[60vh] bg-slate-950 rounded-2xl shadow-2xl border border-white/10 overflow-hidden flex flex-col">
          {/* ヘッダー */}
          <div className="flex items-center justify-between px-5 py-1.5 border-b border-white/10 bg-slate-900/80">
            <div className="flex items-center gap-3">
              <h3 className="text-sm font-semibold">
                キャスト詳細（{displayName}）
              </h3>
              <span className="text-[10px] text-muted">
                管理番号: {managementNumber} / 旧スタッフID:{" "}
                {legacyStaffId ?? "-"} / キャストID: {cast.castCode}
              </span>
              {detailLoading && (
                <span className="text-[10px] text-emerald-300">
                  詳細読み込み中…
                </span>
              )}
              {!detailLoading && detailError && (
                <span className="text-[10px] text-red-400">
                  {detailError}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {/* ① 文言変更：LINE → チャット */}
              <button className="px-3 py-1 rounded-xl text-[11px] border border-white/15 bg-white/5">
                チャットで連絡
              </button>
              {/* ② 保存ボタン（API連携は後続タスクで updateCast を紐付け） */}
              <button className="px-3 py-1 rounded-xl text-[11px] border border-emerald-400/60 bg-emerald-500/80 text-white">
                保存
              </button>
              {/* ③ 閉じるボタン */}
              <button
                className="px-3 py-1 rounded-xl text-[11px] border border-white/20 bg-red-500/80 text-white"
                onClick={onClose}
              >
                × 閉じる
              </button>
            </div>
          </div>

          {/* コンテンツ */}
          <div className="flex-1 px-4 py-2 bg-slate-950">
            {/* 2x2 グリッド */}
            <div className="grid grid-cols-1 xl:grid-cols-2 xl:auto-rows-fr gap-2 h-full">
              {/* 左上：登録情報① */}
              <section className="bg-slate-900/80 rounded-2xl p-2.5 border border-white/5 flex flex-col">
                <h4 className="text-[11px] font-semibold mb-2">
                  登録情報①（プロフィール・希望・確認）
                </h4>

                <div className="grid grid-cols-[140px_minmax(0,1fr)] gap-3 flex-1">
                  {/* 写真 */}
                  <div>
                    <div className="w-full aspect-[3/4] rounded-2xl bg-slate-800 overflow-hidden flex items-center justify-center text-[11px] text-muted">
                      写真
                    </div>
                  </div>

                  {/* 氏名など */}
                  <div className="space-y-2 text-[13px] pr-1">
                    <MainInfoRow
                      label="ふりがな"
                      value={displayName}
                    />
                    <MainInfoRow label="氏名" value={displayName} />
                    <MainInfoRow label="生年月日" value={birth} />
                    <MainInfoRow label="現住所" value={address} />
                    <MainInfoRow label="TEL" value={phone} />
                    <MainInfoRow label="アドレス" value={email} />
                    {/* ティアラ査定時給 */}
                    <MainInfoRow
                      label="ティアラ査定時給"
                      value={tiaraHourly}
                    />
                    {/* NG店舗（複数登録可） */}
                    <MainInfoRow
                      label="NG店舗（複数登録可）"
                      value={
                        detail?.ngShops
                          ? `${detail.ngShops.length}件登録`
                          : "—"
                      }
                    />

                    {/* ★ シフト情報（直近2日）＋シフト編集ボタン */}
                    <div className="flex flex-col sm:flex-row sm:items-center sm:gap-3">
                      <div className="sm:w-28 text-[12px] text-muted shrink-0">
                        シフト情報（直近2日）
                      </div>
                      <div className="flex-1 min-w-0 flex items-center gap-2">
                        <div className="w-full text-[12px] px-3 py-1.5 rounded-lg bg-slate-950/70 border border-white/10 text-ink/90">
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

              {/* 右上：登録情報②（まだダミー。後続で detail.background を反映） */}
              <section className="bg-slate-900/80 rounded-2xl p-2.5 border border-white/5 text-[11px] space-y-1.5">
                <h4 className="text-[11px] font-semibold mb-1">
                  登録情報②（動機・比較・選定理由）
                </h4>

                <InfoRow
                  label="知った経路"
                  value={detail?.background?.howFound ?? "—"}
                />
                <InfoRow
                  label="紹介者名 / サイト名"
                  value="（今後 detail.background 拡張で対応）"
                />
                <InfoRow
                  label="お仕事を始めるきっかけ"
                  value={detail?.background?.motivation ?? "—"}
                />
                <InfoRow
                  label="他の派遣会社との比較"
                  value="（今後 detail.background 拡張で対応）"
                />
                <InfoRow
                  label="比較状況"
                  value={detail?.background?.otherAgencies ?? "—"}
                />
                <InfoRow
                  label="派遣会社名"
                  value="（今後 detail.background 拡張で対応）"
                />

                <div className="h-px bg-white/5 my-1" />

                <InfoRow
                  label="ティアラを選んだ理由"
                  value={detail?.background?.reasonChoose ?? "—"}
                />
                <InfoRow
                  label="派遣先のお店選びで重要なポイント"
                  value={detail?.background?.shopSelectionPoints ?? "—"}
                />
                <InfoRow label="その他（備考）" value="—" />

                <div className="h-px bg白/5 my-1" />

                <InfoRow
                  label="30,000円到達への所感"
                  value="（今後アンケート項目などで対応）"
                />
              </section>

              {/* 左下：基本情報（プロフィール・希望条件・就業可否） */}
              <section className="bg-slate-900/80 rounded-2xl p-2 border border-white/5 space-y-1.5 text-[11px]">
                <h4 className="text-[11px] font-semibold mb-1">
                  基本情報（プロフィール・希望条件・就業可否）
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <div className="bg-slate-950/40 rounded-xl p-2 border border-white/5">
                    <div className="font-semibold mb-1.5 text-[12px]">
                      プロフィール
                    </div>
                    <InfoRow
                      label="身長"
                      value={
                        detail?.attributes?.heightCm != null
                          ? `${detail.attributes.heightCm} cm`
                          : "—"
                      }
                    />
                    <InfoRow
                      label="服のサイズ"
                      value={detail?.attributes?.clothingSize ?? "—"}
                    />
                    <InfoRow
                      label="靴のサイズ"
                      value={
                        detail?.attributes?.shoeSizeCm != null
                          ? `${detail.attributes.shoeSizeCm} cm`
                          : "—"
                      }
                    />
                  </div>

                  <div className="bg-slate-950/40 rounded-xl p-2 border border-white/5">
                    <div className="font-semibold mb-1.5 text-[12px]">
                      希望条件
                    </div>
                    <InfoRow
                      label="出勤希望"
                      value={
                        detail?.preferences?.preferredDays?.length
                          ? detail.preferences.preferredDays.join(" / ")
                          : "—"
                      }
                    />
                    <InfoRow
                      label="時間帯"
                      value={
                        detail?.preferences?.preferredTimeFrom &&
                        detail.preferences.preferredTimeTo
                          ? `${detail.preferences.preferredTimeFrom}〜${detail.preferences.preferredTimeTo}`
                          : "—"
                      }
                    />
                    <InfoRow
                      label="時給・月給"
                      value={
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
                              .join(" / ") || "—"
                          : "—"
                      }
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <div className="bg-slate-950/40 rounded-xl p-2 border border-white/5">
                    <div className="font-semibold mb-1.5 text-[12px]">
                      就業可否
                    </div>
                    <InfoRow
                      label="タトゥー"
                      value={
                        detail?.attributes?.tattoo == null
                          ? "—"
                          : detail.attributes.tattoo
                          ? "有"
                          : "無"
                      }
                    />
                    <InfoRow
                      label="送迎の要否"
                      value={
                        detail?.attributes?.needPickup == null
                          ? "—"
                          : detail.attributes.needPickup
                          ? "要"
                          : "不要"
                      }
                    />
                    <InfoRow
                      label="飲酒"
                      value={
                        detail?.attributes?.drinkLevel ??
                        (detail?.drinkOk == null
                          ? "—"
                          : detail.drinkOk
                          ? "普通"
                          : "NG")
                      }
                    />
                  </div>

                  <div className="bg-slate-950/40 rounded-xl p-2 border border-white/5">
                    {/* タイトル変更済み */}
                    <div className="font-semibold mb-1.5 text-[12px]">
                      水商売の経験
                    </div>
                    <InfoRow
                      label="経験"
                      value={
                        detail?.hasExperience == null
                          ? "—"
                          : detail.hasExperience
                          ? "あり"
                          : "なし"
                      }
                    />
                    <InfoRow label="勤務歴" value="—" />
                  </div>
                </div>
              </section>

              {/* 右下：身分証＋備考（現時点はダミー） */}
              <section className="bg-slate-900/80 rounded-2xl p-2 border border-white/5 text-[11px] space-y-1.5">
                <h4 className="text-[11px] font-semibold">
                  身分証明書確認 / 申告・備考
                </h4>

                <div className="grid grid-cols-1 gap-1.5">
                  <div className="bg-slate-950/40 rounded-xl p-2 border border-white/5 space-y-1">
                    <InfoRow label="身分証種類" value="運転免許証" />
                    <InfoRow label="住民票・郵便物" value="◯" />
                    <InfoRow
                      label="宣誓（身分証のない・更新時）"
                      value="◯"
                    />
                  </div>

                  <div className="bg-slate-950/40 rounded-xl p-2 border border白/5">
                    <InfoRow label="備考" value="特記事項なし" />
                  </div>
                </div>
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
    </>
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
    <div className="fixed inset-0 z-[120] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative z-10 w-[94vw] max-w-4xl max-h-[82vh] bg-slate-950 rounded-2xl border border-white/15 shadow-2xl p-4 flex flex-col">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h4 className="text-sm font-semibold">シフト編集（{castName}）</h4>
            <p className="text-[11px] text-muted">
              キャストアプリから連携されたシフト情報を月ごとに確認・調整します。
            </p>
          </div>
          <button
            className="px-3 py-1 rounded-lg text-[11px] border border-white/20 bg-red-500/80 text-white"
            onClick={onClose}
          >
            閉じる
          </button>
        </div>

        {/* 月切り替え */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <button
              className="px-2 py-1 rounded-md border border-white/15 text-[11px]"
              onClick={prevMonth}
            >
              ← 前月
            </button>
            <span className="text-[13px] font-semibold">{monthLabel}</span>
            <button
              className="px-2 py-1 rounded-md border border白/15 text-[11px]"
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
        <div className="flex-1 overflow-auto rounded-xl border border白/10 bg-slate-950/80">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="bg-slate-900/80">
                {["日", "月", "火", "水", "木", "金", "土"].map((w) => (
                  <th key={w} className="py-1 border-b border白/10">
                    {w}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 6 }).map((_, rowIdx) => (
                <tr key={rowIdx} className="border-t border白/5">
                  {days.slice(rowIdx * 7, rowIdx * 7 + 7).map((d, i) => {
                    const dayNum = d.date.getDate();
                    const isToday =
                      d.date.toDateString() === now.toDateString();
                    return (
                      <td
                        key={i}
                        className={`align-top h-20 px-1.5 py-1 border-l border白/5 ${
                          d.inCurrentMonth ? "" : "opacity-40"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span
                            className={`text-[10px] ${
                              isToday ? "text-emerald-300 font-semibold" : ""
                            }`}
                          >
                            {dayNum}
                          </span>
                          {/* ここに将来 slot（free/21:00 等）をバッジ表示 */}
                          <span className="text-[9px] px-1 py-0.5 rounded bg-slate-800/80 border border白/10">
                            -
                          </span>
                        </div>
                        <div className="text-[10px] text-muted">
                          {/* 編集UIは今後実装。現状はプレースホルダ */}
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
          <button className="px-3 py-1 rounded-lg border border白/20 bg-white/5">
            変更を破棄
          </button>
          <button className="px-3 py-1 rounded-lg border border-emerald-400/60 bg-emerald-500/80 text白">
            保存して閉じる
          </button>
        </div>
      </div>
    </div>
  );
}

/** 登録情報①用：文字を大きくしてメイン情報を強調する行（編集可） */
function MainInfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:gap-3">
      <div className="sm:w-32 text-[12px] text-muted shrink-0">{label}</div>
      <div className="flex-1 min-w-0">
        <input
          type="text"
          defaultValue={value}
          className="w-full text-[13px] px-3 py-1.5 rounded-lg bg-slate-950/70 border border白/10 text-ink/95 outline-none focus:border-accent focus:ring-1 focus:ring-accent/60"
        />
      </div>
    </div>
  );
}

/** ラベル＋値（1行）の小さい行パーツ（サブ情報用・編集可） */
function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:gap-2 mb-1">
      <div className="sm:w-32 text-[11px] text-muted shrink-0">{label}</div>
      <div className="flex-1 min-w-0">
        <input
          type="text"
          defaultValue={value}
          className="w-full text-[11px] px-2 py-1.5 rounded-lg bg-slate-950/60 border border白/5 text-ink/90 outline-none focus:border-accent focus:ring-1 focus:ring-accent/60"
        />
      </div>
    </div>
  );
}
