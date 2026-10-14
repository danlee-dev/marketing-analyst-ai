"use client";

import { motion, useAnimationControls } from "motion/react";
import { ArrowRight, Loader2 } from "lucide-react";
import { useState } from "react";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const shake = useAnimationControls();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError("");
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (res.ok) {
      window.location.href = "/";
      return;
    }
    setBusy(false);
    setError("비밀번호가 맞지 않아요");
    shake.start({ x: [0, -10, 9, -6, 4, 0], transition: { duration: 0.42 } });
  }

  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <motion.form
        onSubmit={submit}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm"
      >
        <h1 className="text-[28px] font-bold">레퍼런스 보관함</h1>
        <p className="mt-2 text-[15px] text-ink-2">비밀번호를 입력하면 들어갈 수 있어요.</p>
        <motion.div animate={shake} className="mt-8 flex items-center gap-2 rounded-2xl bg-surface p-1.5 shadow-[var(--shadow)]">
          <input
            type="password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="비밀번호"
            className="h-11 min-w-0 flex-1 bg-transparent px-3 text-[15px] outline-none placeholder:text-mute"
          />
          <button
            type="submit"
            disabled={!password || busy}
            aria-label="들어가기"
            className="grid size-11 shrink-0 place-items-center rounded-xl bg-ink text-on-ink transition active:scale-95 disabled:opacity-30"
          >
            {busy ? <Loader2 size={18} className="animate-spin" /> : <ArrowRight size={18} />}
          </button>
        </motion.div>
        <p className="mt-3 h-5 text-[13px] text-danger">{error}</p>
      </motion.form>
    </main>
  );
}
