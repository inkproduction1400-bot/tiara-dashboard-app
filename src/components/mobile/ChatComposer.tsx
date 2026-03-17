"use client";

import { Send } from "lucide-react";

type ChatComposerProps = {
  value: string;
  disabled?: boolean;
  sending?: boolean;
  onChange: (value: string) => void;
  onSend: () => void;
};

export function ChatComposer({
  value,
  disabled = false,
  sending = false,
  onChange,
  onSend,
}: ChatComposerProps) {
  return (
    <footer className="border-t border-slate-200 bg-white px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="tiara-mobile-pill flex-1 bg-slate-100 px-4 py-3">
          <input
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                event.preventDefault();
                onSend();
              }
            }}
            disabled={disabled || sending}
            placeholder="業務メッセージを入力"
            className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
          />
        </div>
        <button
          type="button"
          onClick={onSend}
          disabled={disabled || sending || !value.trim()}
          className="tiara-mobile-pill flex h-12 w-12 items-center justify-center bg-[#0b8ef3] text-white shadow-[0_10px_24px_rgba(11,142,243,0.24)] disabled:opacity-50"
          aria-label="送信"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </footer>
  );
}
