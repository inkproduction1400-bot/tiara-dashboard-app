"use client";

import { io, type Socket } from "socket.io-client";
import { API_BASE } from "@/lib/api";
import { notifyIncomingChatMessage } from "@/lib/mobile-notifications";

export type SocketChatMessage = {
  roomId: string;
  castId: string;
  messageId: string;
  clientMessageId?: string;
  senderType: "staff" | "cast";
  text: string;
  createdAt: string;
};

type PresenceRoomViewingPayload = {
  roomId: string;
  viewing: boolean;
  deviceId?: string;
};

const SOCKET_EVENT_NAME = "tiara:m:socket-message";

let socket: Socket | null = null;
let currentToken: string | null = null;

function getSocketBaseUrl() {
  return API_BASE.replace(/\/api\/v1\/?$/, "");
}

function handleChatMessageCreated(payload: SocketChatMessage) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<SocketChatMessage>(SOCKET_EVENT_NAME, {
      detail: payload,
    }),
  );
  void notifyIncomingChatMessage(payload);
}

function bindSocketEvents(nextSocket: Socket) {
  nextSocket.on("chat:message.created", handleChatMessageCreated);
}

function unbindSocketEvents(targetSocket: Socket) {
  targetSocket.off("chat:message.created", handleChatMessageCreated);
}

export function connectSocket(token: string): Socket | null {
  if (typeof window === "undefined" || !token) return null;

  if (socket && currentToken === token) {
    if (!socket.connected) {
      socket.connect();
    }
    return socket;
  }

  if (socket) {
    unbindSocketEvents(socket);
    socket.disconnect();
  }

  const nextSocket = io(`${getSocketBaseUrl()}/ws`, {
    auth: {
      token: `Bearer ${token}`,
    },
    transports: ["websocket", "polling"],
    autoConnect: true,
    reconnection: true,
  });

  bindSocketEvents(nextSocket);
  socket = nextSocket;
  currentToken = token;
  return socket;
}

export function disconnectSocket() {
  if (!socket) return;
  unbindSocketEvents(socket);
  socket.disconnect();
  socket = null;
  currentToken = null;
}

export function emitPresenceRoomViewing(payload: PresenceRoomViewingPayload) {
  if (!socket || !socket.connected) return false;
  socket.emit("presence:room.viewing", payload);
  return true;
}

export function subscribeSocketMessages(
  listener: (payload: SocketChatMessage) => void,
): () => void {
  if (typeof window === "undefined") return () => {};

  const handleEvent = (event: Event) => {
    const customEvent = event as CustomEvent<SocketChatMessage>;
    if (!customEvent.detail) return;
    listener(customEvent.detail);
  };

  window.addEventListener(SOCKET_EVENT_NAME, handleEvent);
  return () => {
    window.removeEventListener(SOCKET_EVENT_NAME, handleEvent);
  };
}
