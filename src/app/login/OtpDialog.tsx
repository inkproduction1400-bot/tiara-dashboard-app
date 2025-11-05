"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  onSubmit: (code: string) => Promise<void> | void;
};

export default function OtpDialog({ open, onClose, onSubmit }: Props) {
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setCode(""); setErr(null);
      setTimeout(() => ref.current?.focus(), 0);
    }
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/45 grid place-items-center z-50" role="dialog" aria-modal>
      <div className="tiara-panel w-[92vw] max-w-[420px] p-5">
        <h3 className="font-black text-lg mb-2">端末確認コード</h3>
        <p className="text-sm text-muted mb-3">この端末は初回利用です。メールの6桁コードを入力してください。</p>
        <div className="flex gap-2">
          <input
            ref={ref}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="123456"
            inputMode="numeric"
            maxLength={6}
            className="tiara-input"
            aria-label="確認コード"
          />
          <button
            className="tiara-btn"
            onClick={async () => {
              if (!code || code.length < 4) { setErr("コードを入力してください"); return; }
              setErr(null);
              await onSubmit(code);
            }}
          >送信</button>
        </div>
        {err && <p className="text-xs text-red-300 mt-2">{err}</p>}
        <button className="mt-3 text-xs text-muted underline" onClick={onClose}>キャンセル</button>
      </div>
    </div>
  );
}
