// src/app/chat/page.tsx
"use client";

import { useEffect } from "react";
import AppShell from "@/components/AppShell";
import { useNotifications } from "@/contexts/NotificationsContext";

function ChatContent() {
  const { markTalkReadAndSync } = useNotifications();

  useEffect(() => {
    // 画面表示と同時に未読を既読にする
    markTalkReadAndSync().catch(() => {
      // エラーは握りつぶし（通知バッジ更新に失敗しても画面は表示させる）
    });
  }, [markTalkReadAndSync]);

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        チャット機能は現在準備中です。今後、キャストとのトーク履歴や送受信を
        ここから管理できるようになります。
      </p>
      <p className="text-xs text-muted">
        ※ トーク画面を開いたタイミングで、未読通知は既読として処理されています。
      </p>
    </div>
  );
}

export default function ChatPage() {
  return (
    <AppShell>
      <ChatContent />
    </AppShell>
  );
}
