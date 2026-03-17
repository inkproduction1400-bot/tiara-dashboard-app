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

    void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      return undefined;
    });
  }, []);

  useEffect(() => {
    if (!pathname?.startsWith("/m")) return;
    if (!isCurrentPhoneDevice()) return;
    void requestNotificationPermission();
  }, [pathname]);

  return null;
}
