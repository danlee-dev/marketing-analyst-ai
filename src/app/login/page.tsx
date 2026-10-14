"use client";

import { AnimatePresence, motion, useAnimationControls } from "motion/react";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/lib/supabase/browser";
import { EASE } from "@/components/ui/overlay";

function nextPath() {
  if (typeof window === "undefined") return "/";
  const raw = new URLSearchParams(window.location.search).get("next") ?? "/";
  return raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";
}

export default function LoginPage() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<"email" | "google" | null>(null);
  const shake = useAnimationControls();

  const fail = (msg: string) => {
    setError(msg);
    setBusy(null);
    shake.start({ x: [0, -10, 9, -6, 4, 0], transition: { duration: 0.42 } });
  };

  async function google() {
    setBusy("google");
    const { error } = await supabase().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath())}` },
    });
    if (error) fail(error.message);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy("email");
    setError("");
    if (mode === "signup") {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return fail(data.error ?? "가입하지 못했어요");
    }
    const { error } = await supabase().auth.signInWithPassword({ email, password });
    if (error) return fail(/invalid/i.test(error.message) ? "이메일이나 비밀번호가 맞지 않아요" : error.message);
    window.location.assign(nextPath());
  }

  const input =
    "h-12 w-full rounded-md bg-surface-2 px-4 text-[15px] outline-none transition-shadow placeholder:text-mute focus:ring-2 focus:ring-ink";

  return (
    <main className="grid min-h-dvh place-items-center px-4 py-12">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }} className="w-full max-w-[380px]">
        <div className="grid size-11 place-items-center rounded-md bg-ink text-[18px] font-bold text-on-ink">R</div>
        <h1 className="mt-6 text-[28px] font-bold">레퍼런스 보관함</h1>
        <p className="mt-2 text-[15px] text-ink-2">인스타 레퍼런스를 팀과 함께 모으고 분석용으로 내려받아요.</p>

        <button
          type="button"
          onClick={google}
          disabled={!!busy}
          className="press mt-8 flex h-12 w-full items-center justify-center gap-3 rounded-md bg-surface text-[15px] font-semibold shadow-[var(--shadow)] hover:bg-surface-2 disabled:opacity-60"
        >
          {busy === "google" ? <Loader2 size={18} className="animate-spin" /> : <GoogleMark />}
          Google로 계속하기
        </button>

        <p className="my-6 text-center text-[13px] text-mute">또는 이메일로</p>

        <motion.form animate={shake} onSubmit={submit} className="flex flex-col gap-2">
          <AnimatePresence initial={false}>
            {mode === "signup" && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="이름" autoComplete="name" className={input} />
              </motion.div>
            )}
          </AnimatePresence>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="이메일" autoComplete="email" required className={input} />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={mode === "signup" ? "비밀번호 (8자 이상)" : "비밀번호"}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            required
            minLength={mode === "signup" ? 8 : undefined}
            className={input}
          />
          <button
            type="submit"
            disabled={!!busy || !email || !password}
            className="press mt-2 flex h-12 items-center justify-center rounded-md bg-ink text-[15px] font-semibold text-on-ink disabled:opacity-30"
          >
            {busy === "email" ? <Loader2 size={18} className="animate-spin" /> : mode === "login" ? "로그인" : "가입하고 시작하기"}
          </button>
        </motion.form>

        <p className="mt-3 min-h-6 text-[14px] text-danger">{error}</p>
        <button
          type="button"
          onClick={() => {
            setMode(mode === "login" ? "signup" : "login");
            setError("");
          }}
          className="mt-2 text-[14px] text-ink-2 underline-offset-4 hover:underline"
        >
          {mode === "login" ? "처음이에요. 이메일로 가입할게요" : "이미 계정이 있어요"}
        </button>
      </motion.div>
    </main>
  );
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
