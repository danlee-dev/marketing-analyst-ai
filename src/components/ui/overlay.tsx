"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

export const EASE = [0.05, 0.7, 0.1, 1] as const;

// 전역 확인창 / 이름 입력창 / 토스트. 어디서든 await ask(...) 로 쓴다.
type Ask = { kind: "ask"; title: string; body?: string; confirm: string; danger?: boolean; resolve: (v: boolean) => void };
type Prompt = {
  kind: "prompt";
  title: string;
  body?: string;
  placeholder?: string;
  initial?: string;
  confirm: string;
  resolve: (v: string | null) => void;
};
type Toast = { id: number; text: string; tone?: "error" };

let dialog: Ask | Prompt | null = null;
let progress: { label: string; done: number; total: number } | null = null;
let toasts: Toast[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function ask(o: Omit<Ask, "kind" | "resolve" | "confirm"> & { confirm?: string }) {
  return new Promise<boolean>((resolve) => {
    dialog = { kind: "ask", confirm: "확인", ...o, resolve };
    emit();
  });
}

export function promptText(o: Omit<Prompt, "kind" | "resolve" | "confirm"> & { confirm?: string }) {
  return new Promise<string | null>((resolve) => {
    dialog = { kind: "prompt", confirm: "만들기", ...o, resolve };
    emit();
  });
}

export function toast(text: string, tone?: "error") {
  const id = Date.now() + Math.random();
  toasts = [...toasts, { id, text, tone }];
  emit();
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id);
    emit();
  }, 3600);
}

// 오래 걸리는 작업(zip 등) 진행 표시. null 이면 숨김
export function setProgress(p: { label: string; done: number; total: number } | null) {
  progress = p;
  emit();
}

export function toastError(e: unknown) {
  toast(e instanceof Error ? e.message : "문제가 생겼어요", "error");
}

function close(value: boolean | string | null) {
  if (!dialog) return;
  if (dialog.kind === "ask") dialog.resolve(value === true);
  else dialog.resolve(typeof value === "string" ? value : null);
  dialog = null;
  emit();
}

export function OverlayHost() {
  const current = useSyncExternalStore(subscribe, () => dialog, () => null);
  const list = useSyncExternalStore(subscribe, () => toasts, () => toasts);
  const job = useSyncExternalStore(subscribe, () => progress, () => null);
  return (
    <>
      <Modal open={!!current} onClose={() => close(null)} width={400}>
        {current && <DialogBody key={current.title} d={current} />}
      </Modal>
      <AnimatePresence>
        {job && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16, transition: { duration: 0.2 } }}
            transition={{ duration: 0.35, ease: EASE }}
            className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-[80] w-72 rounded-lg bg-ink p-4 text-on-ink shadow-[var(--shadow-lg)]"
          >
            <div className="flex items-center justify-between gap-3 text-[14px] font-semibold">
              <span className="truncate">{job.label}</span>
              <span className="shrink-0 tabular-nums opacity-70">
                {job.done}/{job.total}
              </span>
            </div>
            <div className="mt-3 h-1 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--on-ink)_20%,transparent)]">
              <motion.div
                className="h-full origin-left rounded-full bg-on-ink"
                initial={{ scaleX: 0 }}
                animate={{ scaleX: job.total ? job.done / job.total : 0 }}
                transition={{ duration: 0.3, ease: EASE }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[80] flex flex-col items-center gap-2 px-4">
        <AnimatePresence>
          {list.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.96, transition: { duration: 0.15 } }}
              transition={{ duration: 0.35, ease: EASE }}
              className={`max-w-sm rounded-full px-4 py-2.5 text-[14px] font-medium leading-snug shadow-[var(--shadow-lg)] ${
                t.tone === "error" ? "bg-danger text-white" : "bg-ink text-on-ink"
              }`}
            >
              {t.text}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </>
  );
}

function DialogBody({ d }: { d: Ask | Prompt }) {
  const [value, setValue] = useState(d.kind === "prompt" ? (d.initial ?? "") : "");
  const submit = () => {
    if (d.kind === "prompt") {
      if (value.trim()) close(value.trim());
    } else close(true);
  };
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="p-6"
    >
      <h2 className="text-[17px] font-bold">{d.title}</h2>
      {d.body && <p className="mt-2 text-[15px] text-ink-2">{d.body}</p>}
      {d.kind === "prompt" && (
        <input
          autoFocus
          onFocus={(e) => e.currentTarget.select()}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={d.placeholder}
          maxLength={60}
          className="mt-4 h-12 w-full rounded-md bg-surface-2 px-4 text-[15px] outline-none placeholder:text-mute focus:ring-1 focus:ring-ink/25"
        />
      )}
      <div className="mt-6 flex justify-end gap-2">
        <button type="button" onClick={() => close(null)} className="press h-11 rounded-md px-4 text-[15px] font-semibold text-ink-2 hover:bg-surface-2">
          취소
        </button>
        <button
          type="submit"
          autoFocus={d.kind === "ask"}
          disabled={d.kind === "prompt" && !value.trim()}
          className={`press h-11 rounded-md px-5 text-[15px] font-semibold disabled:opacity-30 ${
            d.kind === "ask" && d.danger ? "bg-danger text-white" : "bg-ink text-on-ink"
          }`}
        >
          {d.confirm}
        </button>
      </div>
    </form>
  );
}

export function Modal({
  open,
  onClose,
  width = 480,
  children,
}: {
  open: boolean;
  onClose: () => void;
  width?: number;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[70] grid place-items-center p-4">
          <motion.div
            className="absolute inset-0 bg-black"
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.36 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.15 } }}
            transition={{ duration: 0.3, ease: EASE }}
            style={{ maxWidth: width }}
            className="relative max-h-[85dvh] w-full overflow-y-auto rounded-xl bg-surface shadow-[var(--shadow-lg)]"
          >
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

// 트리거 옆에 뜨는 메뉴. 접힘 애니메이션(overflow-hidden)이나 스크롤 영역에 잘리지 않게 body 로 포털해 fixed 로 띄운다.
export function Popover({
  trigger,
  children,
  align = "start",
  side = "bottom",
}: {
  trigger: (props: { open: boolean; toggle: (e: React.MouseEvent<HTMLElement>) => void }) => React.ReactNode;
  children: (close: () => void) => React.ReactNode;
  align?: "start" | "end";
  side?: "bottom" | "top";
}) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const anchor = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!anchor.current?.contains(t) && !menu.current?.contains(t)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [open]);

  // 위치는 클릭한 트리거 요소에서 읽는다 (렌더 중 ref 접근 금지)
  const toggle = (e: React.MouseEvent<HTMLElement>) => {
    if (!open) setRect(e.currentTarget.getBoundingClientRect());
    setOpen((o) => !o);
  };

  const style: React.CSSProperties = rect
    ? {
        position: "fixed",
        ...(side === "bottom" ? { top: rect.bottom + 6 } : { bottom: window.innerHeight - rect.top + 6 }),
        ...(align === "start" ? { left: Math.max(8, rect.left) } : { right: Math.max(8, window.innerWidth - rect.right) }),
        transformOrigin: `${side === "bottom" ? "top" : "bottom"} ${align === "start" ? "left" : "right"}`,
      }
    : {};

  return (
    <div ref={anchor} className="relative">
      {trigger({ open, toggle })}
      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {open && rect && (
              <motion.div
                ref={menu}
                initial={{ opacity: 0, scale: 0.96, y: side === "bottom" ? -4 : 4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.12 } }}
                transition={{ duration: 0.22, ease: EASE }}
                style={style}
                className="z-[75] max-h-[min(420px,70dvh)] min-w-56 overflow-y-auto rounded-lg bg-surface p-1.5 text-ink shadow-[var(--shadow-lg)]"
              >
                {children(() => setOpen(false))}
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </div>
  );
}

export function MenuItem({
  icon,
  children,
  onClick,
  danger,
  active,
}: {
  icon?: React.ReactNode;
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`press flex h-10 w-full items-center gap-2.5 rounded-md px-3 text-left text-[14px] ${
        danger ? "text-danger hover:bg-surface-2" : active ? "bg-surface-2 font-semibold text-ink" : "text-ink hover:bg-surface-2"
      }`}
    >
      {icon && <span className="grid size-4 place-items-center text-ink-2">{icon}</span>}
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </button>
  );
}
