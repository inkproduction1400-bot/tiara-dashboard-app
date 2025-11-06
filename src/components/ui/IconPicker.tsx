'use client';
import React from 'react';
import {
  Home,
  Users,
  ClipboardList,
  ListChecks,
  Calendar,
  Building2,
  Box,
  Car,
  MessageSquare,
  Phone,
  BadgeCheck,
  Settings,
} from 'lucide-react';

export type IconName =
  | 'Home'
  | 'Users'
  | 'ClipboardList'
  | 'ListChecks'
  | 'Calendar'
  | 'Building2'
  | 'Box'
  | 'Car'
  | 'MessageSquare'
  | 'Phone'
  | 'BadgeCheck'
  | 'Settings';

const iconSet = {
  Home,
  Users,
  ClipboardList,
  ListChecks,
  Calendar,
  Building2,
  Box,
  Car,
  MessageSquare,
  Phone,
  BadgeCheck,
  Settings,
} as const;

// 日本語ラベル（サイドメニュー相当）
export const iconLabels: Record<IconName, string> = {
  Home: 'ホーム',
  Users: 'キャスト管理',
  ClipboardList: 'リクエスト店舗',
  ListChecks: '割当確認',
  Calendar: 'スケジュール',
  Building2: '店舗管理',
  Box: '備品管理',
  Car: '送迎管理',
  MessageSquare: 'チャット',
  Phone: 'SOS',
  BadgeCheck: '申請・承認',
  Settings: '設定',
};

export function renderIcon(name: IconName, className = 'h-6 w-6') {
  const Icon = iconSet[name] ?? Home;
  return <Icon className={className} />;
}

export function IconPicker({
  value,
  onChange,
}: {
  value: IconName;
  onChange: (v: IconName) => void;
}) {
  const keys = Object.keys(iconSet) as IconName[];
  return (
    <div className="grid grid-cols-4 gap-3 md:grid-cols-5">
      {keys.map((k) => (
        <button
          key={k}
          onClick={() => onChange(k)}
          className={`flex flex-col items-center justify-center rounded-lg border p-2 text-sm transition
            ${
              value === k
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/40 text-blue-600'
                : 'border-zinc-300 hover:border-zinc-400 dark:border-zinc-700 dark:hover:border-zinc-600'
            }`}
          aria-pressed={value === k}
        >
          {renderIcon(k, 'h-6 w-6 mb-1')}
          <span className="text-xs">{iconLabels[k]}</span>
        </button>
      ))}
    </div>
  );
}
