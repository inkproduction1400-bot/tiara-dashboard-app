"use client";

import { X } from "lucide-react";
import { useEffect, useState } from "react";
import type { MobileChatCastProfile } from "./mobileApi";

type MobileCastProfileSheetProps = {
  open: boolean;
  profile: MobileChatCastProfile | null;
  loading?: boolean;
  onClose: () => void;
};

function initials(name: string) {
  return name.replace(/\s+/g, "").slice(0, 2) || "ST";
}

function formatWage(value: string) {
  return value ? `¥${value}` : "-";
}

export function MobileCastProfileSheet({
  open,
  profile,
  loading = false,
  onClose,
}: MobileCastProfileSheetProps) {
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [profile?.photoUrl, profile?.castId]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-x-clip bg-slate-900/35">
      <div className="mx-auto flex h-full w-full max-w-[420px] min-w-0 items-end px-3">
        <div className="flex max-h-[88dvh] w-full min-w-0 max-w-full flex-col overflow-x-hidden overflow-y-hidden rounded-t-[28px] bg-white px-4 pb-6 pt-4 shadow-2xl">
          <div className="mx-auto h-1.5 w-12 rounded-full bg-slate-200" />
          <div className="mt-4 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-base font-bold text-slate-900">キャスト詳細</p>
              <p className="truncate text-xs text-slate-500">一覧から確認できるプロフィール情報</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500"
              aria-label="閉じる"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-4 min-w-0 flex-1 space-y-4 overflow-x-hidden overflow-y-auto">
            <div className="tiara-mobile-card border px-4 py-4">
              <div className="flex min-w-0 items-center gap-4">
                <div className="tiara-mobile-soft flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden bg-[#0b8ef3]/12 text-lg font-bold text-[#0b8ef3]">
                  {profile?.photoUrl && !imageFailed ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={profile.photoUrl}
                      alt={profile.castName}
                      className="h-full w-full object-cover"
                      onError={() => setImageFailed(true)}
                    />
                  ) : (
                    initials(profile?.castName ?? "")
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-bold text-slate-900">
                    {profile?.castName ?? (loading ? "読み込み中..." : "-")}
                  </p>
                  <p className="truncate text-sm text-slate-500">
                    {profile?.castCode || "-"} / 担当 {profile?.staffName || "-"}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="tiara-mobile-card border px-4 py-3">
                <p className="text-[11px] font-semibold text-slate-400">管理番号</p>
                <p className="mt-1 truncate text-sm font-semibold text-slate-800">
                  {profile?.managementNumber || "-"}
                </p>
              </div>
              <div className="tiara-mobile-card border px-4 py-3">
                <p className="text-[11px] font-semibold text-slate-400">希望時給</p>
                <p className="mt-1 truncate text-sm font-semibold text-slate-800">
                  {formatWage(profile?.wageText ?? "")}
                </p>
              </div>
            </div>

            <div className="tiara-mobile-card border px-4 py-4">
              <p className="text-[11px] font-semibold text-slate-400">ジャンル</p>
              <p className="mt-1 break-words text-sm text-slate-700">
                {profile?.genreText || "-"}
              </p>

              <div className="mt-4 flex flex-wrap gap-2 text-[11px] font-semibold">
                <span className="tiara-mobile-pill max-w-full truncate bg-slate-100 px-2.5 py-1 text-slate-600">
                  {profile?.shiftStatus || "-"}
                </span>
                <span className="tiara-mobile-pill max-w-full truncate bg-[#0b8ef3]/10 px-2.5 py-1 text-[#0b8ef3]">
                  {profile?.assignmentStatus || "-"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
