"use client";

import { motion } from "motion/react";
import { ArrowRight, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { db } from "@/lib/client/api";
import { EASE, toastError } from "@/components/ui/overlay";

// 마지막으로 쓰던 워크스페이스로 보내고, 없으면 처음 하나를 만든다
export default function Home() {
  const router = useRouter();
  const [empty, setEmpty] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    db.workspaces()
      .then((list) => {
        if (!list.length) return setEmpty(true);
        let last: string | null = null;
        try {
          last = localStorage.getItem("lastWorkspace");
        } catch {}
        router.replace(`/w/${list.find((w) => w.id === last)?.id ?? list[0].id}`);
      })
      .catch((e) => {
        toastError(e);
        setEmpty(true);
      });
  }, [router]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      const ws = await db.createWorkspace(name.trim());
      const project = await db.createProject(ws.id, "레퍼런스");
      router.replace(`/w/${ws.id}/p/${project.id}`);
    } catch (err) {
      toastError(err);
      setBusy(false);
    }
  }

  if (!empty) {
    return (
      <main className="grid min-h-dvh place-items-center">
        <Loader2 size={22} className="animate-spin text-mute" />
      </main>
    );
  }

  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <motion.form onSubmit={create} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }} className="w-full max-w-[420px]">
        <h1 className="text-[28px] font-bold">워크스페이스를 만들어요</h1>
        <p className="mt-2 text-[15px] text-ink-2">진행하는 사업 아이템 이름으로 지으면 좋아요. 팀원은 나중에 초대할 수 있어요.</p>
        <div className="mt-8 flex items-center gap-2 rounded-lg bg-surface p-1.5 shadow-[var(--shadow)]">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="예: 플러디, 신규 브랜드"
            maxLength={60}
            className="h-12 min-w-0 flex-1 bg-transparent px-3 text-[15px] outline-none placeholder:text-mute"
          />
          <button type="submit" disabled={!name.trim() || busy} aria-label="만들기" className="press grid size-12 shrink-0 place-items-center rounded-md bg-ink text-on-ink disabled:opacity-30">
            {busy ? <Loader2 size={18} className="animate-spin" /> : <ArrowRight size={18} />}
          </button>
        </div>
      </motion.form>
    </main>
  );
}
