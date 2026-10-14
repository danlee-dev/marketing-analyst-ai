"use client";

import { AnimatePresence, motion } from "motion/react";
import { Menu } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { DotField } from "../ui/DotField";
import { WorkspaceProvider, useWorkspace } from "./context";
import { SettingsDialog } from "./SettingsDialog";
import { Sidebar } from "./Sidebar";

export function Shell({ children }: { children: React.ReactNode }) {
  const { ws } = useParams<{ ws: string }>();
  return (
    <WorkspaceProvider wsId={ws}>
      <Frame>{children}</Frame>
      <SettingsDialog />
    </WorkspaceProvider>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  const w = useWorkspace();
  const [drawer, setDrawer] = useState(false);

  if (w.missing) {
    return (
      <main className="grid min-h-dvh place-items-center px-4 text-center">
        <div>
          <h1 className="text-[22px] font-bold">이 워크스페이스에 들어갈 수 없어요</h1>
          <p className="mt-2 text-[15px] text-ink-2">삭제됐거나 초대받지 않은 곳이에요.</p>
          <Link href="/" className="press mt-6 inline-flex h-11 items-center rounded-md bg-ink px-5 text-[15px] font-semibold text-on-ink">
            내 워크스페이스로
          </Link>
        </div>
      </main>
    );
  }

  return (
    <div className="flex h-dvh">
      <aside className="hidden w-[272px] shrink-0 lg:block">
        <Sidebar />
      </aside>

      <AnimatePresence>
        {drawer && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <motion.div className="absolute inset-0 bg-black" initial={{ opacity: 0 }} animate={{ opacity: 0.36 }} exit={{ opacity: 0 }} onClick={() => setDrawer(false)} />
            <motion.aside
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ duration: 0.35, ease: [0.05, 0.7, 0.1, 1] }}
              className="absolute inset-y-0 left-0 w-[86%] max-w-[300px] rounded-r-xl bg-bg pt-[env(safe-area-inset-top)] shadow-[var(--shadow-lg)]"
            >
              <Sidebar onNavigate={() => setDrawer(false)} />
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      <div className="relative min-w-0 flex-1 overflow-hidden bg-surface lg:my-2 lg:mr-2 lg:rounded-xl lg:shadow-[var(--shadow)]">
        <DotField />
        <main id="main" className="relative h-full overflow-y-auto">
        <div className="sticky top-0 z-20 flex h-14 items-center gap-2 bg-surface px-3 pt-[env(safe-area-inset-top)] lg:hidden">
          <button aria-label="메뉴" onClick={() => setDrawer(true)} className="press grid size-10 place-items-center rounded-md text-ink-2 hover:bg-surface-2">
            <Menu size={20} />
          </button>
          <span className="truncate text-[15px] font-semibold">{w.workspace?.name}</span>
        </div>
          {children}
        </main>
      </div>
    </div>
  );
}
