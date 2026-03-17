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
    <div className="min-h-dvh w-full max-w-full overflow-x-clip px-3 pb-24 pt-3">
      <div className="mx-auto w-full min-w-0 max-w-[420px] overflow-x-clip">
        <div className="tiara-mobile-surface min-h-[calc(100dvh-1.5rem)] w-full min-w-0 max-w-full overflow-x-clip overflow-y-hidden">
          {children}
        </div>
      </div>
      {withBottomNav ? <MobileBottomNav /> : null}
      {toast ? (
        <div className="tiara-mobile-pill fixed left-1/2 top-4 z-50 box-border w-[calc(100%-2rem)] max-w-[360px] -translate-x-1/2 truncate bg-slate-900/92 px-4 py-2 text-center text-xs font-semibold text-white shadow-lg">
          {toast}
        </div>
      ) : null}
    </div>
  );
}
