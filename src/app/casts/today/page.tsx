// src/app/casts/today/page.tsx
import TodayPageClient from "./TodayPageClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function Page() {
  return <TodayPageClient />;
}
