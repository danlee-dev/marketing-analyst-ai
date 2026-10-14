"use client";

import { AnimatePresence, motion } from "motion/react";
import { Download, Loader2, Trash2, X } from "lucide-react";

export function SelectionBar({
  count,
  total,
  zipping,
  onAll,
  onClear,
  onDownload,
  onDelete,
}: {
  count: number;
  total: number;
  zipping: { done: number; total: number } | null;
  onAll: () => void;
  onClear: () => void;
  onDownload: () => void;
  onDelete: () => void;
}) {
  return (
    <AnimatePresence>
      {count > 0 && (
        <motion.div
          initial={{ y: 120, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 120, opacity: 0 }}
          transition={{ type: "spring", stiffness: 420, damping: 36 }}
          className="fixed inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] z-30 flex justify-center px-4"
        >
          <div className="flex w-full max-w-xl items-center gap-1 rounded-[22px] bg-ink p-1.5 text-on-ink shadow-[var(--shadow-lg)]">
            <button onClick={onClear} aria-label="선택 해제" className="grid size-10 shrink-0 place-items-center rounded-2xl hover:bg-white/10 dark:hover:bg-black/10">
              <X size={18} />
            </button>
            <span className="flex min-w-0 flex-1 items-baseline gap-1 pl-1 text-[15px] font-semibold">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span key={count} initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -12, opacity: 0 }} className="tabular-nums">
                  {count}
                </motion.span>
              </AnimatePresence>
              개 선택
            </span>
            {count < total && (
              <button onClick={onAll} className="hidden h-10 rounded-2xl px-3 text-[14px] font-medium opacity-80 hover:opacity-100 sm:block">
                전체 선택
              </button>
            )}
            <button onClick={onDelete} aria-label="삭제" className="grid size-10 shrink-0 place-items-center rounded-2xl opacity-80 hover:opacity-100">
              <Trash2 size={17} />
            </button>
            <motion.button
              whileTap={{ scale: 0.96 }}
              onClick={onDownload}
              disabled={!!zipping}
              className="relative flex h-10 shrink-0 items-center gap-2 overflow-hidden rounded-2xl bg-on-ink px-4 text-[14px] font-semibold text-ink"
            >
              {zipping ? (
                <>
                  <motion.span
                    className="absolute inset-y-0 left-0 bg-surface-3"
                    animate={{ width: `${zipping.total ? (zipping.done / zipping.total) * 100 : 0}%` }}
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
            </motion.button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
