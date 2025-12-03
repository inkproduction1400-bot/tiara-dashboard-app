// src/app/chat/page.tsx
"use client";

import { useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import clsx from "clsx";

type Staff = {
  id: string;
  name: string;
};

type ChatPreview = {
  id: string;
  castName: string;
  castCode: string;
  age: number;
  genre: string;
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

const DUMMY_STAFFS: Staff[] = [
  { id: "s1", name: "北村（本部）" },
  { id: "s2", name: "山本（コーディネーター）" },
  { id: "s3", name: "永井（システム）" },
];

const GENRES = ["キャバクラ", "スナック", "ガールズバー"] as const;

/**
 * スクロール挙動確認用に 100 件分のダミー会話を生成
 */
const DUMMY_CHATS: ChatPreview[] = Array.from({ length: 100 }, (_, i) => {
  const index = i + 1;
  const staff = DUMMY_STAFFS[i % DUMMY_STAFFS.length];
  const minute = (25 - i + 60) % 60;
  const mm = minute.toString().padStart(2, "0");
  const genre = GENRES[i % GENRES.length];

  return {
    id: `c${index}`,
    castName: `キャスト${index.toString().padStart(3, "0")}`,
    castCode: `T${index.toString().padStart(4, "0")}`,
    age: 20 + (i % 10),
    genre,
    lastMessage:
      index % 3 === 1
        ? "本日20時入りでお願いします！"
        : index % 3 === 2
          ? "お店到着しました！"
          : "明日の出勤時間なんですが…",
    lastMessageAt: `2025-11-30T18:${mm}:00+09:00`,
    unreadCount: index % 5 === 0 ? 3 : index % 4 === 0 ? 1 : 0,
    staffId: staff.id,
    staffName: staff.name,
  };
});

/**
 * デモ用メッセージ（実際は会話ごとにAPIから取得する想定）
 */
const BASE_MESSAGES: ChatMessage[] = [
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

function makeDummyMessages(chat: ChatPreview | null): ChatMessage[] {
  if (!chat) return [];
  return BASE_MESSAGES.map((m, idx) => ({
    ...m,
    id: `${chat.id}-${m.id}`,
    text:
      idx === 0
        ? `${chat.castName} です。${m.text}`
        : idx === 2
          ? `${m.text}`
          : m.text,
  }));
}

function formatTimeLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const hh = d.getHours().toString().padStart(2, "0");
  const mm = d.getMinutes().toString().padStart(2, "0");
  return `${hh}:${mm}`;
}

function ChatContent() {
  const [staffFilter, setStaffFilter] = useState<string>("all");
  const [genreFilter, setGenreFilter] = useState<string>("all");
  const [drinkFilter, setDrinkFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // 初期値として「先頭の会話ID」を選択
  const [selectedChatId, setSelectedChatId] = useState<string | null>(
    DUMMY_CHATS[0]?.id ?? null,
  );

  // 一覧の絞り込み
  const filteredChats = useMemo(() => {
    let list = DUMMY_CHATS;
    if (staffFilter !== "all") {
      list = list.filter((c) => c.staffId === staffFilter);
    }
    if (genreFilter !== "all") {
      list = list.filter((c) => c.genre === genreFilter);
    }
    // drink / status は将来 API 連動時にロジック追加
    return list;
  }, [staffFilter, genreFilter]);

  // 選択中の会話は「全件」から取得（フィルタに影響されない）
  const selectedChat: ChatPreview | null =
    useMemo(
      () => DUMMY_CHATS.find((c) => c.id === selectedChatId) ?? null,
      [selectedChatId],
    ) ?? null;

  const messages = useMemo(
    () => makeDummyMessages(selectedChat),
    [selectedChat],
  );

  const handleSelectChat = (chatId: string) => {
    setSelectedChatId(chatId);
  };

  const handleNewChat = () => {
    // TODO: 新規チャット作成モーダルなどを後で実装
  };

  return (
    <div className="flex flex-col gap-3 h-[calc(100vh-120px)]">
      {/* 上部：新規チャット + 絞り込み（横並び） */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="tiara-btn h-9 px-3 text-xs"
          onClick={handleNewChat}
        >
          新規チャット
        </button>

        <div className="w-32">
          <select
            className="tiara-input h-9 text-xs w-full"
            value={staffFilter}
            onChange={(e) => setStaffFilter(e.target.value)}
          >
            <option value="all">担当者: すべて</option>
            {DUMMY_STAFFS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div className="w-32">
          <select
            className="tiara-input h-9 text-xs w-full"
            value={genreFilter}
            onChange={(e) => setGenreFilter(e.target.value)}
          >
            <option value="all">ジャンル: すべて</option>
            {GENRES.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </div>

        <div className="w-32">
          <select
            className="tiara-input h-9 text-xs w-full"
            value={drinkFilter}
            onChange={(e) => setDrinkFilter(e.target.value)}
          >
            <option value="all">飲酒: すべて</option>
            <option value="ng">NG</option>
            <option value="weak">弱い</option>
            <option value="normal">普通</option>
            <option value="strong">強い</option>
          </select>
        </div>

        <div className="w-32">
          <select
            className="tiara-input h-9 text-xs w-full"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">出勤状態: すべて</option>
            <option value="today">本日出勤</option>
            <option value="today-planned">本日出勤予定</option>
            <option value="absent">未出勤</option>
          </select>
        </div>
      </div>

      {/* 下部：一覧 + チャット本体（左右 1:1） */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 flex-1 min-h-0">
        {/* 左カラム：チャット一覧（2列グリッド＋スクロール） */}
        <div className="border rounded-xl bg-background/60 shadow-sm flex flex-col min-h-0">
          <div className="px-3 py-2 border-b text-xs text-muted flex items-center justify-between">
            <span>
              会話一覧{" "}
              <span className="text-[10px] text-muted/80">
                （{filteredChats.length} 件）
              </span>
            </span>
          </div>
          <div className="flex-1 overflow-y-auto pr-1">
            {filteredChats.length === 0 ? (
              <div className="p-4 text-xs text-muted">
                該当する会話はありません。
              </div>
            ) : (
              <div className="p-2">
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-2">
                  {filteredChats.map((chat) => {
                    const isActive = chat.id === selectedChatId;
                    return (
                      <button
                        key={chat.id}
                        type="button"
                        onClick={() => handleSelectChat(chat.id)}
                        className={clsx(
                          "w-full text-left rounded-lg border bg-white/70 px-3 py-2.5 flex items-start gap-3 hover:bg-ink/40 transition-colors",
                          isActive && "border-accent bg-ink/80",
                        )}
                      >
                        <div className="mt-0.5">
                          <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center text-[11px] font-semibold text-accent">
                            {chat.castName.slice(0, 2)}
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items=center justify-between gap-2">
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
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 右カラム：チャット本体（LINE 風） */}
        <div className="border rounded-xl bg-background/60 shadow-sm flex flex-col min-h-0">
          {/* 固定ヘッダー：プロフィール＋タイトル */}
          <div className="px-4 py-3 border-b flex items-center justify-between gap-3">
            {selectedChat ? (
              <>
                <div className="flex items-center gap-3 min-w-0">
                  {/* プロフィール写真（ダミー：イニシャル） */}
                  <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center text-[12px] font-semibold text-accent flex-shrink-0">
                    {selectedChat.castName.slice(0, 2)}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="text-sm font-semibold truncate">
                        {selectedChat.castName}
                      </div>
                      <span className="text-[11px] text-muted shrink-0">
                        ID: {selectedChat.castCode}
                      </span>
                    </div>
                    <div className="mt-0.5 text-[11px] text-muted truncate">
                      年齢: {selectedChat.age}歳　/　ジャンル:{" "}
                      {selectedChat.genre}
                    </div>
                  </div>
                </div>
                <div className="text-[10px] text-muted whitespace-nowrap text-right">
                  {formatTimeLabel(selectedChat.lastMessageAt)} 更新
                  <br />
                  担当: {selectedChat.staffName}
                </div>
              </>
            ) : (
              <div className="text-xs text-muted">
                左側の一覧から会話を選択すると、こちらにチャット内容が表示されます。
              </div>
            )}
          </div>

          {/* メッセージリスト（LINE風 吹き出し） */}
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2 bg-gradient-to-b from-transparent to-white/40">
            {selectedChat && messages.length > 0 ? (
              messages.map((msg) => {
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
                        "max-w-[80%] rounded-2xl px-3 py-2 text-xs shadow-sm",
                        isStaff
                          ? "bg-accent text-white rounded-br-sm"
                          : "bg-white text-foreground rounded-bl-sm border border-ink/70",
                      )}
                    >
                      <div className="whitespace-pre-wrap break-words leading-relaxed">
                        {msg.text}
                      </div>
                      <div
                        className={clsx(
                          "mt-1 text-[9px] flex items-center justify-end gap-1",
                          isStaff ? "text-white/80" : "text-muted",
                        )}
                      >
                        <span>{formatTimeLabel(msg.sentAt)}</span>
                        {isStaff && <span>既読</span>}
                      </div>
                    </div>
                  </div>
                );
              })
            ) : selectedChat ? (
              <div className="h-full flex items-center justify-center text-xs text-muted">
                まだメッセージはありません。下の入力欄から送信できます。
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-muted">
                左側の一覧から会話を選択してください。
              </div>
            )}
          </div>

          {/* 入力欄（ダミー） */}
          <div className="border-t px-3 py-2 flex items-center gap-2 bg-white/60 backdrop-blur-sm">
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
