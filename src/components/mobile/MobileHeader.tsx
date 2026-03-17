"use client";

import { ArrowLeft, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";

type MobileHeaderProps = {
  title: string;
  subtitle?: string;
  backHref?: string;
  onRefresh?: () => void;
  actionLabel?: string;
};

export function MobileHeader({
  title,
  subtitle,
  backHref,
  onRefresh,
  actionLabel = "更新",
}: MobileHeaderProps) {
  const router = useRouter();

  return (
    <header className="sticky top-0 z-20 flex items-center gap-3 bg-white/85 px-4 pb-3 pt-6 backdrop-blur">
      {backHref ? (
        <button
          type="button"
          onClick={() => router.push(backHref)}
          className="tiara-mobile-pill flex h-11 w-11 items-center justify-center bg-slate-100 text-slate-700"
          aria-label="戻る"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
      ) : (
        <div className="h-11 w-11" />
      )}

      <div className="min-w-0 flex-1">
        <h1 className="truncate text-[22px] font-bold tracking-[-0.02em] text-slate-900">
          {title}
        </h1>
        {subtitle ? (
          <p className="truncate text-xs font-medium text-slate-500">{subtitle}</p>
        ) : null}
      </div>

      {onRefresh ? (
        <button
          type="button"
          onClick={onRefresh}
          className="tiara-mobile-pill flex h-11 items-center gap-2 bg-[#0b8ef3]/10 px-3 text-sm font-semibold text-[#0b8ef3]"
        >
          <RefreshCw className="h-4 w-4" />
          <span>{actionLabel}</span>
        </button>
      ) : (
        <div className="h-11 w-11" />
      )}
    </header>
  );
}
