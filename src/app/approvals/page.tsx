"use client";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import AppShell from "@/components/AppShell";
import {
  approveApplication,
  getApplication,
  listApplications,
  updateApplicationForm,
  type ApplicationDetail,
  type ApplicationListItem,
  type ApplicationStatus,
  type UpdateApplicationFormInput,
} from "@/lib/api.applications";
import {
  uploadCastIdDocWithFace,
  uploadCastIdDocWithoutFace,
  uploadCastProfilePhoto,
} from "@/lib/api.casts";

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

function splitToArray(value: string) {
  return value
    .split(/[\\s,/]+/g)
    .map((v) => v.trim())
    .filter(Boolean);
}

function toNumber(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const num = Number(trimmed);
  if (Number.isNaN(num)) return undefined;
  return num;
}

function ModalPortal({ children }: { children: ReactNode }) {
  if (typeof document === "undefined") return null;
  return createPortal(children, document.body);
}

type ApprovalUploadFiles = {
  profileFile: File | null;
  idWithFaceFile: File | null;
  idWithoutFaceFile: File | null;
};

type DetailModalProps = {
  detail: ApplicationDetail;
  onClose: () => void;
  onApprove: (
    payload: UpdateApplicationFormInput,
    files: ApprovalUploadFiles
  ) => Promise<void>;
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
  const [form, setForm] = useState<ApplicationDetail>(detail);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveDone, setSaveDone] = useState(false);

  const [profileFile, setProfileFile] = useState<File | null>(null);
  const [idWithFaceFile, setIdWithFaceFile] = useState<File | null>(null);
  const [idWithoutFaceFile, setIdWithoutFaceFile] = useState<File | null>(null);

  const [profilePreview, setProfilePreview] = useState<string | null>(null);
  const [idWithFacePreview, setIdWithFacePreview] = useState<string | null>(null);
  const [idWithoutFacePreview, setIdWithoutFacePreview] = useState<string | null>(null);

  useEffect(() => {
    setForm(detail);
    setSaveDone(false);
    setSaveError(null);
    setProfileFile(null);
    setIdWithFaceFile(null);
    setIdWithoutFaceFile(null);
    setProfilePreview(null);
    setIdWithFacePreview(null);
    setIdWithoutFacePreview(null);
  }, [detail]);

  useEffect(() => {
    if (!profileFile) return;
    const url = URL.createObjectURL(profileFile);
    setProfilePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [profileFile]);

  useEffect(() => {
    if (!idWithFaceFile) return;
    const url = URL.createObjectURL(idWithFaceFile);
    setIdWithFacePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [idWithFaceFile]);

  useEffect(() => {
    if (!idWithoutFaceFile) return;
    const url = URL.createObjectURL(idWithoutFaceFile);
    setIdWithoutFacePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [idWithoutFaceFile]);

  const interviewDate = form.registeredAt ?? form.receivedAt ?? null;
  const age = calcAge(form.age, form.birthdate);
  const name = form.fullName ?? "未設定";

  const buildPayload = (): UpdateApplicationFormInput => ({
    fullName: form.fullName ?? undefined,
    furigana: form.furigana ?? undefined,
    birthdate: form.birthdate ?? undefined,
    age: typeof form.age === "number" ? form.age : undefined,
    phone: form.phone ?? undefined,
    email: form.email ?? undefined,
    desiredArea: form.desiredArea ?? undefined,
    drinkOk: typeof form.drinkOk === "boolean" ? form.drinkOk : undefined,
    genres: form.genres?.length ? form.genres : undefined,
    hourlyExpectation:
      typeof form.hourlyExpectation === "number"
        ? form.hourlyExpectation
        : undefined,
    registeredAt: form.registeredAt ?? undefined,
    address: form.address ?? undefined,
    heightCm: typeof form.heightCm === "number" ? form.heightCm : undefined,
    clothingSize: form.clothingSize ?? undefined,
    shoeSizeCm:
      typeof form.shoeSizeCm === "number" ? form.shoeSizeCm : undefined,
    preferredDays: form.preferredDays?.length ? form.preferredDays : undefined,
    preferredTimeFrom: form.preferredTimeFrom ?? undefined,
    preferredTimeTo: form.preferredTimeTo ?? undefined,
    desiredMonthly:
      typeof form.desiredMonthly === "number" ? form.desiredMonthly : undefined,
    tattoo: typeof form.tattoo === "boolean" ? form.tattoo : undefined,
    needPickup:
      typeof form.needPickup === "boolean" ? form.needPickup : undefined,
    drinkLevel: form.drinkLevel ?? undefined,
    howFound: form.howFound ?? undefined,
    motivation: form.motivation ?? undefined,
    competitorCount: form.competitorCount ?? undefined,
    reasonChoose: form.reasonChoose ?? undefined,
    shopSelectionPoints: form.shopSelectionPoints ?? undefined,
    otherNotes: form.otherNotes ?? undefined,
  });

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    setSaveDone(false);
    try {
      const payload = buildPayload();
      await updateApplicationForm(detail.id, payload);
      setSaveDone(true);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  const handleApprove = async () => {
    const payload = buildPayload();
    await onApprove(payload, {
      profileFile,
      idWithFaceFile,
      idWithoutFaceFile,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-3 py-6">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative z-10 w-full max-w-7xl max-h-[92vh] bg-white rounded-2xl shadow-2xl border border-gray-300 overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-5 py-1.5 border-b border-gray-200 bg-gray-50">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-semibold">面談申請詳細（{name}）</h3>
            {error && <span className="text-[10px] text-red-500">{error}</span>}
            {saveDone && !saveError && (
              <span className="text-[10px] text-emerald-600">保存しました</span>
            )}
            {saveError && (
              <span className="text-[10px] text-red-500">{saveError}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              className="px-3 py-1 rounded-xl text-[11px] border border-gray-300 bg-gray-50 disabled:opacity-60"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? "保存中…" : "保存"}
            </button>
            {detail.status !== "approved" && (
              <button
                className="px-3 py-1 rounded-xl text-[11px] border border-emerald-400/60 bg-emerald-500/80 text-white disabled:opacity-60 disabled:cursor-not-allowed bg-[#49c69b]"
                onClick={handleApprove}
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
                  <div className="text-xs text-ink font-semibold">プロフィール写真</div>
                  <div className="flex items-center gap-3">
                    <div className="w-20 h-20 rounded-lg border border-black/30 bg-white overflow-hidden flex items-center justify-center">
                      {profilePreview ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={profilePreview} alt="profile" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-[11px] text-muted">未設定</span>
                      )}
                    </div>
                    <label className="px-3 py-1.5 rounded-md bg-[#2b78e4] text-white border border-black/40 text-xs cursor-pointer">
                      アップロード＋
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0] ?? null;
                          e.currentTarget.value = "";
                          setProfileFile(file);
                        }}
                      />
                    </label>
                  </div>

                  <div className="text-xs text-ink font-semibold">ふりがな</div>
                  <input
                    className="w-full h-8 bg-white border border-black/40 px-2 text-sm"
                    value={form.furigana ?? ""}
                    onChange={(e) => setForm((p) => ({ ...p, furigana: e.target.value }))}
                  />
                  <div className="text-xs text-ink font-semibold">氏名</div>
                  <input
                    className="w-full h-8 bg-white border border-black/40 px-2 text-sm"
                    value={form.fullName ?? ""}
                    onChange={(e) => setForm((p) => ({ ...p, fullName: e.target.value }))}
                  />
                  <div className="text-xs text-ink font-semibold">生年月日</div>
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      className="w-full h-8 bg-white border border-black/40 px-2 text-sm"
                      value={formatDate(form.birthdate) || ""}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, birthdate: e.target.value || null }))
                      }
                    />
                    <div className="h-8 px-2 bg-white border border-black/40 flex items-center justify-center">
                      <div className="text-sm font-bold text-neutral-900 tabular-nums">
                        {age ?? "-"}
                      </div>
                    </div>
                    <div className="text-xs text-ink font-semibold">歳</div>
                  </div>
                  <div className="text-xs text-ink font-semibold">現住所</div>
                  <input
                    className="w-full h-8 bg-white border border-black/40 px-2 text-sm"
                    value={form.address ?? ""}
                    onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
                  />
                  <div className="text-xs text-ink font-semibold">TEL</div>
                  <input
                    className="w-full h-8 bg-white border border-black/40 px-2 text-sm"
                    value={form.phone ?? ""}
                    onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                  />
                  <div className="text-xs text-ink font-semibold">アドレス</div>
                  <input
                    className="w-full h-8 bg-white border border-black/40 px-2 text-sm"
                    value={form.email ?? ""}
                    onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                  />
                  <div className="text-xs text-ink font-semibold">面談希望日</div>
                  <input
                    type="date"
                    className="w-full h-8 bg-white border border-black/40 px-2 text-sm"
                    value={formatDate(interviewDate) || ""}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, registeredAt: e.target.value || null }))
                    }
                  />
                  <div className="text-xs text-ink font-semibold">希望エリア</div>
                  <input
                    className="w-full h-8 bg-white border border-black/40 px-2 text-sm"
                    value={form.desiredArea ?? ""}
                    onChange={(e) => setForm((p) => ({ ...p, desiredArea: e.target.value }))}
                  />
                </div>
              </div>

              <div className="bg-[#efe2dd] p-4">
                <div className="inline-flex items-center px-3 py-1 text-xs font-semibold bg-white/90 border border-black/40 rounded">
                  登録情報②
                </div>
                <div className="mt-4 grid grid-cols-[120px_minmax(0,1fr)] items-center gap-2">
                  <div className="text-xs text-ink font-semibold">飲酒</div>
                  <select
                    className="w-full h-8 bg-white border border-black/40 px-2 text-sm"
                    value={
                      form.drinkOk == null ? "" : form.drinkOk ? "ok" : "ng"
                    }
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        drinkOk:
                          e.target.value === ""
                            ? null
                            : e.target.value === "ok",
                      }))
                    }
                  >
                    <option value="">未設定</option>
                    <option value="ok">OK</option>
                    <option value="ng">NG</option>
                  </select>
                  <div className="text-xs text-ink font-semibold">飲酒レベル</div>
                  <select
                    className="w-full h-8 bg-white border border-black/40 px-2 text-sm"
                    value={form.drinkLevel ?? ""}
                    onChange={(e) => setForm((p) => ({ ...p, drinkLevel: e.target.value }))}
                  >
                    <option value="">未設定</option>
                    <option value="ng">NG</option>
                    <option value="weak">弱い</option>
                    <option value="normal">普通</option>
                    <option value="strong">強い</option>
                  </select>
                  <div className="text-xs text-ink font-semibold">ジャンル</div>
                  <input
                    className="w-full h-8 bg-white border border-black/40 px-2 text-sm"
                    value={form.genres?.join(" / ") ?? ""}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, genres: splitToArray(e.target.value) }))
                    }
                  />
                  <div className="text-xs text-ink font-semibold">希望時給</div>
                  <input
                    type="number"
                    className="w-full h-8 bg-white border border-black/40 px-2 text-sm"
                    value={form.hourlyExpectation ?? ""}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        hourlyExpectation: toNumber(e.target.value) ?? null,
                      }))
                    }
                  />
                  <div className="text-xs text-ink font-semibold">身長</div>
                  <input
                    type="number"
                    className="w-full h-8 bg-white border border-black/40 px-2 text-sm"
                    value={form.heightCm ?? ""}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        heightCm: toNumber(e.target.value) ?? null,
                      }))
                    }
                  />
                  <div className="text-xs text-ink font-semibold">服サイズ</div>
                  <input
                    className="w-full h-8 bg-white border border-black/40 px-2 text-sm"
                    value={form.clothingSize ?? ""}
                    onChange={(e) => setForm((p) => ({ ...p, clothingSize: e.target.value }))}
                  />
                  <div className="text-xs text-ink font-semibold">靴サイズ</div>
                  <input
                    type="number"
                    className="w-full h-8 bg-white border border-black/40 px-2 text-sm"
                    value={form.shoeSizeCm ?? ""}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        shoeSizeCm: toNumber(e.target.value) ?? null,
                      }))
                    }
                  />
                  <div className="text-xs text-ink font-semibold">タトゥー</div>
                  <select
                    className="w-full h-8 bg-white border border-black/40 px-2 text-sm"
                    value={
                      form.tattoo == null ? "" : form.tattoo ? "yes" : "no"
                    }
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        tattoo:
                          e.target.value === ""
                            ? null
                            : e.target.value === "yes",
                      }))
                    }
                  >
                    <option value="">未設定</option>
                    <option value="yes">有</option>
                    <option value="no">無</option>
                  </select>
                  <div className="text-xs text-ink font-semibold">送迎</div>
                  <select
                    className="w-full h-8 bg-white border border-black/40 px-2 text-sm"
                    value={
                      form.needPickup == null
                        ? ""
                        : form.needPickup
                          ? "yes"
                          : "no"
                    }
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        needPickup:
                          e.target.value === ""
                            ? null
                            : e.target.value === "yes",
                      }))
                    }
                  >
                    <option value="">未設定</option>
                    <option value="yes">要</option>
                    <option value="no">不要</option>
                  </select>
                  <div className="text-xs text-ink font-semibold">希望出勤日</div>
                  <input
                    className="w-full h-8 bg-white border border-black/40 px-2 text-sm"
                    value={form.preferredDays?.join(" / ") ?? ""}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        preferredDays: splitToArray(e.target.value),
                      }))
                    }
                  />
                  <div className="text-xs text-ink font-semibold">希望時間</div>
                  <div className="flex items-center gap-2">
                    <input
                      className="w-full h-8 bg-white border border-black/40 px-2 text-sm"
                      placeholder="開始"
                      value={form.preferredTimeFrom ?? ""}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, preferredTimeFrom: e.target.value }))
                      }
                    />
                    <span className="text-xs text-ink">〜</span>
                    <input
                      className="w-full h-8 bg-white border border-black/40 px-2 text-sm"
                      placeholder="終了"
                      value={form.preferredTimeTo ?? ""}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, preferredTimeTo: e.target.value }))
                      }
                    />
                  </div>
                  <div className="text-xs text-ink font-semibold">身分証（顔写真あり）</div>
                  <div className="flex items-center gap-3">
                    <div className="w-20 h-24 rounded-lg border border-black/30 bg-white overflow-hidden flex items-center justify-center">
                      {idWithFacePreview ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={idWithFacePreview} alt="id_with_face" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-[11px] text-muted">未設定</span>
                      )}
                    </div>
                    <label className="px-3 py-1.5 rounded-md bg-[#2b78e4] text-white border border-black/40 text-xs cursor-pointer">
                      アップロード＋
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0] ?? null;
                          e.currentTarget.value = "";
                          setIdWithFaceFile(file);
                        }}
                      />
                    </label>
                  </div>

                  <div className="text-xs text-ink font-semibold">身分証（本籍地記載）</div>
                  <div className="flex items-center gap-3">
                    <div className="w-20 h-24 rounded-lg border border-black/30 bg-white overflow-hidden flex items-center justify-center">
                      {idWithoutFacePreview ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={idWithoutFacePreview} alt="id_without_face" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-[11px] text-muted">未設定</span>
                      )}
                    </div>
                    <label className="px-3 py-1.5 rounded-md bg-[#2b78e4] text-white border border-black/40 text-xs cursor-pointer">
                      アップロード＋
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0] ?? null;
                          e.currentTarget.value = "";
                          setIdWithoutFaceFile(file);
                        }}
                      />
                    </label>
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
                <textarea
                  className="w-full min-h-[70px] bg-white border border-black/40 px-2 py-2 text-sm"
                  value={form.interviewNotes ?? ""}
                  onChange={(e) => setForm((p) => ({ ...p, interviewNotes: e.target.value }))}
                />
              </div>
              <div>
                <div className="text-xs text-ink font-semibold">職歴</div>
                <div className="min-h-[70px] bg-white border border-black/40 px-2 py-2 text-sm">
                  {form.workHistories?.length
                    ? form.workHistories
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
                  {form.ngShops?.length
                    ? form.ngShops.map((n) => n.shopName).join(" / ")
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

  const handleApprove = async (
    payload: UpdateApplicationFormInput,
    files: ApprovalUploadFiles
  ) => {
    if (!selected) return;
    setApproving(true);
    setDetailErr(null);
    try {
      await updateApplicationForm(selected.id, payload);
      const approved: any = await approveApplication(selected.id);
      const castId: string | null =
        approved?.migrated?.castId ?? approved?.migrated?.userId ?? null;

      if (castId) {
        if (files.profileFile) {
          await uploadCastProfilePhoto(castId, files.profileFile);
        }
        if (files.idWithFaceFile) {
          await uploadCastIdDocWithFace(castId, files.idWithFaceFile);
        }
        if (files.idWithoutFaceFile) {
          await uploadCastIdDocWithoutFace(castId, files.idWithoutFaceFile);
        }
      }

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
