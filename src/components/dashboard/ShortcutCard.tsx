'use client';
import React from 'react';
import Link from 'next/link';
import { GripVertical, Pencil, Trash2 } from 'lucide-react';

type Props = {
  label: string;
  href: string;
  icon: React.ReactNode;
  onEdit?: () => void;
  onDelete?: () => void;
  dragHandleProps?: React.HTMLAttributes<HTMLButtonElement>;
  badgeClass?: string;
};

export default function ShortcutCard({
  label, href, icon, onEdit, onDelete, dragHandleProps, badgeClass,
}: Props) {
  return (
    <div
      className={[
        'group relative rounded-2xl transition-shadow',
        'border bg-white text-zinc-900 backdrop-blur',
        'border-zinc-200 shadow-sm hover:shadow-md',
        'dark:border-white/10 dark:bg-white/5 dark:text-white',
        'min-h-[160px] md:min-h-[180px] p-4 md:p-4',
      ].join(' ')}
    >
      {/* 操作パーツ：色はCSS変数で強制（SVGはcurrentColorで追従） */}
      <div
        className="absolute right-3 top-3 z-10 flex gap-1"
        style={{ color: 'var(--shortcut-actions-color)' }}
      >
        <button
          aria-label="Drag handle"
          className="p-2 md:p-1 rounded hover:bg-black/5 dark:hover:bg-white/10 cursor-grab active:cursor-grabbing"
          {...dragHandleProps}
          type="button"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        {onEdit && (
          <button
            aria-label="Edit"
            className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/10"
            onClick={onEdit}
            type="button"
          >
            <Pencil className="h-4 w-4" />
          </button>
        )}
        {onDelete && (
          <button
            aria-label="Delete"
            className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/10"
            onClick={onDelete}
            type="button"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* 本体：上下センターにアイコン→ラベル */}
      <Link
        href={href}
        prefetch={false}
        className="flex h-full flex-col items-center justify-center translate-y-3 md:translate-y-4 gap-3 md:gap-3 pt-2 md:pt-3 pb-1 md:pb-2 gap-3 gap-3 rounded-xl py-5 focus:outline-none focus:ring-2 focus:ring-blue-400 pb-4 md:pb-6"
      >
        <div
          className={[
            'rounded-2xl p-5 text-white shadow ring-1 ring-black/5 dark:ring-white/10 transition-transform',
            'group-hover:scale-[1.02]',
            badgeClass ?? 'bg-zinc-600',
          ].join(' ')}
        >
          {icon}
        </div>

        {/* ラベル：CSS変数で強制（ライト=黒 / ダーク=白） */}
        <div className="text-[15px] font-semibold" style={{ color: 'var(--shortcut-label-color)' }}>
          {label}
        </div>
      </Link>
    </div>
  );
}
