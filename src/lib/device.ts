// src/lib/device.ts
"use client";

function uuidv4() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function getDeviceId(): string {
  if (typeof window === "undefined") return "server";
  let id = localStorage.getItem("device_id");
  if (!id) {
    id = uuidv4();
    localStorage.setItem("device_id", id);
  }
  return id;
}

export function saveToken(token: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem("access_token", token);
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("access_token");
}

export function clearAuth(): void {
  if (typeof window === "undefined") return;
  try {
    // 現行の access_token と、過去バージョンで使っていたキーの両方を消しておく
    localStorage.removeItem("access_token");
    localStorage.removeItem("tiara_token");
    localStorage.removeItem("tiara_user_name");
    localStorage.removeItem("tiara_login_id");
  } catch {
    // localStorage が使えない場合は何もしない（サイレントに失敗）
  }
}
