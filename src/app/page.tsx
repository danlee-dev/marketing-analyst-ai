"use client";

import { DotField } from "@/components/ui/DotField";
import { motion } from "motion/react";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { db } from "@/lib/client/api";
import { EASE, toastError } from "@/components/ui/overlay";
import { LogoMark } from "@/components/ui/Logo";

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
    <main className="relative grid min-h-dvh place-items-center px-4">
      <DotField />
      <motion.form
        onSubmit={create}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: EASE }}
        className="relative w-full max-w-[440px] rounded-xl bg-surface p-7 shadow-[var(--shadow-lg)]"
      >
        <div className="flex items-center gap-3.5">
          <motion.span
            key={name.trim().slice(0, 1) || "·"}
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.25, ease: EASE }}
            className="grid size-11 shrink-0 place-items-center rounded-md bg-ink text-[18px] font-bold text-on-ink"
          >
            {name.trim().slice(0, 1) || <LogoMark size={44} />}
          </motion.span>
          <div>
            <h1 className="text-[20px] font-bold">새 워크스페이스</h1>
            <p className="text-[14px] text-mute">아이템 하나의 레퍼런스와 팀이 모이는 곳이에요.</p>
          </div>
        </div>

        <label htmlFor="ws-name" className="mt-7 block text-[14px] font-semibold text-ink-2">
          워크스페이스 이름
        </label>
        <input
          id="ws-name"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="예: 플러디, 신규 브랜드"
          maxLength={60}
          className="mt-2 h-12 w-full rounded-md bg-surface-2 px-4 text-[15px] outline-none transition-shadow placeholder:text-mute focus:ring-1 focus:ring-ink/25"
        />
        <p className="mt-2 text-[13px] text-mute">팀원은 만든 뒤에 초대 링크로 부를 수 있어요.</p>

        <div className="mt-7 flex justify-end">
          <button
            type="submit"
            disabled={!name.trim() || busy}
            className="press flex h-11 items-center gap-2 rounded-md bg-ink px-5 text-[15px] font-semibold text-on-ink disabled:opacity-30"
          >
            {busy ? <Loader2 size={17} className="animate-spin" /> : null}
            {busy ? "만드는 중" : "워크스페이스 만들기"}
          </button>
        </div>
      </motion.form>
    </main>
  );
}
