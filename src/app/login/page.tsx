import Logo from "@/components/Logo";
import LoginForm from "./LoginForm";

export default function LoginPage() {
  return (
    <main className="grid place-items-center min-h-dvh px-6">
      <section className="w-full max-w-[880px] flex flex-col items-center gap-4">
        {/* HERO */}
        <div className="flex flex-col items-center">
          <Logo className="w-[48vw] max-w-[360px] drop-shadow-2xl select-none" />
          <div className="relative w-full min-h-[88px] flex flex-col items-center justify-center mt-2">
            {/* ローディング演出（LoginForm の useEffect で非表示に切替） */}
            <div
              id="tiara-loading"
              className="absolute inset-0 grid place-items-center text-slate-300 font-extrabold tracking-[.25em] animate-pulse"
            >
              LOADING...
            </div>
            <h1
              id="tiara-title"
              className="invisible font-black tracking-wide text-[clamp(22px,3.6vw,42px)] flex gap-2 items-baseline"
            >
              ティアラ管理システム <span className="opacity-85 font-extrabold text-sm">version 1.0</span>
            </h1>
            <p id="tiara-subtitle" className="invisible text-sm text-[#9fb5ff]">
              TIARA Monitoring System — Welcome
            </p>
          </div>
        </div>

        {/* ログインパネル */}
        <div
          id="tiara-panel"
          className="tiara-panel w-full opacity-0 translate-y-2 transition duration-500 p-5"
          aria-hidden="true"
        >
          <LoginForm />
        </div>
      </section>
    </main>
  );
}
