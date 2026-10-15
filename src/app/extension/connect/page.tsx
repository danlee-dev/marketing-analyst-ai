"use client";

import { motion } from "motion/react";
import { Check, Loader2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { DotField } from "@/components/ui/DotField";
import { LogoMark } from "@/components/ui/Logo";
import { EASE } from "@/components/ui/overlay";

type State = "detecting" | "missing" | "ready" | "connecting" | "done" | "failed";

// 크롬 확장 연결: 로그인한 사용자 이름으로 개인 토큰을 만들어 확장(bridge.js)에 넘긴다
export default function ExtensionConnect() {
  const [state, setState] = useState<State>("detecting");
  const started = useRef(false);

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.source !== window || e.origin !== window.location.origin) return;
      if (e.data?.type === "RB_EXT_PRESENT") setState((s) => (s === "detecting" || s === "missing" ? "ready" : s));
      if (e.data?.type === "RB_EXT_CONNECTED") setState("done");
      if (e.data?.type === "RB_EXT_FAILED") setState("failed");
    };
    window.addEventListener("message", onMsg);
    window.postMessage({ type: "RB_EXT_PING" }, window.location.origin);
    const t = setTimeout(() => setState((s) => (s === "detecting" ? "missing" : s)), 1500);
    return () => {
      window.removeEventListener("message", onMsg);
      clearTimeout(t);
    };
  }, []);

  async function connect() {
    if (started.current) return;
    started.current = true;
    setState("connecting");
    const res = await fetch("/api/tokens", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Chrome 확장" }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.token) {
      started.current = false;
      return setState("failed");
    }
    window.postMessage({ type: "RB_EXT_TOKEN", token: data.token }, window.location.origin);
  }

  return (
    <main className="relative grid min-h-dvh place-items-center px-4">
      <DotField />
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: EASE }}
        className="relative w-full max-w-[420px] rounded-xl bg-surface p-7 shadow-[var(--shadow-lg)]"
      >
        <LogoMark size={44} />
        <h1 className="mt-5 text-[22px] font-bold">
          {state === "done" ? "확장이 연결됐어요" : state === "missing" ? "확장을 찾지 못했어요" : "크롬 확장 연결"}
        </h1>
        <p className="mt-2 text-[15px] text-ink-2">
          {state === "done"
            ? "이제 툴바의 보관함 아이콘, 인스타 오른쪽 아래 버튼, 우클릭 메뉴로 바로 저장할 수 있어요. 이 탭은 닫아도 돼요."
            : state === "missing"
              ? "확장이 설치돼 있지 않거나 꺼져 있어요. 설치한 뒤 이 페이지를 새로고침해 주세요."
              : state === "failed"
                ? "연결하지 못했어요. 확장을 다시 켠 뒤 시도해 주세요."
                : "이 계정으로 확장을 연결해요. 확장은 저장할 때만 보관함에 접근해요."}
        </p>
        {state === "done" ? (
          <span className="mt-6 inline-flex h-11 items-center gap-2 rounded-md bg-surface-2 px-5 text-[15px] font-semibold">
            <Check size={17} /> 연결됨
          </span>
        ) : state === "missing" ? (
          <a href="/reference-box-extension.zip" className="press mt-6 inline-flex h-11 items-center rounded-md bg-ink px-5 text-[15px] font-semibold text-on-ink">
            확장 zip 받기
          </a>
        ) : (
          <button
            onClick={connect}
            disabled={state !== "ready" && state !== "failed"}
            className="press mt-6 inline-flex h-11 items-center gap-2 rounded-md bg-ink px-5 text-[15px] font-semibold text-on-ink disabled:opacity-40"
          >
            {(state === "connecting" || state === "detecting") && <Loader2 size={16} className="animate-spin" />}
            {state === "detecting" ? "확장 찾는 중" : "이 계정으로 연결하기"}
          </button>
        )}
        <Link href="/" className="mt-6 block text-[14px] text-mute underline-offset-4 hover:text-ink hover:underline">
          보관함으로 돌아가기
        </Link>
      </motion.div>
    </main>
  );
}
