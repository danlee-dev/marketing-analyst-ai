"use client";

import { AnimatePresence, motion } from "motion/react";
import { Download, FolderInput, Folder as FolderIcon, Loader2, Trash2, X } from "lucide-react";
import type { Project } from "@/lib/types";
import { EASE, MenuItem, Popover } from "../ui/overlay";
import { childrenOf, useWorkspace } from "../workspace/context";

export function SelectionBar({
  count,
  total,
  zipping,
  project,
  onAll,
  onClear,
  onDownload,
  onDelete,
  onMove,
}: {
  count: number;
  total: number;
  zipping: { done: number; total: number } | null;
  project: Project;
  onAll: () => void;
  onClear: () => void;
  onDownload: () => void;
  onDelete: () => void;
  onMove: (folderId: string | null) => void;
}) {
  return (
    <AnimatePresence>
      {count > 0 && (
        <motion.div
          initial={{ y: 120, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 120, opacity: 0, transition: { duration: 0.2 } }}
          transition={{ duration: 0.4, ease: EASE }}
          className="pointer-events-none fixed inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] z-30 flex justify-center px-4 lg:pl-[272px]"
        >
          <div className="pointer-events-auto flex w-full max-w-xl items-center gap-1 rounded-lg bg-ink p-1.5 text-on-ink shadow-[var(--shadow-lg)]">
            <button onClick={onClear} aria-label="선택 해제" className="press grid size-11 shrink-0 place-items-center rounded-md opacity-80 hover:opacity-100">
              <X size={18} />
            </button>
            <span className="flex min-w-0 flex-1 items-baseline gap-0.5 text-[15px] font-semibold">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span key={count} initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -12, opacity: 0 }} transition={{ duration: 0.2 }} className="tabular-nums">
                  {count}
                </motion.span>
              </AnimatePresence>
              개 선택
            </span>
            {count < total && (
              <button onClick={onAll} className="press hidden h-11 rounded-md px-3 text-[14px] font-medium opacity-80 hover:opacity-100 sm:block">
                전체 선택
              </button>
            )}
            <div className="text-ink">
              <Popover
                side="top"
                align="end"
                trigger={({ toggle }) => (
                  <button onClick={toggle} aria-label="폴더로 이동" className="press grid size-11 place-items-center rounded-md text-on-ink opacity-80 hover:opacity-100">
                    <FolderInput size={18} />
                  </button>
                )}
              >
                {(close) => <MoveMenu project={project} onPick={(id) => (close(), onMove(id))} />}
              </Popover>
            </div>
            <button onClick={onDelete} aria-label="삭제" className="press grid size-11 shrink-0 place-items-center rounded-md opacity-80 hover:opacity-100">
              <Trash2 size={17} />
            </button>
            <button
              onClick={onDownload}
              disabled={!!zipping}
              className="press relative flex h-11 shrink-0 items-center gap-2 overflow-hidden rounded-md bg-on-ink px-4 text-[14px] font-semibold text-ink"
            >
              {zipping ? (
                <>
                  <motion.span
                    className="absolute inset-0 origin-left bg-surface-3"
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: zipping.total ? zipping.done / zipping.total : 0 }}
                  />
                  <span className="relative flex items-center gap-2 tabular-nums">
                    <Loader2 size={15} className="animate-spin" />
                    {zipping.done}/{zipping.total}
                  </span>
                </>
              ) : (
                <>
                  <Download size={16} /> zip 받기
                </>
              )}
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function MoveMenu({ project, onPick, current }: { project: Project; onPick: (id: string | null) => void; current?: string | null }) {
  const w = useWorkspace();
  const rows: { id: string; name: string; depth: number }[] = [];
  const walk = (parent: string | null, depth: number) => {
    for (const f of childrenOf(w.folders, project.id, parent)) {
      rows.push({ id: f.id, name: f.name, depth });
      walk(f.id, depth + 1);
    }
  };
  walk(null, 0);
  return (
    <div className="max-h-72 overflow-y-auto">
      <MenuItem icon={<FolderIcon size={15} />} active={current === null} onClick={() => onPick(null)}>
        {project.name} (맨 위)
      </MenuItem>
      {rows.map((r) => (
        <div key={r.id} style={{ paddingLeft: 12 + r.depth * 12 }}>
          <MenuItem icon={<FolderIcon size={15} />} active={current === r.id} onClick={() => onPick(r.id)}>
            {r.name}
          </MenuItem>
        </div>
      ))}
    </div>
  );
}
