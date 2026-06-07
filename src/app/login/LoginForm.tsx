// src/app/login/LoginForm.tsx
"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import OtpDialog from "./OtpDialog";
import { clearAuth, getDeviceId, saveToken } from "@/lib/device";
import { changeDashboardPassword, login, verifyChallenge } from "@/lib/api";
import { isCurrentPhoneDevice } from "@/lib/mobile-device";

// ⬇ デモ判定を api.ts と同じ環境変数名に統一
const DEMO = process.env.NEXT_PUBLIC_DEMO_LOGIN === "1";

function resolvePostLoginPath() {
  return isCurrentPhoneDevice() ? "/m/chat" : "/dashboard";
}

export default function LoginForm() {
  const router = useRouter();
  const [uid, setUid] = useState("");
  const [pw, setPw] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [otpOpen, setOtpOpen] = useState(false);
  const [txId, setTxId] = useState<string | null>(null);
  const [passwordChangeOpen, setPasswordChangeOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");
  const [passwordChangeLoading, setPasswordChangeLoading] = useState(false);

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
    if (!uid || !pw) {
      setErr("ID とパスワードを入力してください");
      return;
    }
    setLoading(true);
    clearAuth();
    const device_id = getDeviceId();

    try {
      // ---- デモモード：即時成功（トークン保存して遷移）----
      if (DEMO) {
        saveToken("demo-token");
        router.replace(resolvePostLoginPath());
        return;
      }

      // ---- 本番モード：APIへ問い合わせ ----
      const res = await login(uid, pw, device_id);
      if (res.status === "ok") {
        saveToken(res.token);
        if (res.user) {
          localStorage.setItem("tiara:user_id", res.user.id);
          localStorage.setItem("tiara:user_type", res.user.userType);
          localStorage.setItem(
            "tiara:must_change_password",
            res.user.mustChangePassword ? "1" : "0",
          );
          localStorage.setItem(
            "tiara_user_name",
            res.user.staffName || res.user.loginId || res.user.email || "ゲスト",
          );
          if (res.user.staffName) {
            localStorage.setItem("tiara:staff_name", res.user.staffName);
          } else {
            localStorage.removeItem("tiara:staff_name");
          }
        }
        if (res.user?.mustChangePassword) {
          setPasswordChangeOpen(true);
          return;
        }
        router.replace(resolvePostLoginPath());
        return;
      }
      if (res.status === "challenge") {
        setTxId(res.tx_id);
        setOtpOpen(true);
        return;
      }
      if (res.status === "denied") {
        setErr("IDまたはパスワードが正しくありません。");
        return;
      }
      setErr("不明な応答です");
    } catch (ex: any) {
      setErr(ex?.message ?? "ログインに失敗しました");
    } finally {
      setLoading(false);
    }
  }

  async function handleOtp(code: string) {
    const device_id = getDeviceId();

    try {
      if (DEMO) {
        // デモ時に OTP ダイアログを開くことは想定外だが、開いた場合も成功扱いにする
        saveToken("demo-token");
        setOtpOpen(false);
        router.replace(resolvePostLoginPath());
        return;
      }
      if (!txId) throw new Error("tx_id が取得できていません");
      const v = await verifyChallenge(txId, code, device_id);
      saveToken(v.token);
      setOtpOpen(false);
      router.replace(resolvePostLoginPath());
    } catch (ex: any) {
      setErr(ex?.message ?? "確認コードが正しくありません");
    } finally {
      setLoading(false);
    }
  }

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (newPassword.length < 8) {
      setErr("新しいパスワードは8文字以上で入力してください");
      return;
    }
    if (newPassword !== newPasswordConfirm) {
      setErr("新しいパスワードが一致していません");
      return;
    }
    if (newPassword === pw) {
      setErr("現在のパスワードとは別のパスワードを設定してください");
      return;
    }

    setPasswordChangeLoading(true);
    try {
      const user = await changeDashboardPassword(pw, newPassword);
      localStorage.setItem("tiara:must_change_password", "0");
      localStorage.setItem("tiara:user_id", user.id);
      localStorage.setItem("tiara:user_type", user.userType);
      localStorage.setItem(
        "tiara_user_name",
        user.staffName || user.loginId || user.email || "ゲスト",
      );
      if (user.staffName) {
        localStorage.setItem("tiara:staff_name", user.staffName);
      } else {
        localStorage.removeItem("tiara:staff_name");
      }
      router.replace(resolvePostLoginPath());
    } catch (ex: any) {
      setErr(ex?.message ?? "パスワード変更に失敗しました");
    } finally {
      setPasswordChangeLoading(false);
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
          {DEMO && (
            <p className="text-xs text-muted">
              デモ：任意のID/パスワードでログインできます
            </p>
          )}
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
        onClose={() => {
          setOtpOpen(false);
          setLoading(false);
        }}
        onSubmit={handleOtp}
      />
      {passwordChangeOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/70 px-4">
          <form
            onSubmit={handlePasswordChange}
            className="w-full max-w-md rounded-md border border-indigo-200/30 bg-slate-900 p-6 text-white shadow-xl"
          >
            <h2 className="text-lg font-bold">初回パスワード変更</h2>
            <p className="mt-2 text-sm text-indigo-100">
              初期パスワードでログインしています。新しいパスワードを設定してください。
            </p>
            <div className="mt-5 grid gap-3">
              <input
                className="tiara-input"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="新しいパスワード"
                autoComplete="new-password"
              />
              <input
                className="tiara-input"
                type="password"
                value={newPasswordConfirm}
                onChange={(e) => setNewPasswordConfirm(e.target.value)}
                placeholder="新しいパスワード（確認）"
                autoComplete="new-password"
              />
              <button
                type="submit"
                disabled={passwordChangeLoading}
                className="mt-2 rounded-md bg-indigo-500 px-4 py-3 font-bold text-white disabled:opacity-60"
              >
                {passwordChangeLoading ? "変更中..." : "変更して開始"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
