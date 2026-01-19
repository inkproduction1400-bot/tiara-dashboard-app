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
  return (
    <div className="tiara-modal-backdrop">
      <div className="tiara-modal">
        <div className="tiara-modal__head">
          <div>
            <h3 className="text-base font-semibold">面談申請 詳細</h3>
            <p className="text-xs text-muted mt-1">
              申請ID: {detail.id}
            </p>
          </div>
          <button
            className="tiara-btn tiara-btn--ghost h-9"
            onClick={onClose}
          >
            閉じる
          </button>
        </div>

        {error && (
          <div className="mt-3 text-xs text-red-600">{error}</div>
        )}

        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <div className="text-xs text-muted">名前</div>
            <div className="tiara-input h-9 flex items-center text-sm">
              {detail.fullName ?? "未設定"}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted">フリガナ</div>
            <div className="tiara-input h-9 flex items-center text-sm">
              {detail.furigana ?? "未設定"}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted">生年月日</div>
            <div className="tiara-input h-9 flex items-center text-sm">
              {formatDate(detail.birthdate) || "未設定"}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted">年齢</div>
            <div className="tiara-input h-9 flex items-center text-sm">
              {calcAge(detail.age, detail.birthdate) ?? "未設定"}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted">電話</div>
            <div className="tiara-input h-9 flex items-center text-sm">
              {detail.phone ?? "未設定"}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted">メール</div>
            <div className="tiara-input h-9 flex items-center text-sm">
              {detail.email ?? "未設定"}
            </div>
          </div>
          <div className="md:col-span-2">
            <div className="text-xs text-muted">住所</div>
            <div className="tiara-input h-9 flex items-center text-sm">
              {detail.address ?? "未設定"}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted">面談希望日</div>
            <div className="tiara-input h-9 flex items-center text-sm">
              {formatDate(interviewDate) || "未設定"}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted">希望エリア</div>
            <div className="tiara-input h-9 flex items-center text-sm">
              {detail.desiredArea ?? "未設定"}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted">飲酒可</div>
            <div className="tiara-input h-9 flex items-center text-sm">
              {detail.drinkOk == null ? "未設定" : detail.drinkOk ? "OK" : "NG"}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted">ジャンル</div>
            <div className="tiara-input h-9 flex items-center text-sm">
              {detail.genres?.length ? detail.genres.join(" / ") : "未設定"}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted">希望時給</div>
            <div className="tiara-input h-9 flex items-center text-sm">
              {detail.hourlyExpectation != null
                ? `${detail.hourlyExpectation}円`
                : "未設定"}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted">身長</div>
            <div className="tiara-input h-9 flex items-center text-sm">
              {detail.heightCm != null ? `${detail.heightCm}cm` : "未設定"}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted">服サイズ</div>
            <div className="tiara-input h-9 flex items-center text-sm">
              {detail.clothingSize ?? "未設定"}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted">靴サイズ</div>
            <div className="tiara-input h-9 flex items-center text-sm">
              {detail.shoeSizeCm != null ? `${detail.shoeSizeCm}cm` : "未設定"}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted">タトゥー</div>
            <div className="tiara-input h-9 flex items-center text-sm">
              {detail.tattoo == null ? "未設定" : detail.tattoo ? "有" : "無"}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted">送迎</div>
            <div className="tiara-input h-9 flex items-center text-sm">
              {detail.needPickup == null
                ? "未設定"
                : detail.needPickup
                  ? "要"
                  : "不要"}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted">飲酒レベル</div>
            <div className="tiara-input h-9 flex items-center text-sm">
              {detail.drinkLevel ?? "未設定"}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted">希望出勤日</div>
            <div className="tiara-input h-9 flex items-center text-sm">
              {detail.preferredDays?.length
                ? detail.preferredDays.join(" / ")
                : "未設定"}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted">希望時間</div>
            <div className="tiara-input h-9 flex items-center text-sm">
              {(detail.preferredTimeFrom || detail.preferredTimeTo)
                ? `${detail.preferredTimeFrom ?? ""}〜${detail.preferredTimeTo ?? ""}`
                : "未設定"}
            </div>
          </div>
          <div className="md:col-span-2">
            <div className="text-xs text-muted">面談メモ</div>
            <div className="tiara-input min-h-[70px] text-sm py-2">
              {detail.interviewNotes ?? "未設定"}
            </div>
          </div>
          <div className="md:col-span-2">
            <div className="text-xs text-muted">職歴</div>
            <div className="tiara-input min-h-[70px] text-sm py-2">
              {detail.workHistories?.length
                ? detail.workHistories
                    .map((w) =>
                      w.hourlyWage
                        ? `${w.shopName}（${w.hourlyWage}円）`
                        : w.shopName
                    )
                    .join(" / ")
                : "未設定"}
            </div>
          </div>
          <div className="md:col-span-2">
            <div className="text-xs text-muted">NG店舗</div>
            <div className="tiara-input min-h-[70px] text-sm py-2">
              {detail.ngShops?.length
                ? detail.ngShops.map((n) => n.shopName).join(" / ")
                : "未設定"}
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            className="tiara-btn tiara-btn--ghost h-9"
            onClick={onClose}
          >
            キャンセル
          </button>
          {detail.status !== "approved" && (
            <button
              className="tiara-btn h-9"
              onClick={onApprove}
              disabled={approving}
            >
              {approving ? "承認中..." : "承認してキャスト化"}
            </button>
          )}
        </div>
      </div>
      <style jsx global>{`
        .tiara-modal-backdrop {
          position: fixed;
          inset: 0;
          z-index: 60;
          background: rgba(0, 0, 0, 0.6);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 12px;
        }
        .tiara-modal {
          width: min(980px, 96vw);
          max-height: 86vh;
          overflow: auto;
          background: #fff;
          border-radius: 16px;
          border: 1px solid rgba(0, 0, 0, 0.25);
          box-shadow: 0 20px 70px rgba(0, 0, 0, 0.35);
          display: flex;
          flex-direction: column;
          padding: 16px;
        }
        .tiara-modal__head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
        }
        .tiara-btn--ghost {
          background: #fff;
          color: #2b78e4;
        }
        .tiara-input {
          background: #fff;
          border-radius: 10px;
          border: 1px solid rgba(0, 0, 0, 0.15);
          padding: 0 10px;
        }
      `}</style>
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

        <div className="tiara-table-wrap">
          <table className="tiara-table">
            <thead>
              <tr>
                <th>名前</th>
                <th>年齢</th>
                <th>住所</th>
                <th>面談希望日</th>
              </tr>
            </thead>
            <tbody>
              {list.map((row) => (
                <tr
                  key={row.id}
                  className="cursor-pointer hover:bg-slate-50"
                  onClick={() => handleOpen(row.id)}
                >
                  <td>{row.fullName ?? "未設定"}</td>
                  <td>{row.age ?? "未設定"}</td>
                  <td>{row.address ?? "未設定"}</td>
                  <td>{formatDate(row.interviewDate) || "未設定"}</td>
                </tr>
              ))}
              {!list.length && !loading && (
                <tr>
                  <td colSpan={4} className="text-center text-xs text-muted">
                    表示する申請がありません
                  </td>
                </tr>
              )}
            </tbody>
          </table>
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
