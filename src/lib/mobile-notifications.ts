"use client";

type IncomingChatNotification = {
  roomId: string;
  castId: string;
  text: string;
  createdAt: string;
  senderType: "staff" | "cast";
  castName?: string;
};

const TOAST_EVENT_NAME = "tiara:m:toast";

export function publishMobileToast(message: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(TOAST_EVENT_NAME, {
      detail: { message },
    }),
  );
}

export function subscribeMobileToast(
  listener: (message: string) => void,
): () => void {
  if (typeof window === "undefined") return () => {};

  const handle = (event: Event) => {
    const customEvent = event as CustomEvent<{ message?: string }>;
    if (customEvent.detail?.message) {
      listener(customEvent.detail.message);
    }
  };

  window.addEventListener(TOAST_EVENT_NAME, handle);
  return () => {
    window.removeEventListener(TOAST_EVENT_NAME, handle);
  };
}

export async function requestNotificationPermission(): Promise<NotificationPermission | "unsupported"> {
  if (typeof window === "undefined") return "unsupported";
  if (!("Notification" in window)) {
    publishMobileToast("このブラウザは通知に対応していません");
    return "unsupported";
  }

  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") {
    publishMobileToast("通知が無効です。ブラウザ設定から許可してください");
    return "denied";
  }

  try {
    return await Notification.requestPermission();
  } catch {
    publishMobileToast("通知の許可要求に失敗しました");
    return "denied";
  }
}

export async function notifyIncomingChatMessage(
  payload: IncomingChatNotification,
): Promise<void> {
  if (payload.senderType !== "cast") return;
  if (typeof window === "undefined") return;
  if (document.visibilityState === "visible") return;

  const permission = await requestNotificationPermission();
  const title = payload.castName ? `${payload.castName} から新着` : "新着メッセージ";
  const body = payload.text || "新しいメッセージがあります";

  if (permission === "granted") {
    const registration = await navigator.serviceWorker.getRegistration().catch(() => null);
    if (registration) {
      await registration.showNotification(title, {
        body,
        tag: `chat-${payload.roomId}`,
        data: { url: `/m/chat/${payload.roomId}` },
        icon: "/icons/icon-192.svg",
        badge: "/icons/icon-192.svg",
      });
      return;
    }

    new Notification(title, {
      body,
      tag: `chat-${payload.roomId}`,
    });
    return;
  }

  publishMobileToast(body);
}
