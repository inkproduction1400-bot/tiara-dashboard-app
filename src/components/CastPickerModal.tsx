// src/components/CastPickerModal.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import {
  CastListItem,
  listCastsForPicker,
} from "@/lib/api.casts";

export type CastPickerTarget = "ng" | "fixed";

export type CastPickerModalProps = {
  open: boolean;
  target: CastPickerTarget | null;
  initialSelectedIds: string[]; // 既存 NG / 専属キャストの userId 一覧
  onClose: () => void;
  onApply: (selectedIds: string[]) => void;
};

export default function CastPickerModal({
  open,
  target,
  initialSelectedIds,
  onClose,
  onApply,
}: CastPickerModalProps) {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<CastListItem[]>([]);
  const [selectedIds, setSelectedIds] =
    useState<string[]>(initialSelectedIds);
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState<"name" | "age" | "no">("name");

  useEffect(() => {
    setSelectedIds(initialSelectedIds);
  }, [initialSelectedIds, open]);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    listCastsForPicker({ q, limit: 200 })
      .then((res) => {
        setItems(res.items);
      })
      .finally(() => setLoading(false));
  }, [open, q]);

  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => {
      if (sortKey === "name") {
        const an = (a.displayName ?? "").toString();
        const bn = (b.displayName ?? "").toString();
        return an.localeCompare(bn, "ja");
      }
      if (sortKey === "no") {
        const an = (a.managementNumber ?? "").toString();
        const bn = (b.managementNumber ?? "").toString();
        return an.localeCompare(bn, "ja");
      }
      // age
      const aa = a.age ?? 0;
      const bb = b.age ?? 0;
      return aa - bb;
    });
  }, [items, sortKey]);

  const toggle = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  if (!open || !target) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white w-full max-w-3xl rounded-xl shadow-lg flex flex-col max-h-[90vh]">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <div className="font-semibold text-sm">
            {target === "ng" ? "NGキャスト選択" : "専属指名キャスト選択"}
          </div>
          <button
            type="button"
            className="text-xs text-gray-500 hover:text-gray-700"
            onClick={onClose}
          >
            閉じる
          </button>
        </div>

        <div className="px-4 py-3 border-b flex flex-wrap gap-3 items-center">
          <input
            className="tiara-input w-full sm:w-60"
            placeholder="名前・番号で絞り込み"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <div className="flex items-center gap-2 text-xs">
            <span className="text-gray-500">並び替え:</span>
            <select
              className="tiara-select"
              value={sortKey}
              onChange={(e) =>
                setSortKey(e.target.value as "name" | "age" | "no")
              }
            >
              <option value="name">名前順</option>
              <option value="age">年齢順</option>
              <option value="no">キャスト番号順</option>
            </select>
          </div>
        </div>

        <div className="flex-1 overflow-auto px-4 py-2">
          {loading && (
            <div className="text-xs text-gray-500 py-4">読み込み中...</div>
          )}
          {!loading && (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-gray-500">
                  <th className="text-left py-1 px-2">選択</th>
                  <th className="text-left py-1 px-2">キャスト名</th>
                  <th className="text-left py-1 px-2">年齢</th>
                  <th className="text-left py-1 px-2">キャスト番号</th>
                </tr>
              </thead>
              <tbody>
                {sortedItems.map((c) => (
                  <tr key={c.userId} className="border-b last:border-b-0">
                    <td className="py-1 px-2">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(c.userId)}
                        onChange={() => toggle(c.userId)}
                      />
                    </td>
                    <td className="py-1 px-2">{c.displayName ?? "-"}</td>
                    <td className="py-1 px-2">{c.age ?? "-"}</td>
                    <td className="py-1 px-2 font-mono">
                      {c.managementNumber ?? "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="px-4 py-3 border-t flex justify-end gap-2">
          <button
            type="button"
            className="tiara-btn-sub"
            onClick={onClose}
          >
            キャンセル
          </button>
          <button
            type="button"
            className={clsx(
              "tiara-btn-main",
              selectedIds.length === 0 && "opacity-70",
            )}
            onClick={() => onApply(selectedIds)}
          >
            この内容で保存
          </button>
        </div>
      </div>
    </div>
  );
}
