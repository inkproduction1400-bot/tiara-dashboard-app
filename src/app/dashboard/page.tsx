// src/app/dashboard/page.tsx
import { redirect } from "next/navigation";

export default function DashboardRedirectPage() {
  // ログイン後に一旦 /dashboard に来ても、
  // 実際のスタートページは /casts/today に統一する
  redirect("/casts/today");
}
