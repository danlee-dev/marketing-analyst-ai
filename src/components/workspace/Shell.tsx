"use client";

import { AnimatePresence, motion } from "motion/react";
import { Menu, PanelLeftOpen } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { EASE } from "../ui/overlay";
import { DotField } from "../ui/DotField";
import { WorkspaceProvider, useWorkspace } from "./context";
import { ClaudeDialog } from "./ClaudeConnect";
import { SettingsDialog } from "./SettingsDialog";
import { Sidebar } from "./Sidebar";

export function Shell({ children }: { children: React.ReactNode }) {
  const { ws } = useParams<{ ws: string }>();
  return (
    <WorkspaceProvider wsId={ws}>
      <Frame>{children}</Frame>
      <SettingsDialog />
      <ClaudeDialog />
    </WorkspaceProvider>
  );
}

// 사이드바 접힘 상태는 브라우저에 기억 (서버 렌더는 펼친 상태)
const collapseListeners = new Set<() => void>();
const subscribeCollapsed = (l: () => void) => {
  collapseListeners.add(l);
  return () => collapseListeners.delete(l);
};
const readCollapsed = () => {
  try {
    return localStorage.getItem("sidebarCollapsed") === "1";
  } catch {
    return false;
  }
};
const writeCollapsed = (v: boolean) => {
  try {
    localStorage.setItem("sidebarCollapsed", v ? "1" : "0");
  } catch {}
  collapseListeners.forEach((l) => l());
};

function Frame({ children }: { children: React.ReactNode }) {
  const w = useWorkspace();
  const [drawer, setDrawer] = useState(false);
  const collapsed = useSyncExternalStore(subscribeCollapsed, readCollapsed, () => false);
  const toggle = () => writeCollapsed(!readCollapsed());

  // ⌘\ (Ctrl+\) 로 사이드바 접기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "\\") {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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
      <motion.aside
        initial={false}
        animate={{ width: collapsed ? 0 : 272 }}
        transition={{ duration: 0.4, ease: EASE }}
        className="hidden shrink-0 overflow-hidden lg:block"
        aria-hidden={collapsed}
      >
        <motion.div
          initial={false}
          animate={{ x: collapsed ? -32 : 0, opacity: collapsed ? 0 : 1 }}
          transition={{ duration: collapsed ? 0.2 : 0.4, ease: EASE }}
          className="h-full w-[272px]"
        >
          <Sidebar onCollapse={toggle} />
        </motion.div>
      </motion.aside>

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

      <div
        className={`relative min-w-0 flex-1 overflow-hidden bg-surface transition-[margin] duration-300 lg:my-2 lg:mr-2 lg:rounded-xl lg:shadow-[var(--shadow)] ${collapsed ? "lg:ml-2" : ""}`}
      >
        <DotField />
        <AnimatePresence>
          {collapsed && (
            <motion.button
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.3, ease: EASE, delay: 0.15 }}
              onClick={toggle}
              aria-label="사이드바 펼치기 (⌘\)"
              title="사이드바 펼치기 (⌘\)"
              className="press absolute left-3 top-3 z-30 hidden size-10 place-items-center rounded-md bg-surface text-ink-2 shadow-[var(--shadow)] hover:text-ink lg:grid"
            >
              <PanelLeftOpen size={18} />
            </motion.button>
          )}
        </AnimatePresence>
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
