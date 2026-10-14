"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

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
  return (
    <>
      <Modal open={!!current} onClose={() => close(null)} width={400}>
        {current && <DialogBody key={current.title} d={current} />}
      </Modal>
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
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={d.placeholder}
          maxLength={60}
          className="mt-4 h-12 w-full rounded-md bg-surface-2 px-4 text-[15px] outline-none placeholder:text-mute focus:ring-2 focus:ring-ink"
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

// 트리거 아래에 뜨는 메뉴
export function Popover({
  trigger,
  children,
  align = "start",
  side = "bottom",
}: {
  trigger: (props: { open: boolean; toggle: () => void }) => React.ReactNode;
  children: (close: () => void) => React.ReactNode;
  align?: "start" | "end";
  side?: "bottom" | "top";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      {trigger({ open, toggle: () => setOpen((o) => !o) })}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: side === "bottom" ? -4 : 4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.12 } }}
            transition={{ duration: 0.22, ease: EASE }}
            style={{ transformOrigin: `${side === "bottom" ? "top" : "bottom"} ${align === "start" ? "left" : "right"}` }}
            className={`absolute z-50 min-w-56 rounded-lg bg-surface p-1.5 shadow-[var(--shadow-lg)] ${
              side === "bottom" ? "top-full mt-1.5" : "bottom-full mb-1.5"
            } ${align === "start" ? "left-0" : "right-0"}`}
          >
            {children(() => setOpen(false))}
          </motion.div>
        )}
      </AnimatePresence>
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
