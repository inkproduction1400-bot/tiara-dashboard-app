"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChatComposer } from "@/components/mobile/ChatComposer";
import { MessageBubble } from "@/components/mobile/MessageBubble";
import { MobileHeader } from "@/components/mobile/MobileHeader";
import { MobileShell } from "@/components/mobile/MobileShell";
import {
  getAuthSnapshot,
  fetchMobileChatMessages,
  fetchMobileChatRooms,
  markMobileChatRead,
  sendMobileChatMessage,
  type MobileChatMessage,
  type MobileChatRoom,
} from "@/components/mobile/mobileApi";
import {
  connectSocket,
  emitPresenceRoomViewing,
  subscribeSocketMessages,
} from "@/lib/socket";

type ChatDetailPageClientProps = {
  roomId: string;
};

export default function ChatDetailPageClient({
  roomId,
}: ChatDetailPageClientProps) {
  const [rooms, setRooms] = useState<MobileChatRoom[]>([]);
  const [messages, setMessages] = useState<MobileChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  const room = useMemo(
    () => rooms.find((item) => item.id === roomId) ?? null,
    [roomId, rooms],
  );

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const nextRooms = await fetchMobileChatRooms();
      setRooms(nextRooms);
      const target = nextRooms.find((item) => item.id === roomId);
      if (!target) {
        throw new Error("指定のトークが見つかりません");
      }
      const nextMessages = await fetchMobileChatMessages(target.castId);
      setMessages(nextMessages);
      await markMobileChatRead(target.id).catch(() => undefined);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "読み込み失敗");
    } finally {
      setLoading(false);
    }
  }, [roomId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const auth = getAuthSnapshot();
    if (!auth.token) return;

    const activeSocket = connectSocket(auth.token);
    const setViewing = (viewing: boolean) => {
      emitPresenceRoomViewing({ roomId, viewing });
    };

    const handleConnect = () => {
      setViewing(true);
    };

    activeSocket?.on("connect", handleConnect);
    setViewing(true);

    const unsubscribe = subscribeSocketMessages((payload) => {
      if (payload.roomId !== roomId) return;

      setMessages((current) => {
        if (
          payload.messageId &&
          current.some((message) => message.id === payload.messageId)
        ) {
          return current;
        }

        return [
          ...current,
          {
            id: payload.messageId ?? payload.clientMessageId ?? `${payload.roomId}-${payload.createdAt}`,
            from: payload.senderType === "cast" ? "cast" : "staff",
            text: payload.text,
            sentAt: payload.createdAt,
          },
        ];
      });
    });

    return () => {
      setViewing(false);
      activeSocket?.off("connect", handleConnect);
      unsubscribe();
    };
  }, [roomId]);

  const handleSend = async () => {
    if (!room || !draft.trim() || sending) return;

    const text = draft.trim();
    const optimistic: MobileChatMessage = {
      id: `local-${Date.now()}`,
      from: "staff",
      text,
      sentAt: new Date().toISOString(),
    };

    setDraft("");
    setSending(true);
    setMessages((current) => [...current, optimistic]);

    try {
      await sendMobileChatMessage(room.castId, text);
      const nextMessages = await fetchMobileChatMessages(room.castId);
      setMessages(nextMessages);
      await markMobileChatRead(room.id).catch(() => undefined);
    } catch (sendError) {
      setDraft(text);
      setError(sendError instanceof Error ? sendError.message : "送信失敗");
    } finally {
      setSending(false);
    }
  };

  return (
    <MobileShell>
      <MobileHeader
        title={room?.castName ?? "トーク詳細"}
        subtitle={
          room
            ? `${room.castCode} / ${room.shiftStatus} / ${room.assignmentStatus}`
            : "担当情報を読み込み中"
        }
        backHref="/m/chat"
        onRefresh={() => void load()}
      />

      {loading ? (
        <div className="px-4 py-10 text-sm text-slate-500">読み込み中...</div>
      ) : error ? (
        <div className="px-4 py-10 text-sm text-rose-500">{error}</div>
      ) : room ? (
        <>
          <div className="border-b border-slate-100 px-4 pb-4">
            <div className="tiara-mobile-card border px-4 py-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-slate-900">{room.castName}</p>
                  <p className="text-xs text-slate-500">担当 {room.staffName}</p>
                </div>
                <div className="flex flex-wrap justify-end gap-2 text-[11px] font-semibold">
                  <span className="tiara-mobile-pill bg-slate-100 px-2.5 py-1 text-slate-600">
                    {room.shiftStatus}
                  </span>
                  <span className="tiara-mobile-pill bg-[#0b8ef3]/10 px-2.5 py-1 text-[#0b8ef3]">
                    {room.assignmentStatus}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="tiara-mobile-chat-bg flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="flex-1 space-y-4 overflow-y-auto px-4 py-5">
              {messages.map((message) => (
                <MessageBubble key={message.id} message={message} />
              ))}
              <div ref={endRef} />
            </div>
            <ChatComposer
              value={draft}
              onChange={setDraft}
              onSend={() => void handleSend()}
              sending={sending}
            />
          </div>
        </>
      ) : (
        <div className="px-4 py-10 text-sm text-slate-500">
          指定のトークが見つかりません
        </div>
      )}
    </MobileShell>
  );
}
