// src/app/chat/page.tsx
import { Suspense } from "react";
import ChatPageClient from "./ChatPageClient";

export default function Page() {
  return (
    <Suspense fallback={<div className="p-4 text-xs text-muted">Loading...</div>}>
      <ChatPageClient />
    </Suspense>
  );
}
