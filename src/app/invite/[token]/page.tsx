"use client";

import { motion } from "motion/react";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { db } from "@/lib/client/api";
import { EASE, toastError } from "@/components/ui/overlay";

type State = { kind: "loading" } | { kind: "login" } | { kind: "invalid" } | { kind: "ready"; name: string };

export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [state, setState] = useState<State>({ kind: "loading" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      if (!(await db.me())) return setState({ kind: "login" });
      const info = await db.inviteInfo(token).catch(() => null);
      setState(info?.valid ? { kind: "ready", name: info.workspace_name } : { kind: "invalid" });
    })();
  }, [token]);

  async function join() {
    setBusy(true);
    try {
      const wsId = await db.acceptInvite(token);
      try {
        localStorage.setItem("lastWorkspace", wsId);
      } catch {}
      router.replace(`/w/${wsId}`);
    } catch (e) {
      toastError(e);
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }} className="w-full max-w-[400px] text-center">
        {state.kind === "loading" && <Loader2 size={22} className="mx-auto animate-spin text-mute" />}
        {state.kind === "login" && (
          <>
            <h1 className="text-[24px] font-bold">워크스페이스에 초대받았어요</h1>
            <p className="mt-2 text-[15px] text-ink-2">로그인하면 바로 들어갈 수 있어요.</p>
            <Link
              href={`/login?next=${encodeURIComponent(`/invite/${token}`)}`}
              className="press mt-8 inline-flex h-12 items-center rounded-md bg-ink px-6 text-[15px] font-semibold text-on-ink"
            >
              로그인하고 참여하기
            </Link>
          </>
        )}
        {state.kind === "invalid" && (
          <>
            <h1 className="text-[24px] font-bold">쓸 수 없는 초대 링크예요</h1>
            <p className="mt-2 text-[15px] text-ink-2">만료됐거나 꺼진 링크예요. 보낸 분께 새 링크를 부탁해 주세요.</p>
            <Link href="/" className="press mt-8 inline-flex h-12 items-center rounded-md bg-surface-2 px-6 text-[15px] font-semibold">
              내 워크스페이스로
            </Link>
          </>
        )}
        {state.kind === "ready" && (
          <>
            <div className="mx-auto grid size-14 place-items-center rounded-lg bg-ink text-[22px] font-bold text-on-ink">{state.name.slice(0, 1)}</div>
            <h1 className="mt-6 text-[24px] font-bold">{state.name}</h1>
            <p className="mt-2 text-[15px] text-ink-2">이 워크스페이스에 초대받았어요.</p>
            <button onClick={join} disabled={busy} className="press mt-8 inline-flex h-12 items-center gap-2 rounded-md bg-ink px-6 text-[15px] font-semibold text-on-ink disabled:opacity-60">
              {busy && <Loader2 size={17} className="animate-spin" />}
              참여하기
            </button>
          </>
        )}
      </motion.div>
    </main>
  );
}
