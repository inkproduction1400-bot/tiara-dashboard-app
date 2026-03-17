import Link from "next/link";
import clsx from "clsx";
import { Pin } from "lucide-react";
import type { MobileChatCastProfile, MobileChatRoom } from "./mobileApi";

type ChatListItemProps = {
  room: MobileChatRoom;
  active?: boolean;
  pinned?: boolean;
  onTogglePin?: (roomId: string) => void;
  onOpenProfile?: (room: MobileChatRoom) => void;
  profile?: MobileChatCastProfile | null;
};

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--:--";
  return new Intl.DateTimeFormat("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
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
}: ChatListItemProps) {
  return (
    <div
      className={clsx(
        "tiara-mobile-card w-full max-w-full overflow-hidden border px-4 py-4 transition",
        active ? "border-[#0b8ef3]/40 bg-[#f2f9ff]" : "border-white/70",
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        <button
          type="button"
          onClick={() => onOpenProfile?.(room)}
          className="tiara-mobile-soft relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden bg-[#0b8ef3]/12 text-sm font-bold text-[#0b8ef3]"
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
          <span
            className={clsx(
              "tiara-mobile-avatar absolute -bottom-1 -right-1 h-4 w-4 border-2 border-white",
              room.shiftStatus === "出勤中"
                ? "bg-emerald-500"
                : room.shiftStatus === "出勤予定"
                  ? "bg-amber-400"
                  : "bg-slate-300",
            )}
          />
        </button>

        <div className="flex min-w-0 flex-1 items-start gap-3">
          <Link href={`/m/chat/${room.id}`} className="min-w-0 flex-1 overflow-hidden">
            <div className="flex min-w-0 items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-bold text-slate-900">
                  {room.castName}
                </div>
                <div className="truncate text-xs text-slate-500">
                  {room.castCode} / 担当 {room.staffName}
                </div>
              </div>
            </div>
            <p className="mt-2 truncate text-sm text-slate-600">{room.lastMessage}</p>

            <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-semibold">
              <span className="tiara-mobile-pill max-w-full truncate bg-slate-100 px-2.5 py-1 text-slate-600">
                {room.shiftStatus}
              </span>
              <span className="tiara-mobile-pill max-w-full truncate bg-[#0b8ef3]/10 px-2.5 py-1 text-[#0b8ef3]">
                {room.assignmentStatus}
              </span>
            </div>
          </Link>

          <div className="flex shrink-0 flex-col items-end gap-2">
            <button
              type="button"
              aria-label={pinned ? "ピン留め解除" : "ピン留め"}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onTogglePin?.(room.id);
              }}
              className={clsx(
                "inline-flex h-9 w-9 items-center justify-center rounded-full transition",
                pinned
                  ? "bg-[#0b8ef3]/12 text-[#0b8ef3]"
                  : "bg-slate-100 text-slate-400",
              )}
            >
              <Pin className={clsx("h-4 w-4", pinned && "fill-current")} />
            </button>
            <div className="max-w-[3.5rem] text-right text-[11px] font-semibold text-slate-400">
              {formatTime(room.lastMessageAt)}
            </div>
            {room.unreadCount > 0 ? (
              <span className="tiara-mobile-pill inline-flex min-w-5 items-center justify-center bg-[#0b8ef3] px-1.5 py-0.5 text-[10px] font-bold text-white">
                {room.unreadCount}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
