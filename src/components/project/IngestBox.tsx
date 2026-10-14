"use client";

import { AnimatePresence, motion } from "motion/react";
import { ArrowUp, Check, Loader2, RotateCw, X } from "lucide-react";
import { useRef, useState } from "react";
import { extractShortcodes } from "@/lib/naming";

export type Job = {
  key: string;
  shortcode: string;
  stage: "queued" | "fetching" | "transcribing" | "done" | "error";
  detail?: string;
};

const STAGE_TEXT: Record<Job["stage"], string> = {
  queued: "대기 중",
  fetching: "게시물 받는 중",
  transcribing: "영상 전사 중",
  done: "완료",
  error: "실패",
};

export function IngestBox({
  jobs,
  placeholder,
  onSubmit,
  onRetry,
  onDismiss,
}: {
  jobs: Job[];
  placeholder?: string;
  onSubmit: (codes: string[]) => void;
  onRetry: (job: Job) => void;
  onDismiss: (job: Job) => void;
}) {
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  const codes = extractShortcodes(text);

  function submit() {
    if (!codes.length) return;
    onSubmit(codes);
    setText("");
    if (ref.current) ref.current.style.height = "";
  }

  return (
    <div>
      <div className="flex items-end gap-2 rounded-lg bg-surface-2 p-1.5 transition-shadow focus-within:bg-surface focus-within:shadow-[var(--shadow-lg)] focus-within:ring-1 focus-within:ring-surface-3">
        <textarea
          ref={ref}
          rows={1}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            e.target.style.height = "";
            e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`;
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={placeholder ?? "인스타 링크를 붙여넣으세요"}
          className="no-scrollbar max-h-[200px] min-h-12 min-w-0 flex-1 resize-none bg-transparent px-3.5 py-3 text-[15px] leading-6 outline-none placeholder:text-mute"
        />
        <motion.button
          type="button"
          onClick={submit}
          disabled={!codes.length}
          className="press flex h-12 shrink-0 items-center gap-1.5 rounded-md bg-ink px-5 text-[14px] font-semibold text-on-ink transition-opacity disabled:opacity-25"
        >
          <AnimatePresence mode="popLayout" initial={false}>
            {codes.length > 1 && (
              <motion.span
                key={codes.length}
                initial={{ y: 10, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -10, opacity: 0 }}
                className="tabular-nums"
              >
                {codes.length}개
              </motion.span>
            )}
          </AnimatePresence>
          <span className="hidden sm:inline">가져오기</span>
          <ArrowUp size={16} className="sm:hidden" />
        </motion.button>
      </div>

      <motion.ul layout className="mt-3 flex flex-col gap-1.5">
        <AnimatePresence initial={false}>
          {jobs.map((job) => (
            <motion.li
              key={job.key}
              layout
              initial={{ opacity: 0, height: 0, y: -6 }}
              animate={{ opacity: 1, height: "auto", y: 0 }}
              exit={{ opacity: 0, height: 0, transition: { duration: 0.2 } }}
              className="overflow-hidden"
            >
              <div className="flex items-center gap-3 rounded-md bg-surface-2 px-4 py-2.5">
                <StageIcon stage={job.stage} />
                <span className="font-mono text-[13px] text-ink-2">{job.shortcode}</span>
                <span className={`min-w-0 flex-1 truncate text-[14px] ${job.stage === "error" ? "text-danger" : "text-ink-2"}`}>
                  {job.detail ?? STAGE_TEXT[job.stage]}
                </span>
                {job.stage === "error" && (
                  <>
                    <button onClick={() => onRetry(job)} className="grid size-8 place-items-center rounded-full text-ink-2 hover:bg-surface-2" aria-label="다시 시도">
                      <RotateCw size={15} />
                    </button>
                    <button onClick={() => onDismiss(job)} className="grid size-8 place-items-center rounded-full text-ink-2 hover:bg-surface-2" aria-label="닫기">
                      <X size={15} />
                    </button>
                  </>
                )}
              </div>
              {(job.stage === "fetching" || job.stage === "transcribing") && <Indeterminate />}
            </motion.li>
          ))}
        </AnimatePresence>
      </motion.ul>
    </div>
  );
}

function StageIcon({ stage }: { stage: Job["stage"] }) {
  return (
    <span className="grid size-5 place-items-center">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span key={stage} initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.4, opacity: 0 }}>
          {stage === "done" ? (
            <span className="grid size-5 place-items-center rounded-full bg-ink text-on-ink">
              <Check size={12} strokeWidth={3} />
            </span>
          ) : stage === "error" ? (
            <span className="grid size-5 place-items-center rounded-full bg-danger text-white">
              <X size={12} strokeWidth={3} />
            </span>
          ) : stage === "queued" ? (
            <span className="block size-2 rounded-full bg-mute" />
          ) : (
            <Loader2 size={17} className="animate-spin text-ink" />
          )}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

function Indeterminate() {
  return (
    <div className="relative mx-4 -mt-1 h-0.5 overflow-hidden rounded-full bg-surface-2">
      <motion.div
        className="absolute inset-y-0 w-1/3 rounded-full bg-ink"
        animate={{ x: ["-100%", "300%"] }}
        transition={{ duration: 1.3, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}
