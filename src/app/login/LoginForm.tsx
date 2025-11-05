"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import OtpDialog from "./OtpDialog";
import { getDeviceId, saveToken } from "@/lib/device";
import { login, verifyChallenge } from "@/lib/api";

const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "1";

export default function LoginForm() {
  const router = useRouter();
  const [uid, setUid] = useState("");
  const [pw, setPw] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [otpOpen, setOtpOpen] = useState(false);
  const [txId, setTxId] = useState<string | null>(null);

  useEffect(() => {
    setTimeout(() => {
      document.getElementById("tiara-loading")?.remove();
      document.getElementById("tiara-title")?.classList.remove("invisible");
      document.getElementById("tiara-subtitle")?.classList.remove("invisible");
      const p = document.getElementById("tiara-panel");
      p?.classList.remove("opacity-0", "translate-y-2");
    }, 800);
  }, []);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!uid || !pw) { setErr("ID とパスワードを入力してください"); return; }
    setLoading(true);

    const device_id = getDeviceId();

    try {
      if (DEMO_MODE) {
        const first = !localStorage.getItem("demo_device_verified");
        if (first) { setTxId("demo-tx"); setOtpOpen(true); return; }
        router.replace("/dashboard"); return;
      }

      const res = await login(uid, pw, device_id);
      if (res.status === "ok") { saveToken(res.token); router.replace("/dashboard"); return; }
      if (res.status === "challenge") { setTxId(res.tx_id); setOtpOpen(true); return; }
      if (res.status === "denied") { setErr("この端末は未許可です。管理者の承認をお待ちください。"); return; }
      setErr("不明な応答です");
    } catch (ex: any) {
      setErr(ex?.message ?? "ログインに失敗しました");
    } finally {
      setLoading(false);
    }
  }

  async function handleOtp(code: string) {
    const device_id = getDeviceId();

    if (DEMO_MODE) {
      localStorage.setItem("demo_device_verified", "1");
      setOtpOpen(false); setLoading(false); router.replace("/dashboard"); return;
    }

    try {
      if (!txId) throw new Error("tx_id が取得できていません");
      const v = await verifyChallenge(txId, code, device_id);
      saveToken(v.token); setOtpOpen(false); router.replace("/dashboard");
    } catch (ex: any) {
      setErr(ex?.message ?? "確認コードが正しくありません");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <form onSubmit={handleLogin} className="grid gap-3" autoComplete="on">
        <div className="grid grid-cols-1 sm:grid-cols-[120px_1fr] items-center gap-3">
          <label className="font-bold tracking-wide text-indigo-200">ユーザーID</label>
          <input
            className="tiara-input"
            placeholder="例）admin"
            value={uid}
            onChange={(e) => setUid(e.target.value)}
            autoComplete="username"
            inputMode="email"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-[120px_1fr] items-center gap-3">
          <label className="font-bold tracking-wide text-indigo-200">パスワード</label>
          <input
            className="tiara-input"
            type="password"
            placeholder="••••••••"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            autoComplete="current-password"
          />
        </div>

        <div className="sm:col-start-2">
          <p className="text-xs text-muted">デモ：任意のID/パスワードでログインできます</p>
          {err && <p className="mt-1 text-xs text-rose-200">{err}</p>}
          <div className="mt-2 flex justify-end">
            <button className="tiara-btn" disabled={loading}>
              {loading ? "認証中..." : "ログイン"}
            </button>
          </div>
        </div>
      </form>

      <OtpDialog
        open={otpOpen}
        onClose={() => { setOtpOpen(false); setLoading(false); }}
        onSubmit={handleOtp}
      />
    </>
  );
}
