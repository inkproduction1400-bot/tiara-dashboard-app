'use client';
import React, { useEffect, useMemo, useState } from 'react';
import { IconPicker, type IconName, iconLabels } from '@/components/ui/IconPicker';
import { X } from 'lucide-react';

// アイコン -> 既定リンク（サイドメニューに準拠）
const iconToHref: Record<IconName, string> = {
  Home: '/dashboard',
  Users: '/casts',
  ClipboardList: '/requests',
  ListChecks: '/assignments',
  Calendar: '/schedule',
  Building2: '/shops',
  Box: '/assets',
  Car: '/rides',
  MessageSquare: '/chat',
  Phone: '/sos',
  BadgeCheck: '/approvals',
  Settings: '/settings',
};

type Props = {
  open: boolean;
  initial?: { label: string; href: string; icon: IconName };
  onClose: () => void;
  onSubmit: (data: { label: string; href: string; icon: IconName }) => void;
};

export default function ShortcutEditorModal({ open, initial, onClose, onSubmit }: Props) {
  const [label, setLabel] = useState('');
  const [icon, setIcon] = useState<IconName>('Home');

  // 選択アイコンに応じてリンクを自動決定
  const href = useMemo(() => iconToHref[icon] ?? '/dashboard', [icon]);

  useEffect(() => {
    if (open) {
      setLabel(initial?.label ?? '');
      setIcon(initial?.icon ?? 'Home');
    }
  }, [open, initial]);

  if (!open) return null;

  const canSave = label.trim().length > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div className="relative w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-6 shadow-2xl text-zinc-900">
        {/* Close */}
        <button
          aria-label="閉じる"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700"
        >
          <X className="h-5 w-5" />
        </button>

        <h2 className="mb-4 text-lg font-semibold text-center">
          ショートカット{initial ? 'を編集' : 'を追加'}
        </h2>

        <div className="space-y-4">
          {/* ラベル（必須） */}
          <label className="block">
            <span className="text-sm text-zinc-600">ラベル（必須）</span>
            <input
              className="mt-1 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900
                         placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={`例）${iconLabels[icon]}`}
            />
          </label>

          {/* アイコン（選択すると href が自動更新） */}
          <div>
            <span className="text-sm text-zinc-600">アイコン（リンク自動設定）</span>
            <div className="mt-2">
              <IconPicker value={icon} onChange={setIcon} />
            </div>
          </div>

          {/* 自動設定されたリンクの読み取り表示 */}
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
            <span className="mr-2 font-medium">リンク</span>
            <code className="rounded bg-white px-2 py-0.5 text-zinc-900 border border-zinc-200">
              {href}
            </code>
            <span className="ml-2 text-xs text-zinc-500">(アイコン変更で自動更新)</span>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            キャンセル
          </button>
          <button
            onClick={() => onSubmit({ label: label.trim(), href, icon })}
            disabled={!canSave}
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
