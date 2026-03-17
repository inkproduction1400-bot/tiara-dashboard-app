"use client";

import type { MobileChatMessage } from "./mobileApi";

type MessageBubbleProps = {
  message: MobileChatMessage;
};

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isStaff = message.from === "staff";

  return (
    <div className={`flex ${isStaff ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[85%] ${isStaff ? "items-end" : "items-start"} flex flex-col gap-1`}>
        <div
          className={`tiara-mobile-bubble max-w-full break-words px-4 py-3 text-sm leading-relaxed shadow-sm ${
            isStaff
              ? "tiara-mobile-bubble--staff bg-[#0b8ef3] text-white"
              : "tiara-mobile-bubble--cast border border-slate-200 bg-white text-slate-800"
          }`}
        >
          {message.text}
        </div>
        <div className="flex items-center gap-1 px-1 text-[10px] font-medium text-slate-400">
          <span>{formatTime(message.sentAt)}</span>
          {isStaff && message.read ? <span>既読</span> : null}
        </div>
      </div>
    </div>
  );
}
