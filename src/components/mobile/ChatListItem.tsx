import Link from "next/link";
import clsx from "clsx";
import { Pin } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { MobileChatCastProfile, MobileChatRoom } from "./mobileApi";

type ChatListItemProps = {
  room: MobileChatRoom;
  active?: boolean;
  pinned?: boolean;
  onTogglePin?: (roomId: string) => void;
  onOpenProfile?: (room: MobileChatRoom) => void;
  profile?: MobileChatCastProfile | null;
  swipeOpen?: boolean;
  onSwipeOpenChange?: (open: boolean) => void;
};

const SWIPE_ACTION_WIDTH = 80;
const SWIPE_OPEN_THRESHOLD = 36;

function formatListTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTarget = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round(
    (startOfToday.getTime() - startOfTarget.getTime()) / (24 * 60 * 60 * 1000),
  );

  if (diffDays === 0) {
    const hh = `${date.getHours()}`.padStart(2, "0");
    const mm = `${date.getMinutes()}`.padStart(2, "0");
    return `${hh}:${mm}`;
  }

  if (diffDays === 1) {
    return "昨日";
  }

  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function initials(name: string) {
  return name.replace(/\s+/g, "").slice(0, 2) || "ST";
}

export function ChatListItem({
  room,
  active = false,
  pinned = false,
  onTogglePin,
  onOpenProfile,
  profile,
  swipeOpen = false,
  onSwipeOpenChange,
}: ChatListItemProps) {
  const pointerState = useRef<{
    id: number;
    startX: number;
    startY: number;
    dragging: boolean;
    horizontal: boolean;
  } | null>(null);
  const [dragOffset, setDragOffset] = useState(0);

  useEffect(() => {
    if (!swipeOpen) {
      setDragOffset(0);
    }
  }, [swipeOpen]);

  const translateX = useMemo(() => {
    if (dragOffset > 0) {
      return Math.min(dragOffset, SWIPE_ACTION_WIDTH);
    }
    return swipeOpen ? SWIPE_ACTION_WIDTH : 0;
  }, [dragOffset, swipeOpen]);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    pointerState.current = {
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      dragging: true,
      horizontal: false,
    };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = pointerState.current;
    if (!state || state.id !== event.pointerId || !state.dragging) return;

    const deltaX = event.clientX - state.startX;
    const deltaY = event.clientY - state.startY;

    if (!state.horizontal) {
      if (Math.abs(deltaY) > 10 && Math.abs(deltaY) > Math.abs(deltaX)) {
        pointerState.current = null;
        setDragOffset(0);
        return;
      }
      if (Math.abs(deltaX) > 10 && Math.abs(deltaX) > Math.abs(deltaY)) {
        state.horizontal = true;
      } else {
        return;
      }
    }

    event.preventDefault();
    if (deltaX <= 0) {
      setDragOffset(0);
      if (swipeOpen && Math.abs(deltaX) > SWIPE_OPEN_THRESHOLD) {
        onSwipeOpenChange?.(false);
      }
      return;
    }

    setDragOffset(Math.min(deltaX, SWIPE_ACTION_WIDTH));
  };

  const handlePointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = pointerState.current;
    if (!state || state.id !== event.pointerId) return;

    const deltaX = event.clientX - state.startX;
    const shouldOpen = deltaX > SWIPE_OPEN_THRESHOLD;
    onSwipeOpenChange?.(shouldOpen);
    setDragOffset(0);
    pointerState.current = null;
  };

  const handlePointerCancel = () => {
    pointerState.current = null;
    setDragOffset(0);
  };

  return (
    <div className="relative w-full min-w-0 max-w-full overflow-hidden">
      <div className="absolute inset-y-0 left-0 flex w-20 items-center justify-center">
        <button
          type="button"
          onClick={() => {
            onTogglePin?.(room.id);
            onSwipeOpenChange?.(false);
          }}
          className={clsx(
            "tiara-mobile-pill flex h-[72px] w-[72px] flex-col items-center justify-center gap-1 text-[11px] font-semibold text-white shadow-sm",
            pinned ? "bg-slate-500" : "bg-[#0b8ef3]",
          )}
        >
          <Pin className={clsx("h-4 w-4", pinned && "fill-current")} />
          <span>{pinned ? "解除" : "ピン留め"}</span>
        </button>
      </div>

      <div
        className={clsx(
          "tiara-mobile-card relative z-10 w-full min-w-0 max-w-full overflow-hidden border transition-transform duration-200 ease-out",
          active ? "border-[#0b8ef3]/40 bg-[#f2f9ff]" : "border-white/70",
        )}
        style={{ transform: `translateX(${translateX}px)` }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerCancel}
      >
        <div className="flex w-full min-w-0 max-w-full items-center gap-3 px-3 py-2.5">
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onSwipeOpenChange?.(false);
              onOpenProfile?.(room);
            }}
            className="tiara-mobile-avatar relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden bg-[#0b8ef3]/12 text-sm font-bold text-[#0b8ef3]"
            aria-label={`${room.castName}の詳細を表示`}
          >
            {profile?.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profile.photoUrl}
                alt={room.castName}
                className="h-full w-full object-cover"
                loading="lazy"
              />
            ) : (
              initials(room.castName)
            )}
          </button>

          <Link
            href={`/m/chat/${room.id}`}
            className="block min-w-0 flex-1 overflow-hidden"
            onClick={() => onSwipeOpenChange?.(false)}
          >
            <div className="flex min-w-0 items-start gap-3">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[15px] font-semibold text-slate-900">
                  {room.castName}
                </div>
                <p className="mt-1 truncate text-[13px] text-slate-500">{room.lastMessage}</p>
              </div>

              <div className="flex w-12 shrink-0 flex-col items-end gap-1">
                <div className="w-full truncate text-right text-[11px] font-medium text-slate-400">
                  {formatListTime(room.lastMessageAt)}
                </div>
                {room.unreadCount > 0 ? (
                  <span className="tiara-mobile-pill inline-flex min-w-5 items-center justify-center bg-[#0b8ef3] px-1.5 py-0.5 text-[10px] font-bold text-white">
                    {room.unreadCount}
                  </span>
                ) : null}
              </div>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
