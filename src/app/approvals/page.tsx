"use client";
import { useCallback, useEffect, useMemo, useState, type ReactNode, useRef, type Dispatch, type SetStateAction } from "react";
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
import { listStaffs } from "@/lib/api.staffs";
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

function toDrinkLevelLabel(value?: string | null) {
  if (!value) return "";
  if (value === "ng" || value === "NG") return "NG";
  if (value === "weak" || value === "弱い") return "弱い";
  if (value === "normal" || value === "普通") return "普通";
  if (value === "strong" || value === "強い") return "強い";
  return value;
}

function toDrinkLevelApi(value?: string | null) {
  if (!value) return undefined;
  if (value === "NG") return "ng";
  if (value === "弱い") return "weak";
  if (value === "普通") return "normal";
  if (value === "強い") return "strong";
  if (value === "ng" || value === "weak" || value === "normal" || value === "strong") {
    return value;
  }
  return undefined;
}


const CAST_GENRE_OPTIONS = ["クラブ", "キャバ", "スナック", "ガルバ"] as const;
const CAST_RANK_OPTIONS = ["S", "A", "B", "C"] as const;
const TIARA_HOURLY_OPTIONS = [
  2500, 3000, 3500, 4000, 4500, 5000, 5500, 6000, 6500, 7000, 7500, 8000, 8500,
  9000, 9500, 10000,
] as const;
const BODY_TYPE_OPTIONS = ["細身", "普通", "グラマー", "ぽっちゃり", "不明"] as const;

type CastRank = (typeof CAST_RANK_OPTIONS)[number];
type BodyType = (typeof BODY_TYPE_OPTIONS)[number];

type PhotoSliderProps = {
  urls: string[];
  onOpen?: (index: number) => void;
  className?: string;
};

function PhotoSlider({ urls, onOpen, className }: PhotoSliderProps) {
  const [active, setActive] = useState(0);
  const touchRef = useRef<{ x: number; y: number; at: number } | null>(null);
  const SWIPE_MIN_X = 40;
  const SWIPE_MAX_Y = 60;
  const SWIPE_MAX_MS = 700;

  const goPrev = useCallback(() => {
    setActive((v) => (v - 1 + urls.length) % urls.length);
  }, [urls.length]);

  const goNext = useCallback(() => {
    setActive((v) => (v + 1) % urls.length);
  }, [urls.length]);

  useEffect(() => {
    if (active >= urls.length) setActive(0);
  }, [active, urls.length]);

  if (!urls || urls.length === 0) {
    return (
      <div
        className={
          "w-full aspect-[3/4] rounded-2xl bg-neutral-100 border border-neutral-200 flex items-center justify-center text-neutral-400 " +
          (className ?? "")
        }
      >
        写真なし
      </div>
    );
  }

  const current = urls[active];

  return (
    <div className={"w-full " + (className ?? "")}>
      <div
        className="relative w-full aspect-[3/4] rounded-2xl overflow-hidden bg-neutral-100 border border-neutral-200 select-none"
        onTouchStart={(e) => {
          if (!e.touches?.[0]) return;
          touchRef.current = {
            x: e.touches[0].clientX,
            y: e.touches[0].clientY,
            at: Date.now(),
          };
        }}
        onTouchMove={(e) => {
          if (!touchRef.current || !e.touches?.[0]) return;
          const dx = e.touches[0].clientX - touchRef.current.x;
          const dy = e.touches[0].clientY - touchRef.current.y;
          if (Math.abs(dx) > 10 && Math.abs(dy) < SWIPE_MAX_Y) {
            e.preventDefault?.();
          }
        }}
        onTouchEnd={(e) => {
          const t = touchRef.current;
          touchRef.current = null;
          if (!t || !e.changedTouches?.[0]) return;
          const dx = e.changedTouches[0].clientX - t.x;
          const dy = e.changedTouches[0].clientY - t.y;
          const dt = Date.now() - t.at;
          if (dt > SWIPE_MAX_MS) return;
          if (Math.abs(dy) > SWIPE_MAX_Y) return;
          if (Math.abs(dx) < SWIPE_MIN_X) return;
          if (dx > 0) {
            goPrev();
          } else {
            goNext();
          }
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={current} alt="profile" className="w-full h-full object-cover" />
        {urls.length > 1 && (
          <>
            <button
              type="button"
              className="absolute left-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-white/80 border border-black/30 text-xs"
              onClick={goPrev}
            >
              ◀
            </button>
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-white/80 border border-black/30 text-xs"
              onClick={goNext}
            >
              ▶
            </button>
          </>
        )}
        {onOpen && (
          <button
            type="button"
            className="absolute inset-0"
            onClick={() => onOpen(active)}
            aria-label="open"
          />
        )}
      </div>
      {urls.length > 1 && (
        <div className="mt-2 flex items-center justify-center gap-1">
          {urls.map((_, i) => (
            <span
              key={i}
              className={`w-1.5 h-1.5 rounded-full ${
                i === active ? "bg-slate-700" : "bg-slate-300"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function AtmosphereSlider({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  const v = Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : 50;
  const ticks = [0, 25, 50, 75, 100];

  return (
    <div className="tiara-atmo h-8 w-full" aria-label="雰囲気">
      <div className="tiara-atmo__track" />
      <div className="tiara-atmo__ticks" aria-hidden="true">
        {ticks.map((t) => (
          <span
            key={t}
            className={`tiara-atmo__tick ${t === 50 ? "tiara-atmo__tick--center" : ""}`}
            style={{ left: `${t}%` }}
          />
        ))}
      </div>
      <input
        className="tiara-atmo__input"
        type="range"
        min={0}
        max={100}
        step={1}
        value={v}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
      />
    </div>
  );
}

function RegisterInfo2({
  form,
  setForm,
}: {
  form: ApplicationDetail | null;
  setForm: Dispatch<SetStateAction<ApplicationDetail>>;
}) {
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
    .map((s) => s.trim())
    .filter(Boolean);

  const toggleHowFound = (label: string) => {
    const checked = currentHowFound.includes(label);
    const next = checked
      ? currentHowFound.filter((x) => x !== label)
      : [...currentHowFound, label];

    setForm((p) => ({ ...p, howFound: next.join(" / ") }));
  };

  return (
    <div>
      <div className="grid grid-cols-[190px_minmax(0,1fr)] gap-3 items-start">
        <div className="space-y-2">
          <div className="inline-flex items-center px-3 py-1 text-xs font-semibold bg-white/90 border border-black/40 rounded">
            登録情報②
          </div>
          <div className="text-xs text-ink font-semibold">どのように応募しましたか？</div>
        </div>

        <div className="grid grid-cols-4 gap-x-6 gap-y-2 pt-1 text-xs text-ink">
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

      <div className="mt-4 space-y-2">
        <div className="grid grid-cols-[190px_minmax(0,1fr)] items-center gap-3">
          <div className="text-xs text-ink font-semibold">検索したワードを教えてください</div>
          <input
            className="w-full h-8 bg-white border border-black/40 px-2 text-sm"
            value={form?.referrerName ?? ""}
            onChange={(e) => setForm((p) => ({ ...p, referrerName: e.target.value }))}
            placeholder="自由入力（キーワードとキーワードの間は,で区切る）"
          />
        </div>

        <div className="grid grid-cols-[190px_minmax(0,1fr)] items-center gap-3">
          <div className="text-xs text-ink font-semibold">他派遣会社への登録</div>
          <select
            className="w-full h-8 bg-white border border-black/40 px-2 text-sm"
            value={form?.compareOtherAgencies ?? ""}
            onChange={(e) => setForm((p) => ({ ...p, compareOtherAgencies: e.target.value }))}
          >
            <option value=""></option>
            <option value="あり">あり</option>
            <option value="なし">なし</option>
            <option value="不明">不明</option>
          </select>
        </div>

        <div className="grid grid-cols-[190px_minmax(0,1fr)] items-center gap-3">
          <div className="text-xs text-ink font-semibold">不満だった点を教えてください</div>
          <input
            className="w-full h-8 bg-white border border-black/40 px-2 text-sm"
            value={form?.dissatisfaction ?? ""}
            onChange={(e) => setForm((p) => ({ ...p, dissatisfaction: e.target.value }))}
          />
        </div>

        <div className="grid grid-cols-[190px_minmax(0,1fr)] items-center gap-3">
          <div className="text-xs text-ink font-semibold">求める接客の経験を教えてください</div>
          <select
            className="w-full h-8 bg-white border border-black/40 px-2 text-sm"
            value={form?.customerExperience ?? ""}
            onChange={(e) => setForm((p) => ({ ...p, customerExperience: e.target.value }))}
          >
            <option value=""></option>
            <option value="ある">ある</option>
            <option value="少しある">少しある</option>
            <option value="なし">なし</option>
          </select>
        </div>

        <div className="grid grid-cols-[190px_minmax(0,1fr)] items-center gap-3">
          <div className="text-xs text-ink font-semibold">TBマナーの講習が必要ですか？</div>
          <select
            className="w-full h-8 bg-white border border-black/40 px-2 text-sm"
            value={form?.tbManner ?? ""}
            onChange={(e) => setForm((p) => ({ ...p, tbManner: e.target.value }))}
          >
            <option value=""></option>
            <option value="必要">必要</option>
            <option value="不要">不要</option>
          </select>
        </div>

        <div className="grid grid-cols-[190px_minmax(0,1fr)] gap-3 items-start pt-1">
          <div className="text-xs text-ink font-semibold pt-2">その他（備考）</div>
          <textarea
            className="w-full h-40 bg-white border border-black/40 px-2 py-2 text-sm resize-none"
            value={form?.otherNotes ?? ""}
            onChange={(e) => setForm((p) => ({ ...p, otherNotes: e.target.value }))}
          />
        </div>

        <div className="mt-3 space-y-2">
          <div className="grid grid-cols-[190px_minmax(0,1fr)] items-center gap-3">
            <div className="text-xs text-ink font-semibold">希望勤務地</div>
            <input
              className="w-full h-8 bg-white border border-black/40 px-2 text-sm"
              value={form?.desiredLocation ?? ""}
              onChange={(e) => setForm((p) => ({ ...p, desiredLocation: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-[190px_minmax(0,1fr)] items-center gap-3">
            <div className="text-xs text-ink font-semibold">希望時間帯</div>
            <input
              className="w-full h-8 bg-white border border-black/40 px-2 text-sm"
              value={form?.desiredTimeBand ?? ""}
              onChange={(e) => setForm((p) => ({ ...p, desiredTimeBand: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-[190px_minmax(0,1fr)] items-center gap-3">
            <div className="text-xs text-ink font-semibold">希望エリア</div>
            <input
              className="w-full h-8 bg-white border border-black/40 px-2 text-sm"
              value={form?.preferredArea ?? ""}
              onChange={(e) => setForm((p) => ({ ...p, preferredArea: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-[190px_minmax(0,1fr)] items-center gap-3">
            <div className="text-xs text-ink font-semibold">希望出勤日数</div>
            <input
              className="w-full h-8 bg-white border border-black/40 px-2 text-sm"
              value={(form?.preferredDays ?? []).join(" / ")}
              onChange={(e) =>
                setForm((p) => ({ ...p, preferredDays: splitToArray(e.target.value) }))
              }
            />
          </div>
          <div className="grid grid-cols-[190px_minmax(0,1fr)] items-center gap-3">
            <div className="text-xs text-ink/90 font-semibold">面談日</div>
            <div>
              <input
                type="date"
                value={formatDate(form?.interviewDate ?? "") || ""}
                onChange={(e) => setForm((p) => ({ ...p, interviewDate: e.target.value }))}
                className="w-full h-10 rounded-xl px-3 text-sm bg-white/90 border border-white/40 text-slate-900 disabled:opacity-100"
              />
              <div className="mt-1 text-[10px] text-ink/70">
                ※基本は面接申込フォームの自動反映。必要時のみこの画面で上書きできます。
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

type WorkHistoryRow = { shopName: string; hourlyWage: string };

type NgShopRow = { shopName: string };
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
  const [workHistoryRows, setWorkHistoryRows] = useState<WorkHistoryRow[]>([]);
  const [ngShopRows, setNgShopRows] = useState<NgShopRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveDone, setSaveDone] = useState(false);

  const [profileFile, setProfileFile] = useState<File | null>(null);
  const [idWithFaceFile, setIdWithFaceFile] = useState<File | null>(null);
  const [idWithoutFaceFile, setIdWithoutFaceFile] = useState<File | null>(null);

  const [profilePreview, setProfilePreview] = useState<string | null>(null);
  const [idWithFacePreview, setIdWithFacePreview] = useState<string | null>(null);
  const [idWithoutFacePreview, setIdWithoutFacePreview] = useState<string | null>(null);
  const [showHonsekiDocs, setShowHonsekiDocs] = useState(false);
  const [staffOptions, setStaffOptions] = useState<string[]>([]);

  useEffect(() => {
    const fallbackInterviewDate =
      detail.interviewDate ?? detail.registeredAt ?? detail.receivedAt ?? null;
    setForm({
      ...detail,
      interviewDate: fallbackInterviewDate,
      drinkLevel: toDrinkLevelLabel(detail.drinkLevel ?? null),
      genres: detail.genres ?? [],
      preferredDays: detail.preferredDays ?? [],
      workHistories: detail.workHistories ?? [],
      ngShops: detail.ngShops ?? [],
    });
    const nextWorkHistoryRows =
      detail.workHistories?.map((w) => ({
        shopName: w.shopName ?? "",
        hourlyWage: w.hourlyWage != null ? String(w.hourlyWage) : "",
      })) ?? [];
    setWorkHistoryRows(
      nextWorkHistoryRows.length ? nextWorkHistoryRows : [{ shopName: "", hourlyWage: "" }],
    );
    const nextNgShopRows =
      detail.ngShops?.map((n) => ({
        shopName: n.shopName ?? "",
      })) ?? [];
    setNgShopRows(nextNgShopRows.length ? nextNgShopRows : [{ shopName: "" }]);
    setSaveDone(false);
    setSaveError(null);
    setProfileFile(null);
    setIdWithFaceFile(null);
    setIdWithoutFaceFile(null);
    setProfilePreview(null);
    setIdWithFacePreview(null);
    setIdWithoutFacePreview(null);
    setShowHonsekiDocs(false);
  }, [detail]);

  useEffect(() => {
    if (!profileFile) return;
    const url = URL.createObjectURL(profileFile);
    setProfilePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [profileFile]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const list = await listStaffs();
        const names = list
          .map((s) => s.loginId || s.email || "")
          .filter(Boolean);
        if (mounted) {
          setStaffOptions(Array.from(new Set(names)));
        }
      } catch {
        if (mounted) setStaffOptions([]);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

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
    tiaraHourly: typeof form.tiaraHourly === "number" ? form.tiaraHourly : undefined,
    tiaraRank: form.tiaraRank ?? undefined,
    ownerStaffName: form.ownerStaffName ?? undefined,
    lastWorkDate: form.lastWorkDate ?? undefined,
    interviewDate: form.interviewDate ?? undefined,
    preferredArea: form.preferredArea ?? undefined,
    salaryNote: form.salaryNote ?? undefined,
    otherAgencies: form.otherAgencies ?? undefined,
    hasExperience: typeof form.hasExperience === "boolean" ? form.hasExperience : undefined,
    workHistory: form.workHistory ?? undefined,
    referrerName: form.referrerName ?? undefined,
    compareOtherAgencies: form.compareOtherAgencies ?? undefined,
    otherAgencyName: form.otherAgencyName ?? undefined,
    thirtyKComment: form.thirtyKComment ?? undefined,
    idDocType: form.idDocType ?? undefined,
    residencyProof: form.residencyProof ?? undefined,
    idDocWithFaceUrl: form.idDocWithFaceUrl ?? undefined,
    idDocWithoutFaceUrl: form.idDocWithoutFaceUrl ?? undefined,
    oathStatus: form.oathStatus ?? undefined,
    idMemo: form.idMemo ?? undefined,
    ngShopMemo: form.ngShopMemo ?? undefined,
    exclusiveShopMemo: form.exclusiveShopMemo ?? undefined,
    exclusiveShopId: form.exclusiveShopId ?? undefined,
    exclusiveShopName: form.exclusiveShopName ?? undefined,
    pickupDestination: form.pickupDestination ?? undefined,
    pickupDestinationExtra: form.pickupDestinationExtra ?? undefined,
    bodyType: form.bodyType ?? undefined,
    atmosphere: typeof form.atmosphere === "number" ? form.atmosphere : undefined,
    dissatisfaction: form.dissatisfaction ?? undefined,
    customerExperience: form.customerExperience ?? undefined,
    tbManner: form.tbManner ?? undefined,
    desiredLocation: form.desiredLocation ?? undefined,
    desiredTimeBand: form.desiredTimeBand ?? undefined,
    interviewNotes: form.interviewNotes ?? undefined,
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
    drinkLevel: toDrinkLevelApi(form.drinkLevel ?? null),
    howFound: form.howFound ?? undefined,
    motivation: form.motivation ?? undefined,
    competitorCount: form.competitorCount ?? undefined,
    reasonChoose: form.reasonChoose ?? undefined,
    shopSelectionPoints: form.shopSelectionPoints ?? undefined,
    otherNotes: form.otherNotes ?? undefined,
    workHistories: workHistoryRows
      .map((row) => ({
        shopName: row.shopName.trim(),
        hourlyWage: row.hourlyWage.trim()
          ? Number(row.hourlyWage.trim())
          : undefined,
      }))
      .filter((row) => row.shopName.length > 0),
    ngShops: ngShopRows
      .map((row) => ({ shopName: row.shopName.trim() }))
      .filter((row) => row.shopName.length > 0),
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

  const handleRegister = async () => {
    if (detail.status === "approved") {
      await handleSave();
      return;
    }
    await handleApprove();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-3 py-6">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative z-10 w-full max-w-7xl max-h-[92vh] bg-white rounded-2xl shadow-2xl border border-gray-300 overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-5 py-1.5 border-b border-gray-200 bg-gray-50">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-semibold">キャスト詳細（{name}）</h3>
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
              onClick={() => setShowHonsekiDocs((v) => !v)}
              className="px-3 py-1 rounded-xl text-[11px] border border-gray-300 bg-gray-50"
            >
              チャットで連絡
            </button>
            <button
              className="px-3 py-1 rounded-xl text-[11px] border border-emerald-400/60 bg-emerald-500/80 text-white disabled:opacity-60 disabled:cursor-not-allowed bg-[#49c69b]"
              onClick={handleRegister}
              disabled={saving || approving}
            >
              {saving || approving ? "登録中…" : "登録"}
            </button>
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

                <div className="mt-4 grid grid-cols-[170px_minmax(0,1fr)] gap-4">
                  <div className="space-y-2">
                    <PhotoSlider urls={profilePreview ? [profilePreview] : []} />
                    <div className="mt-2 w-full rounded-xl bg-white/90 border border-black/40 px-2 py-1 text-[11px] leading-4">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-[10px] text-neutral-600">管理番号</div>
                        <div className="font-mono text-neutral-900">-</div>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-[10px] text-neutral-600">キャストID</div>
                        <div className="font-mono text-neutral-900">-</div>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-[10px] text-neutral-600">旧スタッフID</div>
                        <div className="font-mono text-neutral-900">-</div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="grid grid-cols-[110px_minmax(0,1fr)] items-center gap-2">
                      <div className="text-xs text-ink font-semibold">ふりがな</div>
                      <input
                        className="w-full h-8 bg-white border border-black/40 px-2 text-sm"
                        value={form.furigana ?? ""}
                        onChange={(e) => setForm((p) => ({ ...p, furigana: e.target.value }))}
                      />
                    </div>
                    <div className="grid grid-cols-[110px_minmax(0,1fr)] items-center gap-2">
                      <div className="text-xs text-ink font-semibold">氏名</div>
                      <input
                        className="w-full h-8 bg-white border border-black/40 px-2 text-sm"
                        value={form.fullName ?? ""}
                        onChange={(e) => setForm((p) => ({ ...p, fullName: e.target.value }))}
                      />
                    </div>
                    <div className="grid grid-cols-[110px_minmax(0,1fr)] items-center gap-2">
                      <div className="text-xs text-ink font-semibold">生年月日</div>
                      <div className="flex items-center gap-2">
                        <input
                          className="w-full h-8 bg-white border border-black/40 px-2 text-sm"
                          value={formatDate(form.birthdate) || ""}
                          onChange={(e) =>
                            setForm((p) => {
                              const nextBirthdate = e.target.value || null;
                              const nextAge = calcAge(undefined, nextBirthdate ?? undefined);
                              return {
                                ...p,
                                birthdate: nextBirthdate,
                                age: typeof nextAge === "number" ? nextAge : p.age ?? null,
                              };
                            })
                          }
                        />
                        <div className="h-8 px-2 bg-white border border-black/40 flex items-center justify-center">
                          <div className="text-sm font-bold text-neutral-900 tabular-nums">
                            {age ?? "-"}
                          </div>
                        </div>
                        <div className="text-xs text-ink font-semibold">歳</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-[110px_minmax(0,1fr)] items-center gap-2">
                      <div className="text-xs text-ink font-semibold">現住所</div>
                      <input
                        className="w-full h-8 bg-white border border-black/40 px-2 text-sm"
                        value={form.address ?? ""}
                        onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
                      />
                    </div>
                    <div className="grid grid-cols-[110px_minmax(0,1fr)] items-center gap-2">
                      <div className="text-xs text-ink font-semibold">TEL</div>
                      <input
                        className="w-full h-8 bg-white border border-black/40 px-2 text-sm"
                        value={form.phone ?? ""}
                        onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                      />
                    </div>
                    <div className="grid grid-cols-[110px_minmax(0,1fr)] items-center gap-2">
                      <div className="text-xs text-ink font-semibold">アドレス</div>
                      <input
                        className="w-full h-8 bg-white border border-black/40 px-2 text-sm"
                        value={form.email ?? ""}
                        onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                      />
                    </div>
                    <div className="grid grid-cols-[110px_minmax(0,1fr)] items-start gap-2">
                      <div className="text-xs text-ink font-semibold pt-1">ジャンル</div>
                      <div className="flex flex-wrap gap-2">
                        {CAST_GENRE_OPTIONS.map((g) => {
                          const active = form.genres?.includes(g) ?? false;
                          return (
                            <button
                              key={g}
                              type="button"
                              onClick={() =>
                                setForm((prev) => ({
                                  ...prev,
                                  genres: prev.genres?.includes(g)
                                    ? prev.genres.filter((x) => x !== g)
                                    : [...(prev.genres ?? []), g],
                                }))
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
                    <div className="grid grid-cols-[110px_minmax(0,1fr)] items-center gap-2">
                      <div className="text-xs text-ink font-semibold">希望時給</div>
                      <input
                        className="w-full h-8 bg-white border border-black/40 px-2 text-sm"
                        value={form.salaryNote ?? ""}
                        onChange={(e) => setForm((p) => ({ ...p, salaryNote: e.target.value }))}
                        placeholder="フォームで自由入力を反映"
                      />
                    </div>
                    <div className="grid grid-cols-[110px_minmax(0,1fr)] items-center gap-2">
                      <div className="text-xs text-ink font-semibold">キャストからの店舗NG</div>
                      <div className="flex items-center gap-2">
                        <div className="w-full h-8 bg-white border border-black/40 px-2 text-sm flex items-center gap-1 overflow-x-auto">
                          {ngShopRows.filter((x) => x.shopName.trim()).length === 0 ? (
                            <span className="text-gray-400">未登録</span>
                          ) : (
                            ngShopRows
                              .filter((x) => x.shopName.trim())
                              .map((row, idx) => (
                                <span
                                  key={`${row.shopName}-${idx}`}
                                  className="flex items-center gap-1 px-2 h-6 rounded-full border border-black/30 bg-gray-50 whitespace-nowrap"
                                >
                                  <span className="text-[11px]">{row.shopName}</span>
                                  <button
                                    type="button"
                                    className="ml-0.5 w-4 h-4 rounded-full border border-black/30 bg-white text-[10px] leading-none flex items-center justify-center"
                                    onClick={() =>
                                      setNgShopRows((prev) => prev.filter((_, i) => i !== idx))
                                    }
                                  >
                                    ×
                                  </button>
                                </span>
                              ))
                          )}
                        </div>
                        <button
                          type="button"
                          className="h-8 w-10 bg-[#2b78e4] text-white border border-black/40"
                          onClick={() => setNgShopRows((prev) => [...prev, { shopName: "" }])}
                        >
                          +
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-[110px_minmax(0,1fr)] items-center gap-2">
                      <div className="text-xs text-ink font-semibold">シフト情報</div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-8 bg-white border border-black/40 px-2 text-xs flex items-center">
                          未設定
                        </div>
                        <button type="button" className="h-8 px-3 text-xs bg-white border border-black/40">
                          編集
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-[110px_minmax(0,1fr)] items-center gap-2">
                      <div className="text-xs text-ink font-semibold">身長</div>
                      <input
                        className="w-full h-8 bg-white border border-black/40 px-2 text-sm"
                        value={form.heightCm ?? ""}
                        onChange={(e) =>
                          setForm((p) => ({ ...p, heightCm: toNumber(e.target.value) ?? null }))
                        }
                      />
                    </div>
                    <div className="grid grid-cols-[110px_minmax(0,1fr)] items-center gap-2">
                      <div className="text-xs text-ink font-semibold">服のサイズ</div>
                      <input
                        className="w-full h-8 bg-white border border-black/40 px-2 text-sm"
                        value={form.clothingSize ?? ""}
                        onChange={(e) => setForm((p) => ({ ...p, clothingSize: e.target.value }))}
                      />
                    </div>
                    <div className="grid grid-cols-[110px_minmax(0,1fr)] items-center gap-2">
                      <div className="text-xs text-ink font-semibold">靴のサイズ</div>
                      <input
                        className="w-full h-8 bg-white border border-black/40 px-2 text-sm"
                        value={form.shoeSizeCm ?? ""}
                        onChange={(e) =>
                          setForm((p) => ({ ...p, shoeSizeCm: toNumber(e.target.value) ?? null }))
                        }
                      />
                    </div>
                    <div className="grid grid-cols-[110px_minmax(0,1fr)] items-center gap-2">
                      <div className="text-xs text-ink font-semibold">タトゥー</div>
                      <select
                        className="w-full h-8 bg-white border border-black/40 px-2 text-sm"
                        value={form.tattoo == null ? "" : form.tattoo ? "有" : "無"}
                        onChange={(e) =>
                          setForm((p) => ({
                            ...p,
                            tattoo:
                              e.target.value === ""
                                ? null
                                : e.target.value === "有",
                          }))
                        }
                      >
                        <option value=""></option>
                        <option value="有">有</option>
                        <option value="無">無</option>
                      </select>
                    </div>
                    <div className="grid grid-cols-[110px_minmax(0,1fr)] items-center gap-2">
                      <div className="text-xs text-ink font-semibold">飲酒</div>
                      <select
                        className="w-full h-8 bg-white border border-black/40 px-2 text-sm"
                        value={form.drinkLevel ?? ""}
                        onChange={(e) => setForm((p) => ({ ...p, drinkLevel: e.target.value }))}
                      >
                        <option value=""></option>
                        <option value="NG">NG</option>
                        <option value="弱い">弱い</option>
                        <option value="普通">普通</option>
                        <option value="強い">強い</option>
                      </select>
                    </div>
                    <div className="grid grid-cols-[110px_minmax(0,1fr)] items-center gap-2">
                      <div className="text-xs text-ink font-semibold">最終出勤日</div>
                      <input
                        type="date"
                        className="w-full h-8 bg-white border border-black/40 px-2 text-sm"
                        value={formatDate(form.lastWorkDate) || ""}
                        onChange={(e) => setForm((p) => ({ ...p, lastWorkDate: e.target.value }))}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-[#efe2dd] p-4">
                <RegisterInfo2 form={form} setForm={setForm} />
              </div>
            </div>
          </div>

          <div className="bg-[#a87e7e] p-4">
            <div className="inline-flex items-center px-3 py-1 text-xs font-semibold bg-white/90 border border-black/40 rounded">
              スタッフ入力項目
            </div>

            <div className="mt-4 grid grid-cols-1 xl:grid-cols-2 gap-6">
              <div className="space-y-3">
                <div className="grid grid-cols-[140px_minmax(0,1fr)] items-center gap-2">
                  <div className="text-xs font-semibold text-ink">ティアラ査定給</div>
                  <select
                    className="w-full h-8 bg-white border border-black/40 px-2 text-sm"
                    value={form.tiaraHourly != null ? String(form.tiaraHourly) : ""}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        tiaraHourly: toNumber(e.target.value) ?? null,
                      }))
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
                <div className="grid grid-cols-[140px_minmax(0,1fr)] items-center gap-2">
                  <div className="text-xs font-semibold text-ink">送迎先</div>
                  <input
                    className="w-full h-8 bg-white border border-black/40 px-2 text-sm"
                    value={form.pickupDestination ?? ""}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, pickupDestination: e.target.value }))
                    }
                    placeholder="自動入力"
                  />
                </div>
                <div className="grid grid-cols-[140px_minmax(0,1fr)] items-center gap-2">
                  <div className="text-xs font-semibold text-ink">送迎先追加</div>
                  <input
                    className="w-full h-8 bg-white border border-black/40 px-2 text-sm"
                    value={form.pickupDestinationExtra ?? ""}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, pickupDestinationExtra: e.target.value }))
                    }
                    placeholder="アプリから反映"
                  />
                </div>
                <div className="grid grid-cols-[140px_minmax(0,1fr)] items-center gap-2">
                  <div className="text-xs font-semibold text-ink">担当</div>
                  <select
                    className="w-full h-8 bg-white border border-black/40 px-2 text-sm"
                    value={form.ownerStaffName ?? ""}
                    onChange={(e) => setForm((p) => ({ ...p, ownerStaffName: e.target.value }))}
                  >
                    <option value=""></option>
                    {staffOptions.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-[140px_minmax(0,1fr)] items-center gap-2">
                  <div className="text-xs font-semibold text-ink">体型</div>
                  <select
                    className="w-full h-8 bg-white border border-black/40 px-2 text-sm"
                    value={form.bodyType ?? ""}
                    onChange={(e) => setForm((p) => ({ ...p, bodyType: e.target.value }))}
                  >
                    <option value=""></option>
                    {BODY_TYPE_OPTIONS.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-[140px_minmax(0,1fr)] items-center gap-2">
                  <div className="text-xs font-semibold text-ink">身長</div>
                  <input
                    className="w-full h-8 bg-white border border-black/40 px-2 text-sm"
                    value={form.heightCm ?? ""}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, heightCm: toNumber(e.target.value) ?? null }))
                    }
                    placeholder="自動反映"
                  />
                </div>
                <div className="flex items-center gap-3 pt-1">
                  <label className="px-4 h-9 rounded-md bg-[#2b78e4] text-white border border-black/40 text-xs cursor-pointer">
                    顔写真＋
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
                  <button
                    type="button"
                    className="px-4 h-9 rounded-md bg-[#2b78e4] text-white border border-black/40 text-xs"
                    onClick={() => setShowHonsekiDocs((v) => !v)}
                  >
                    本籍地記載書類
                  </button>
                </div>
                {showHonsekiDocs && (
                  <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="flex flex-col items-center">
                      <div className="w-full text-left text-[11px] text-muted mb-1">
                        顔写真付き（id_with_face）
                      </div>
                      <div className="w-24 sm:w-28 aspect-[3/4] rounded-xl border border-gray-200 bg-gray-50 overflow-hidden flex items-center justify-center">
                        {(idWithFacePreview || form.idDocWithFaceUrl) ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={idWithFacePreview ?? form.idDocWithFaceUrl ?? ""}
                            alt="id_with_face"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <label className="w-full h-full flex flex-col items-center justify-center gap-1 cursor-pointer text-[11px] text-muted">
                            <div className="font-semibold">アップロード＋</div>
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
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-center">
                      <div className="w-full text-left text-[11px] text-muted mb-1">
                        本籍地記載（id_without_face）
                      </div>
                      <div className="w-24 sm:w-28 aspect-[3/4] rounded-xl border border-gray-200 bg-gray-50 overflow-hidden flex items-center justify-center">
                        {(idWithoutFacePreview || form.idDocWithoutFaceUrl) ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={idWithoutFacePreview ?? form.idDocWithoutFaceUrl ?? ""}
                            alt="id_without_face"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <label className="w-full h-full flex flex-col items-center justify-center gap-1 cursor-pointer text-[11px] text-muted">
                            <div className="font-semibold">アップロード＋</div>
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
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <div className="grid grid-cols-[140px_minmax(0,1fr)] items-center gap-2">
                  <div className="text-xs font-semibold text-ink">ランク</div>
                  <select
                    className="w-full h-8 bg-white border border-black/40 px-2 text-sm"
                    value={form.tiaraRank ?? ""}
                    onChange={(e) => setForm((p) => ({ ...p, tiaraRank: e.target.value as CastRank }))}
                  >
                    <option value=""></option>
                    {CAST_RANK_OPTIONS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-[140px_minmax(0,1fr)] items-center gap-2">
                  <div className="text-xs font-semibold text-ink">雰囲気</div>
                  <AtmosphereSlider
                    value={form.atmosphere ?? 50}
                    onChange={(v) => setForm((p) => ({ ...p, atmosphere: v }))}
                  />
                </div>
                <div className="grid grid-cols-[140px_minmax(0,1fr)] items-center gap-2">
                  <div className="text-xs font-semibold text-ink">派遣会社名</div>
                  <input
                    className="w-full h-8 bg-white border border-black/40 px-2 text-sm"
                    value={form.otherAgencyName ?? ""}
                    onChange={(e) => setForm((p) => ({ ...p, otherAgencyName: e.target.value }))}
                  />
                </div>
                <div className="grid grid-cols-[140px_minmax(0,1fr)] items-center gap-2">
                  <div className="text-xs font-semibold text-ink">時給メモ</div>
                  <input
                    className="w-full h-8 bg-white border border-black/40 px-2 text-sm"
                    value={form.salaryNote ?? ""}
                    onChange={(e) => setForm((p) => ({ ...p, salaryNote: e.target.value }))}
                  />
                </div>
                <div className="grid grid-cols-[140px_minmax(0,1fr)] items-center gap-2">
                  <div className="text-xs font-semibold text-ink">専属指名メモ</div>
                  <input
                    className="w-full h-8 bg-white border border-black/40 px-2 text-sm"
                    value={form.exclusiveShopMemo ?? ""}
                    onChange={(e) => setForm((p) => ({ ...p, exclusiveShopMemo: e.target.value }))}
                  />
                </div>
                <div className="grid grid-cols-[140px_minmax(0,1fr)] items-center gap-2">
                  <div className="text-xs font-semibold text-ink">身分証の種類</div>
                  <input
                    className="w-full h-8 bg-white border border-black/40 px-2 text-sm"
                    value={form.idDocType ?? ""}
                    onChange={(e) => setForm((p) => ({ ...p, idDocType: e.target.value }))}
                  />
                </div>
                <div className="grid grid-cols-[140px_minmax(0,1fr)] items-center gap-2">
                  <div className="text-xs font-semibold text-ink">本籍地の証明</div>
                  <input
                    className="w-full h-8 bg-white border border-black/40 px-2 text-sm"
                    value={form.residencyProof ?? ""}
                    onChange={(e) => setForm((p) => ({ ...p, residencyProof: e.target.value }))}
                  />
                </div>
                <div className="grid grid-cols-[140px_minmax(0,1fr)] items-center gap-2">
                  <div className="text-xs font-semibold text-ink">宣誓</div>
                  <input
                    className="w-full h-8 bg-white border border-black/40 px-2 text-sm"
                    value={form.oathStatus ?? ""}
                    onChange={(e) => setForm((p) => ({ ...p, oathStatus: e.target.value }))}
                  />
                </div>
                <div className="grid grid-cols-[140px_minmax(0,1fr)] items-center gap-2">
                  <div className="text-xs font-semibold text-ink">身分証メモ</div>
                  <input
                    className="w-full h-8 bg-white border border-black/40 px-2 text-sm"
                    value={form.idMemo ?? ""}
                    onChange={(e) => setForm((p) => ({ ...p, idMemo: e.target.value }))}
                  />
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

      <style jsx global>{`
        .tiara-atmo {
          width: 100%;
          position: relative;
          Zpx; /* 親(h-8)に追従させて中央に収める */;
          display: flex;
          align-items: center; /* スクショの細さ寄せ */}
        .tiara-atmo__track {
          position: absolute;
          left: 0;
          right: 0;
          top: 50%;
          transform: translateY(-50%);
          height: 2px;
          background: rgba(0, 0, 0, 0.65);
        }
        .tiara-atmo__ticks {
          position: absolute;
          left: 0;
          right: 0;
          top: 50%;
          transform: translateY(-50%);
          height: 12px;
          pointer-events: none;
        }
        .tiara-atmo__tick {
          position: absolute;
          top: 0;
          width: 1px;
          height: 10px;
          background: rgba(0, 0, 0, 0.65);
          transform: translateX(-0.5px);
        }
        .tiara-atmo__tick--center {
          width: 2px; /* 中央基準を太く */
          height: 12px;
          background: rgba(0, 0, 0, 0.9);
          transform: translateX(-1px);
        }
        .tiara-atmo__input {
          position: absolute;
          left: 0;
          right: 0;
          top: 50%;
          transform: translateY(-50%);
          width: 100%;
          Zpx;
          background: transparent;
          -webkit-appearance: none;
          appearance: none;
          outline: none;
        }
        .tiara-atmo__input::-webkit-slider-runnable-track {
          height: 2px;
          background: transparent; /* 下に描いたtrackを使う */}
        .tiara-atmo__input::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 8px; /* ノブ小さく */
          height: 8px;
          border-radius: 9999px;
          background: #2b78e4; /* シンプル */
          border: 1px solid rgba(0, 0, 0, 0.75);
          margin-top: -3px; /* track(2px)中心に合わせる */}
        .tiara-atmo__input::-moz-range-track {
          height: 2px;
          background: transparent;
        }
        .tiara-atmo__input::-moz-range-thumb {
          width: 8px;
          height: 8px;
          border-radius: 9999px;
          background: #2b78e4;
          border: 1px solid rgba(0, 0, 0, 0.75);
        }
        .tiara-atmo__input::-ms-track {
          height: 2px;
          background: transparent;
          border-color: transparent;
          color: transparent;
        }
        .tiara-atmo__input::-ms-thumb {
          width: 8px;
          height: 8px;
          border-radius: 9999px;
          background: #2b78e4;
          border: 1px solid rgba(0, 0, 0, 0.75);
        }

        /* ===== tiara-atmo: ラベルがスライダーに被る対策 ===== */
        .tiara-atmo {
          position: relative;
          /* ラベル用の下余白を確保（被り解消） */
          padding-bottom: 16px;
          /* 念のため最低高さも確保 */
          min-height: 26px;
        }

        /* track/ticks/input は中央に配置して白枠中央に合わせる */
        .tiara-atmo__track,
        .tiara-atmo__ticks,
        .tiara-atmo__input {
          position: absolute;
          left: 0;
          right: 0;
          top: 50%;
          transform: translateY(-50%);
        }

        .tiara-atmo__labels {
          /* padding-bottom で確保した領域に表示 */
          position: relative;
          margin-top: 12px;
          line-height: 1;
        }
      `}</style>
    </AppShell>
  );
}
