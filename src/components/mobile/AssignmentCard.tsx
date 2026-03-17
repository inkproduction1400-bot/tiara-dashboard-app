"use client";

import type { MobileAssignmentCardData } from "./mobileApi";

type AssignmentCardProps = {
  item: MobileAssignmentCardData;
};

export function AssignmentCard({ item }: AssignmentCardProps) {
  return (
    <article className="tiara-mobile-card border px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#0b8ef3]">
            {item.orderLabel}
          </p>
          <h3 className="mt-1 text-base font-bold text-slate-900">{item.shopName}</h3>
          <p className="text-xs text-slate-500">店舗番号 {item.shopNumber}</p>
        </div>
        <div className="tiara-mobile-pill bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
          {item.date}
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div className="tiara-mobile-soft bg-slate-50 px-3 py-3">
          <dt className="text-xs text-slate-500">入店時間</dt>
          <dd className="mt-1 font-semibold text-slate-900">{item.startTime}</dd>
        </div>
        <div className="tiara-mobile-soft bg-slate-50 px-3 py-3">
          <dt className="text-xs text-slate-500">必要人数</dt>
          <dd className="mt-1 font-semibold text-slate-900">{item.requiredCount}名</dd>
        </div>
        <div className="tiara-mobile-soft bg-slate-50 px-3 py-3">
          <dt className="text-xs text-slate-500">割当済人数</dt>
          <dd className="mt-1 font-semibold text-slate-900">{item.assignedCount}名</dd>
        </div>
        <div className="tiara-mobile-soft bg-slate-50 px-3 py-3">
          <dt className="text-xs text-slate-500">キャスト名</dt>
          <dd className="mt-1 font-semibold text-slate-900">
            {item.castNames.length > 0 ? item.castNames.join("、") : "未割当"}
          </dd>
        </div>
      </dl>

      <div className="tiara-mobile-soft mt-4 bg-[#0b8ef3]/7 px-3 py-3">
        <p className="text-xs text-slate-500">備考</p>
        <p className="mt-1 text-sm text-slate-700">
          {item.note || "備考はありません"}
        </p>
      </div>
    </article>
  );
}
