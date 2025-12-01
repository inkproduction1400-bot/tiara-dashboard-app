// src/app/chat/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import { useNotifications } from "@/contexts/NotificationsContext";
import clsx from "clsx";

type Staff = {
  id: string;
  name: string;
};

type ChatPreview = {
  id: string;
  castName: string;
  lastMessage: string;
  lastMessageAt: string; // ISO string
  unreadCount: number;
  staffId: string;
  staffName: string;
};

type ChatMessage = {
  id: string;
  from: "staff" | "cast";
  text: string;
  sentAt: string;
};

/**
 * TODO: 後で API から取得する形に差し替え予定。
 * いまは UI 骨格確認用のダミーデータ。
 */
const DUMMY_STAFFS: Staff[] = [
  { id: "s1", name: "北村（本部）" },
  { id: "s2", name: "山本（コーディネーター）" },
  { id: "s3", name: "永井（システム）" },
];

const DUMMY_CHATS: ChatPreview[] = [
  {
    id: "c1",
    castName: "あいり",
    lastMessage: "本日20時入りでお願いします！",
    lastMessageAt: "2025-11-30T18:25:00+09:00",
    unreadCount: 2,
    staffId: "s1",
    staffName: "北村（本部）",
  },
  {
    id: "c2",
    castName: "みゆ",
    lastMessage: "お店到着しました！",
    lastMessageAt: "2025-11-30T18:10:00+09:00",
    unreadCount: 0,
    staffId: "s2",
    staffName: "山本（コーディネーター）",
  },
  {
    id: "c3",
    castName: "ゆな",
    lastMessage: "明日の出勤時間なんですが…",
    lastMessageAt: "2025-11-30T17:45:00+09:00",
    unreadCount: 1,
    staffId: "s1",
    staffName: "北村（本部）",
  },
];

const DUMMY_MESSAGES: ChatMessage[] = [
  {
    id: "m1",
    from: "cast",
    text: "本日20時入りでお願いします！",
    sentAt: "2025-11-30T18:25:00+09:00",
  },
  {
    id: "m2",
    from: "staff",
    text: "了解しました！20時で登録しておきますね。",
    sentAt: "2025-11-30T18:26:00+09:00",
  },
  {
    id: "m3",
    from: "cast",
    text: "ありがとうございます！",
    sentAt: "2025-11-30T18:27:00+09:00",
  },
];

function formatTimeLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const hh = d.getHours().toString().padStart(2, "0");
  const mm = d.getMinutes().toString().padStart(2, "0");
  return `${hh}:${mm}`;
}

function ChatContent() {
  const { markTalkReadAndSync } = useNotifications();

  const [staffFilter, setStaffFilter] = useState<string>("all");
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);

  // 初期表示：担当者フィルタは「すべて」、チャットは先頭
  useEffect(() => {
    if (!selectedChatId && DUMMY_CHATS.length > 0) {
      setSelectedChatId(DUMMY_CHATS[0].id);
    }
  }, [selectedChatId]);

  // 画面表示と同時に未読を既読にする（API側で未読リセット）
  useEffect(() => {
    markTalkReadAndSync().catch(() => {
      // エラーは握りつぶし（通知バッジ更新に失敗しても画面は表示させる）
    });
  }, [markTalkReadAndSync]);

  const filteredChats = useMemo(() => {
    if (staffFilter === "all") return DUMMY_CHATS;
    return DUMMY_CHATS.filter((c) => c.staffId === staffFilter);
  }, [staffFilter]);

  const selectedChat = useMemo(() => {
    if (!selectedChatId) return null;
    return filteredChats.find((c) => c.id === selectedChatId) ?? null;
  }, [filteredChats, selectedChatId]);

  const handleSelectChat = (chatId: string) => {
    setSelectedChatId(chatId);
    // TODO: 会話別の既読処理を入れる場合はここで API 呼び出し
  };

  return (
    <div className="flex flex-col gap-3 h-[calc(100vh-120px)]">
      {/* 上部：担当者フィルタ（左端に配置） */}
      <div className="flex items-center gap-2 justify-start">
        <label className="text-xs text-muted whitespace-nowrap">
          担当者フィルタ
        </label>
        <select
          className="tiara-input h-8 text-xs"
          value={staffFilter}
          onChange={(e) => setStaffFilter(e.target.value)}
        >
          <option value="all">すべての担当者</option>
          {DUMMY_STAFFS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      {/* 下部：一覧 + チャット本体 */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1.7fr)] gap-3 flex-1 min-h-0">
        {/* 左カラム：チャット一覧 */}
        <div className="border rounded-xl bg-background/60 shadow-sm flex flex-col min-h-0">
          <div className="px-3 py-2 border-b text-xs text-muted flex items-center justify-between">
            <span>
              会話一覧{" "}
              <span className="text-[10px] text-muted/80">
                （{filteredChats.length} 件）
              </span>
            </span>
          </div>
          <div className="flex-1 overflow-y-auto">
            {filteredChats.length === 0 ? (
              <div className="p-4 text-xs text-muted">
                該当する会話はありません。
              </div>
            ) : (
              <ul className="divide-y">
                {filteredChats.map((chat) => {
                  const isActive = chat.id === selectedChatId;
                  return (
                    <li key={chat.id}>
                      <button
                        type="button"
                        onClick={() => handleSelectChat(chat.id)}
                        className={clsx(
                          "w-full px-3 py-2.5 text-left flex items-start gap-3 hover:bg-ink/40 transition-colors",
                          isActive && "bg-ink/80",
                        )}
                      >
                        {/* アイコンの代わりに頭文字バッジ */}
                        <div className="mt-0.5">
                          <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center text-[11px] font-semibold text-accent">
                            {chat.castName.slice(0, 2)}
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <div className="text-xs font-semibold truncate">
                                {chat.castName}
                              </div>
                              <div className="text-[10px] text-muted truncate">
                                担当: {chat.staffName}
                              </div>
                            </div>
                            <div className="flex flex-col items-end gap-1">
                              <span className="text-[10px] text-muted">
                                {formatTimeLabel(chat.lastMessageAt)}
                              </span>
                              {chat.unreadCount > 0 && (
                                <span className="inline-flex min-w-[16px] h-[16px] px-1 items-center justify-center rounded-full bg-rose-500 text-[9px] font-semibold text-white leading-none">
                                  {chat.unreadCount > 99
                                    ? "99+"
                                    : chat.unreadCount}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="mt-1 text-[11px] text-muted/90 line-clamp-2">
                            {chat.lastMessage}
                          </div>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* 右カラム：チャット本体 */}
        <div className="border rounded-xl bg-background/60 shadow-sm flex flex-col min-h-0">
          {/* ヘッダー */}
          <div className="px-4 py-2.5 border-b flex items-center justify-between gap-2">
            {selectedChat ? (
              <>
                <div className="min-w-0">
                  <div className="text-xs font-semibold truncate">
                    {selectedChat.castName}
                  </div>
                  <div className="text-[10px] text-muted truncate">
                    担当: {selectedChat.staffName}
                  </div>
                </div>
                <div className="text-[10px] text-muted whitespace-nowrap">
                  {formatTimeLabel(selectedChat.lastMessageAt)} 更新
                </div>
              </>
            ) : (
              <div className="text-xs text-muted">
                会話を選択すると、こちらにチャット内容が表示されます。
              </div>
            )}
          </div>

          {/* メッセージ一覧 */}
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
            {selectedChat ? (
              DUMMY_MESSAGES.map((msg) => {
                const isStaff = msg.from === "staff";
                return (
                  <div
                    key={msg.id}
                    className={clsx(
                      "flex w-full",
                      isStaff ? "justify-end" : "justify-start",
                    )}
                  >
                    <div
                      className={clsx(
                        "max-w-[80%] rounded-2xl px-3 py-1.5 text-xs shadow-sm",
                        isStaff
                          ? "bg-accent text-white rounded-br-sm"
                          : "bg-white text-foreground rounded-bl-sm border",
                      )}
                    >
                      <div className="whitespace-pre-wrap break-words">
                        {msg.text}
                      </div>
                      <div
                        className={clsx(
                          "mt-0.5 text-[9px]",
                          isStaff ? "text-white/80" : "text-muted",
                        )}
                      >
                        {formatTimeLabel(msg.sentAt)}
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-muted">
                左側の一覧から会話を選択してください。
              </div>
            )}
          </div>

          {/* 入力欄（まだ送信機能はナシのダミー） */}
          <div className="border-t px-3 py-2 flex items-center gap-2">
            <input
              type="text"
              className="tiara-input flex-1 h-9 text-xs"
              placeholder={
                selectedChat
                  ? "メッセージを入力して送信（※現段階ではダミー）"
                  : "会話を選択すると入力できます"
              }
              disabled={!selectedChat}
            />
            <button
              type="button"
              className="tiara-btn h-9 px-3 text-xs"
              disabled={!selectedChat}
            >
              送信
            </button>
          </div>
        </div>
      </div>
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
