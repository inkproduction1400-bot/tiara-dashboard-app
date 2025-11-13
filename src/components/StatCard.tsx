"use client";

import Link from "next/link";
import clsx from "clsx";
import React from "react";

export type Stat = {
  label: string;
  value: number | string;
  tone?: "ok" | "warn" | "danger";
};

type Props = {
  title: string;
  stats: Stat[];
  className?: string;
  /** カード右上「詳細」ボタン用（不要なら渡さない or showDetail=false） */
  href?: string;
  /** 各行に対応するリンク。undefined の行は通常の div で表示 */
  rowLinks?: (string | undefined)[];
  /** 右上の「詳細」を表示するか（既定: true） */
  showDetail?: boolean;
};

export default function ShortcutCard({
  title,
  stats,
  className,
  href,
  rowLinks,
  showDetail = true,
}: Props) {
  return (
    <article className={clsx("tiara-panel p-4", className)}>
      <header className="mb-3 flex items-center justify-between">
        <h3 className="text-base font-bold">{title}</h3>
        {/* 詳細ボタンは明示的に抑制可能 */}
        {showDetail && href && (
          <Link
            href={href}
            className="text-sm font-semibold text-ink/80 hover:underline"
            aria-label={`${title} の詳細を見る`}
            prefetch={false}
          >
            詳細
          </Link>
        )}
      </header>

      <div className="grid gap-2">
        {stats.map((s, i) => {
          const link = rowLinks?.[i];
          const rowCls = clsx(
            "stat-row",
            s.tone && `stat--${s.tone}`,
            link && "cursor-pointer no-underline"
          );

          const content = (
            <>
              <div className="stat-label text-sm">{s.label}</div>
              <div className="stat-value text-base">{s.value}</div>
            </>
          );

          return link ? (
            <Link key={`${s.label}-${i}`} href={link} className={rowCls} prefetch={false}>
              {content}
            </Link>
          ) : (
            <div key={`${s.label}-${i}`} className={rowCls}>
              {content}
            </div>
          );
        })}
      </div>
    </article>
  );
}
