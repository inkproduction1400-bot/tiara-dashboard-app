import type { Shortcut } from '@/types/shortcut';

const NS = 'tiara.shortcuts:v1';
const key = (userId: string) => `${NS}:${userId}`;

export interface ShortcutsStorage {
  load(userId: string): Promise<Shortcut[]>;
  save(userId: string, items: Shortcut[]): Promise<void>;
  reset(userId: string): Promise<void>;
}

export const localShortcutsStorage: ShortcutsStorage = {
  async load(userId) {
    try {
      const raw = localStorage.getItem(key(userId));
      if (!raw) return [];
      return JSON.parse(raw) as Shortcut[];
    } catch {
      return [];
    }
  },
  async save(userId, items) {
    localStorage.setItem(key(userId), JSON.stringify(items));
  },
  async reset(userId) {
    localStorage.removeItem(key(userId));
  },
};
