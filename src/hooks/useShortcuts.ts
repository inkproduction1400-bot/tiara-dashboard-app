'use client';
import { useEffect, useState } from 'react';
import type { Shortcut } from '@/types/shortcut';
import { localShortcutsStorage, type ShortcutsStorage } from '@/lib/shortcutsStorage';

type Options = {
  userId: string;
  defaults: Shortcut[];
  storage?: ShortcutsStorage;
};

export function useShortcuts({ userId, defaults, storage = localShortcutsStorage }: Options) {
  const [items, setItems] = useState<Shortcut[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    storage.load(userId).then(stored => {
      const base = (stored?.length ? stored : defaults).map((s, i) => ({ ...s, order: i }));
      setItems(base);
      setLoaded(true);
    });
  }, [userId, storage, defaults]);

  const persist = async (next: Shortcut[]) => {
    setItems(next);
    await storage.save(userId, next.map((s, i) => ({ ...s, order: i })));
  };

  const reorder = async (from: number, to: number) => {
    const arr = [...items];
    const [moved] = arr.splice(from, 1);
    arr.splice(to, 0, moved);
    await persist(arr);
  };

  const add = async (s: Shortcut) => {
    const arr = [...items, { ...s, order: items.length }];
    await persist(arr);
  };

  const update = async (id: string, patch: Partial<Shortcut>) => {
    const arr = items.map(s => (s.id === id ? { ...s, ...patch } : s));
    await persist(arr);
  };

  const remove = async (id: string) => {
    const arr = items.filter(s => s.id !== id).map((s, i) => ({ ...s, order: i }));
    await persist(arr);
  };

  const reset = async () => {
    const base = defaults.map((s, i) => ({ ...s, order: i }));
    setItems(base);
    await storage.reset(userId);
  };

  return { items, loaded, reorder, add, update, remove, reset };
}
