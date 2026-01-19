"use client";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import AppShell from "@/components/AppShell";
import {
  approveApplication,
  getApplication,
  listApplications,
  type ApplicationDetail,
  type ApplicationListItem,
  type ApplicationStatus,
} from "@/lib/api.applications";

function formatDate(value?: string | null) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 10);
  return d.toISOString().slice(0, 10);
}

function calcAge(age: number | null | undefined, birthdate?: string | null) {
  if (typeof age === "number") return age;
  if (!birthdate) return null;
  const d = new Date(birthdate);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  let v = today.getFullYear() - d.getFullYear();
  const m = today.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < d.getDate())) v -= 1;
  return v;
}

function ModalPortal({ children }: { children: ReactNode }) {
  if (typeof document === "undefined") return null;
  return createPortal(children, document.body);
}

type DetailModalProps = {
  detail: ApplicationDetail;
  onClose: () => void;
  onApprove: () => Promise<void>;
  approving: boolean;
  error?: string | null;
};

function ApplicationDetailModal({
  detail,
  onClose,
  onApprove,
  approving,
  error,
}: DetailModalProps) {
  const interviewDate =
    detail.registeredAt ?? detail.receivedAt ?? null;
  const age = calcAge(detail.age, detail.birthdate);
  const name = detail.fullName ?? "未設定";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-3 py-6">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative z-10 w-full max-w-7xl max-h-[92vh] bg-white rounded-2xl shadow-2xl border border-gray-300 overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-5 py-1.5 border-b border-gray-200 bg-gray-50">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-semibold">面談申請詳細（{name}）</h3>
            {error && <span className="text-[10px] text-red-500">{error}</span>}
          </div>
          <div className="flex items-center gap-2">
            {detail.status !== "approved" && (
              <button
                className="px-3 py-1 rounded-xl text-[11px] border border-emerald-400/60 bg-emerald-500/80 text-white disabled:opacity-60 disabled:cursor-not-allowed bg-[#49c69b]"
                onClick={onApprove}
                disabled={approving}
              >
                {approving ? "承認中…" : "承認してキャスト化"}
              </button>
            )}
            <button
              className="px-3 py-1 rounded-xl text-[11px] border border-red-400/80 bg-red-500/80 text-white bg-[#f16d6d]"
              onClick={onClose}
            >
              終了
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          <div className="border-b border-black/30">
            <div className="grid grid-cols-1 xl:grid-cols-2">
              <div className="bg-[#efe2dd] p-4 border-r border-black/40">
                <div className="inline-flex items-center px-3 py-1 text-xs font-semibold bg-white/90 border border-black/40 rounded">
                  登録情報①
                </div>
                <div className="mt-4 grid grid-cols-[120px_minmax(0,1fr)] items-center gap-2">
                  <div className="text-xs text-ink font-semibold">ふりがな</div>
                  <div className="w-full h-8 bg-white border border-black/40 px-2 text-sm flex items-center">
                    {detail.furigana ?? "未設定"}
                  </div>
                  <div className="text-xs text-ink font-semibold">氏名</div>
                  <div className="w-full h-8 bg-white border border-black/40 px-2 text-sm flex items-center">
                    {name}
                  </div>
                  <div className="text-xs text-ink font-semibold">生年月日</div>
                  <div className="flex items-center gap-2">
                    <div className="w-full h-8 bg-white border border-black/40 px-2 text-sm flex items-center">
                      {formatDate(detail.birthdate) || "未設定"}
                    </div>
                    <div className="h-8 px-2 bg-white border border-black/40 flex items-center justify-center">
                      <div className="text-sm font-bold text-neutral-900 tabular-nums">
                        {age ?? "-"}
                      </div>
                    </div>
                    <div className="text-xs text-ink font-semibold">歳</div>
                  </div>
                  <div className="text-xs text-ink font-semibold">現住所</div>
                  <div className="w-full h-8 bg-white border border-black/40 px-2 text-sm flex items-center">
                    {detail.address ?? "未設定"}
                  </div>
                  <div className="text-xs text-ink font-semibold">TEL</div>
                  <div className="w-full h-8 bg-white border border-black/40 px-2 text-sm flex items-center">
                    {detail.phone ?? "未設定"}
                  </div>
                  <div className="text-xs text-ink font-semibold">アドレス</div>
                  <div className="w-full h-8 bg-white border border-black/40 px-2 text-sm flex items-center">
                    {detail.email ?? "未設定"}
                  </div>
                  <div className="text-xs text-ink font-semibold">面談希望日</div>
                  <div className="w-full h-8 bg-white border border-black/40 px-2 text-sm flex items-center">
                    {formatDate(interviewDate) || "未設定"}
                  </div>
                  <div className="text-xs text-ink font-semibold">希望エリア</div>
                  <div className="w-full h-8 bg-white border border-black/40 px-2 text-sm flex items-center">
                    {detail.desiredArea ?? "未設定"}
                  </div>
                </div>
              </div>

              <div className="bg-[#efe2dd] p-4">
                <div className="inline-flex items-center px-3 py-1 text-xs font-semibold bg-white/90 border border-black/40 rounded">
                  登録情報②
                </div>
                <div className="mt-4 grid grid-cols-[120px_minmax(0,1fr)] items-center gap-2">
                  <div className="text-xs text-ink font-semibold">飲酒</div>
                  <div className="w-full h-8 bg-white border border-black/40 px-2 text-sm flex items-center">
                    {detail.drinkOk == null ? "未設定" : detail.drinkOk ? "OK" : "NG"}
                  </div>
                  <div className="text-xs text-ink font-semibold">飲酒レベル</div>
                  <div className="w-full h-8 bg-white border border-black/40 px-2 text-sm flex items-center">
                    {detail.drinkLevel ?? "未設定"}
                  </div>
                  <div className="text-xs text-ink font-semibold">ジャンル</div>
                  <div className="w-full h-8 bg-white border border-black/40 px-2 text-sm flex items-center">
                    {detail.genres?.length ? detail.genres.join(" / ") : "未設定"}
                  </div>
                  <div className="text-xs text-ink font-semibold">希望時給</div>
                  <div className="w-full h-8 bg-white border border-black/40 px-2 text-sm flex items-center">
                    {detail.hourlyExpectation != null
                      ? `${detail.hourlyExpectation}円`
                      : "未設定"}
                  </div>
                  <div className="text-xs text-ink font-semibold">身長</div>
                  <div className="w-full h-8 bg-white border border-black/40 px-2 text-sm flex items-center">
                    {detail.heightCm != null ? `${detail.heightCm}cm` : "未設定"}
                  </div>
                  <div className="text-xs text-ink font-semibold">服サイズ</div>
                  <div className="w-full h-8 bg-white border border-black/40 px-2 text-sm flex items-center">
                    {detail.clothingSize ?? "未設定"}
                  </div>
                  <div className="text-xs text-ink font-semibold">靴サイズ</div>
                  <div className="w-full h-8 bg-white border border-black/40 px-2 text-sm flex items-center">
                    {detail.shoeSizeCm != null ? `${detail.shoeSizeCm}cm` : "未設定"}
                  </div>
                  <div className="text-xs text-ink font-semibold">タトゥー</div>
                  <div className="w-full h-8 bg-white border border-black/40 px-2 text-sm flex items-center">
                    {detail.tattoo == null ? "未設定" : detail.tattoo ? "有" : "無"}
                  </div>
                  <div className="text-xs text-ink font-semibold">送迎</div>
                  <div className="w-full h-8 bg-white border border-black/40 px-2 text-sm flex items-center">
                    {detail.needPickup == null ? "未設定" : detail.needPickup ? "要" : "不要"}
                  </div>
                  <div className="text-xs text-ink font-semibold">希望出勤日</div>
                  <div className="w-full h-8 bg-white border border-black/40 px-2 text-sm flex items-center">
                    {detail.preferredDays?.length ? detail.preferredDays.join(" / ") : "未設定"}
                  </div>
                  <div className="text-xs text-ink font-semibold">希望時間</div>
                  <div className="w-full h-8 bg-white border border-black/40 px-2 text-sm flex items-center">
                    {(detail.preferredTimeFrom || detail.preferredTimeTo)
                      ? `${detail.preferredTimeFrom ?? ""}〜${detail.preferredTimeTo ?? ""}`
                      : "未設定"}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-[#f6efe9] p-4 border-b border-black/30">
            <div className="inline-flex items-center px-3 py-1 text-xs font-semibold bg-white/90 border border-black/40 rounded">
              その他
            </div>
            <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-ink font-semibold">面談メモ</div>
                <div className="min-h-[70px] bg-white border border-black/40 px-2 py-2 text-sm">
                  {detail.interviewNotes ?? "未設定"}
                </div>
              </div>
              <div>
                <div className="text-xs text-ink font-semibold">職歴</div>
                <div className="min-h-[70px] bg-white border border-black/40 px-2 py-2 text-sm">
                  {detail.workHistories?.length
                    ? detail.workHistories
                        .map((w) =>
                          w.hourlyWage ? `${w.shopName}（${w.hourlyWage}円）` : w.shopName,
                        )
                        .join(" / ")
                    : "未設定"}
                </div>
              </div>
              <div className="lg:col-span-2">
                <div className="text-xs text-ink font-semibold">NG店舗</div>
                <div className="min-h-[70px] bg-white border border-black/40 px-2 py-2 text-sm">
                  {detail.ngShops?.length
                    ? detail.ngShops.map((n) => n.shopName).join(" / ")
                    : "未設定"}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Page() {
  const [items, setItems] = useState<ApplicationListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<ApplicationDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailErr, setDetailErr] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);
  const [statusFilter, setStatusFilter] = useState<ApplicationStatus>("pending");

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await listApplications({ status: statusFilter, take: 200 });
      setItems(res);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "一覧取得に失敗しました。");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const list = useMemo(() => {
    return items.map((row) => {
      const age = calcAge(row.age, row.birthdate);
      const interviewDate = row.registeredAt ?? row.receivedAt ?? null;
      return { ...row, age, interviewDate };
    });
  }, [items]);

  const handleOpen = async (id: string) => {
    setDetailLoading(true);
    setDetailErr(null);
    try {
      const detail = await getApplication(id);
      setSelected(detail);
    } catch (e) {
      setDetailErr(e instanceof Error ? e.message : "詳細取得に失敗しました。");
    } finally {
      setDetailLoading(false);
    }
  };

  const handleApprove = async () => {
    if (!selected) return;
    setApproving(true);
    try {
      await approveApplication(selected.id);
      setSelected(null);
      setItems((prev) => prev.filter((row) => row.id !== selected.id));
    } catch (e) {
      setDetailErr(e instanceof Error ? e.message : "承認に失敗しました。");
    } finally {
      setApproving(false);
    }
  };

  return (
    <AppShell>
      <section className="tiara-panel grow p-4 h-full flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-bold">申請・承認</h2>
          <div className="flex items-center gap-2">
            <select
              className="tiara-input h-9 text-xs"
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as ApplicationStatus)
              }
            >
              <option value="pending">未承認</option>
              <option value="approved">承認済み</option>
              <option value="rejected">却下</option>
            </select>
            <button
              className="tiara-btn h-9 px-4 text-xs"
              onClick={load}
              disabled={loading}
            >
              {loading ? "読み込み中..." : "再読み込み"}
            </button>
          </div>
        </div>

        {err && <div className="text-xs text-red-600">{err}</div>}

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
          {list.map((row) => (
            <button
              key={row.id}
              className="text-left bg-white border border-slate-200 rounded-2xl shadow-sm px-4 py-3 hover:shadow-md transition"
              onClick={() => handleOpen(row.id)}
            >
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-slate-900">
                  {row.fullName ?? "未設定"}
                </div>
                <div className="text-xs text-slate-500">
                  {formatDate(row.interviewDate) || "未設定"}
                </div>
              </div>
              <div className="mt-1 text-xs text-slate-500">
                年齢: {row.age ?? "未設定"} / 住所: {row.address ?? "未設定"}
              </div>
              <div className="mt-2 inline-flex items-center gap-2 text-[11px] text-slate-500">
                申請ID: {row.id}
              </div>
            </button>
          ))}
          {!list.length && !loading && (
            <div className="col-span-full text-center text-xs text-muted py-10">
              表示する申請がありません
            </div>
          )}
        </div>

        {detailLoading && (
          <div className="text-xs text-muted">詳細を取得中...</div>
        )}
      </section>

      {selected && (
        <ModalPortal>
          <ApplicationDetailModal
            detail={selected}
            onClose={() => setSelected(null)}
            onApprove={handleApprove}
            approving={approving}
            error={detailErr}
          />
        </ModalPortal>
      )}
    </AppShell>
  );
}
