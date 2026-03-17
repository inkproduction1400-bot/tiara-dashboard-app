"use client";

import { getToken } from "@/lib/device";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { MobileBottomNav } from "./MobileBottomNav";
import { subscribeMobileToast } from "@/lib/mobile-notifications";

type MobileShellProps = {
  children: React.ReactNode;
  withBottomNav?: boolean;
};

export function MobileShell({
  children,
  withBottomNav = true,
}: MobileShellProps) {
  const router = useRouter();
  const [toast, setToast] = useState("");

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
    }
  }, [router]);

  useEffect(() => {
    return subscribeMobileToast((message) => {
      setToast(message);
      window.setTimeout(() => setToast(""), 2800);
    });
  }, []);

  return (
    <div className="min-h-dvh overflow-x-hidden px-3 pb-24 pt-3">
      <div className="mx-auto w-full max-w-[420px] overflow-x-hidden">
        <div className="tiara-mobile-surface min-h-[calc(100dvh-1.5rem)] overflow-x-hidden overflow-y-hidden">
          {children}
        </div>
      </div>
      {withBottomNav ? <MobileBottomNav /> : null}
      {toast ? (
        <div className="tiara-mobile-pill fixed left-1/2 top-4 z-50 max-w-[calc(100vw-2rem)] -translate-x-1/2 truncate bg-slate-900/92 px-4 py-2 text-xs font-semibold text-white shadow-lg">
          {toast}
        </div>
      ) : null}
    </div>
  );
}
