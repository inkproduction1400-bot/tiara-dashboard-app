"use client";

function uuidv4() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0, v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function getDeviceId(): string {
  if (typeof window === "undefined") return "server";
  let id = localStorage.getItem("device_id");
  if (!id) { id = uuidv4(); localStorage.setItem("device_id", id); }
  return id;
}

export function saveToken(token: string) { localStorage.setItem("access_token", token); }
export function getToken(): string | null { return localStorage.getItem("access_token"); }
