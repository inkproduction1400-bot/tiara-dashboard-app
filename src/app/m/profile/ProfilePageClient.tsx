"use client";

import { useEffect, useState } from "react";
import { MobileHeader } from "@/components/mobile/MobileHeader";
import { MobileShell } from "@/components/mobile/MobileShell";
import {
  fetchMobileProfile,
  type MobileProfileData,
} from "@/components/mobile/mobileApi";

function formatDateTime(value: string) {
  if (!value) return "未記録";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function statusLabel(status: string) {
  if (status === "active") return "有効";
  if (status === "suspended") return "停止中";
  if (status === "preactive") return "仮登録";
  return status;
}

export default function ProfilePageClient() {
  const [profile, setProfile] = useState<MobileProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setProfile(await fetchMobileProfile());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "読み込み失敗");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <MobileShell>
      <MobileHeader
        title="スタッフ情報"
        subtitle="既存 staff 認証をそのまま利用"
        onRefresh={() => void load()}
      />

      <div className="px-4 pb-6">
        {loading ? (
          <div className="py-10 text-sm text-slate-500">読み込み中...</div>
        ) : error ? (
          <div className="py-10 text-sm text-rose-500">{error}</div>
        ) : profile ? (
          <>
            <section className="tiara-mobile-card border px-5 py-5">
              <div className="flex items-start gap-4">
                <div className="tiara-mobile-soft flex h-20 w-20 items-center justify-center bg-[#0b8ef3]/12 text-2xl font-bold text-[#0b8ef3]">
                  {profile.displayName.slice(0, 2)}
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-xl font-bold text-slate-900">{profile.displayName}</h2>
                  <p className="mt-1 text-sm text-slate-500">@{profile.loginId}</p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
                    <span className="tiara-mobile-pill bg-[#0b8ef3]/10 px-2.5 py-1 text-[#0b8ef3]">
                      {profile.userType}
                    </span>
                    <span className="tiara-mobile-pill bg-slate-100 px-2.5 py-1 text-slate-600">
                      {statusLabel(profile.status)}
                    </span>
                  </div>
                </div>
              </div>
            </section>

            <section className="mt-4 space-y-3">
              {[
                { label: "ログインID", value: profile.loginId },
                { label: "メールアドレス", value: profile.email },
                { label: "スタッフID", value: profile.userId },
                { label: "最終ログイン", value: formatDateTime(profile.lastLoginAt) },
              ].map((item) => (
                <div key={item.label} className="tiara-mobile-card border px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                    {item.label}
                  </p>
                  <p className="mt-2 break-all text-sm font-semibold text-slate-900">
                    {item.value || "-"}
                  </p>
                </div>
              ))}
            </section>
          </>
        ) : (
          <div className="py-10 text-sm text-slate-500">スタッフ情報を取得できませんでした</div>
        )}
      </div>
    </MobileShell>
  );
}
