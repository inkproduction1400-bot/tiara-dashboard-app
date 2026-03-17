"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { isCurrentPhoneDevice } from "@/lib/mobile-device";
import { requestNotificationPermission } from "@/lib/mobile-notifications";

export function PwaBootstrap() {
  const pathname = usePathname();

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    // 白画面復旧のため一時的に Service Worker を停止する。
    // 既存 SW が古い bundle / cache を掴んだまま再登録されると、
    // ログイン後も壊れたアセットを返し続けるため、起動時に全解除する。
    void (async () => {
      try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((registration) => registration.unregister()));
      } catch {
        return;
      }

      if (!("caches" in window)) return;

      try {
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
      } catch {
        return;
      }
    })();
  }, []);

  useEffect(() => {
    if (!pathname?.startsWith("/m")) return;
    if (!isCurrentPhoneDevice()) return;
    void requestNotificationPermission();
  }, [pathname]);

  return null;
}
