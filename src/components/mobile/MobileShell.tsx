"use client";

import { getToken } from "@/lib/device";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { MobileBottomNav } from "./MobileBottomNav";
import { subscribeMobileToast } from "@/lib/mobile-notifications";
import clsx from "clsx";

type MobileShellProps = {
  children: React.ReactNode;
  withBottomNav?: boolean;
  edgeToEdge?: boolean;
};

export function MobileShell({
  children,
  withBottomNav = true,
  edgeToEdge = false,
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
    <div
      className={clsx(
        "min-h-dvh w-full max-w-full overflow-x-hidden pb-24",
        edgeToEdge ? "pt-0" : "px-3 pt-3",
      )}
    >
      <div
        className={clsx(
          "mx-auto w-full min-w-0 max-w-full overflow-x-hidden",
          edgeToEdge ? "max-w-full" : "max-w-[420px]",
        )}
      >
        <div
          className={clsx(
            "min-h-dvh w-full min-w-0 max-w-full overflow-x-hidden overflow-y-hidden",
            edgeToEdge
              ? "bg-white"
              : "tiara-mobile-surface min-h-[calc(100dvh-1.5rem)]",
          )}
        >
          {children}
        </div>
      </div>
      {withBottomNav ? <MobileBottomNav /> : null}
      {toast ? (
        <div className="fixed inset-x-0 top-4 z-50 flex w-full max-w-full justify-center overflow-x-hidden px-4">
          <div className="tiara-mobile-pill box-border w-full max-w-[360px] truncate bg-slate-900/92 px-4 py-2 text-center text-xs font-semibold text-white shadow-lg">
            {toast}
          </div>
        </div>
      ) : null}
    </div>
  );
}
