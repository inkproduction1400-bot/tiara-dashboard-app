export default function Logo({ className }: { className?: string }) {
    return (
      <img
        src="/img/logo4.png"
        alt="TIARA"
        className={className ?? "max-w-[360px] w-[48vw] drop-shadow-2xl select-none"}
        draggable={false}
      />
    );
  }
  