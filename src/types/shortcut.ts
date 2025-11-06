export type Shortcut = {
  id: string;
  label: string;
  href: string;
  icon: string;      // lucide-react のアイコン名
  pinned?: boolean;  // 将来用：固定（並び替え対象外）
  order?: number;    // 並び順（0-based）
  createdAt?: string;
  updatedAt?: string;
};
