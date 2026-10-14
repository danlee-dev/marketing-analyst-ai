"use client";

import { AnimatePresence, motion } from "motion/react";
import { ArrowUpRight, Download, FileUp, Loader2, Mic, RotateCw, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { fileUrl } from "@/lib/client/api";
import { fmtTime, KIND_LABEL } from "@/lib/naming";
import type { Post, TranscriptLine } from "@/lib/types";

const n = (v: number | null) => (v == null ? null : v.toLocaleString("ko-KR"));
const size = (b: number) => (b > 1e6 ? `${(b / 1e6).toFixed(1)}MB` : `${Math.max(1, Math.round(b / 1e3))}KB`);

export function PostSheet({
  post,
  busy,
  uploading,
  onClose,
  onRename,
  onUpload,
  onRemoveAttachment,
  onTranscribe,
  onDownload,
  onDelete,
}: {
  post: Post | null;
  busy: boolean;
  uploading: number | null;
  onClose: () => void;
  onRename: (title: string) => void;
  onUpload: (files: File[]) => void;
  onRemoveAttachment: (path: string) => void;
  onTranscribe: () => void;
  onDownload: () => void;
  onDelete: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <AnimatePresence>
      {post && (
        <>
          <motion.div
            key="scrim"
            className="fixed inset-0 z-40 bg-black"
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.32 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />
          <motion.aside
            key="sheet"
            role="dialog"
            aria-label={post.title}
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 40 }}
            className="fixed inset-y-0 right-0 z-50 flex w-full flex-col bg-bg shadow-[var(--shadow-lg)] sm:w-[560px] sm:rounded-l-[28px]"
          >
            <SheetBody
              key={post.id}
              post={post}
              busy={busy}
              uploading={uploading}
              onClose={onClose}
              onRename={onRename}
              onUpload={onUpload}
              onRemoveAttachment={onRemoveAttachment}
              onTranscribe={onTranscribe}
              onDownload={onDownload}
              onDelete={onDelete}
            />
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function SheetBody({
  post,
  busy,
  uploading,
  onClose,
  onRename,
  onUpload,
  onRemoveAttachment,
  onTranscribe,
  onDownload,
  onDelete,
}: Omit<Parameters<typeof PostSheet>[0], "post"> & { post: Post }) {
  const [title, setTitle] = useState(post.title);
  const [active, setActive] = useState(0);
  const [over, setOver] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const videos = post.media.filter((m) => m.kind === "video");
  const stats = [
    n(post.likes) && `좋아요 ${n(post.likes)}`,
    n(post.comments) && `댓글 ${n(post.comments)}`,
    n(post.views) && `조회 ${n(post.views)}`,
    new Date(post.takenAt).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" }),
  ].filter(Boolean);

  return (
    <div
      className="flex min-h-0 flex-1 flex-col"
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (e.dataTransfer.files.length) onUpload([...e.dataTransfer.files]);
      }}
    >
      <header className="flex items-center gap-3 px-5 pb-3 pt-[max(1rem,env(safe-area-inset-top))]">
        <a href={post.account.profileUrl} target="_blank" rel="noreferrer" className="flex min-w-0 flex-1 items-center gap-2.5">
          {post.account.profilePicPath ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={fileUrl(post.account.profilePicPath)} alt="" className="size-9 rounded-full bg-surface-2 object-cover" />
          ) : (
            <span className="size-9 rounded-full bg-surface-2" />
          )}
          <span className="min-w-0">
            <span className="block truncate text-[14px] font-semibold">@{post.account.username}</span>
            {post.account.fullName && <span className="block truncate text-[12.5px] text-mute">{post.account.fullName}</span>}
          </span>
        </a>
        <IconButton label="닫기" onClick={onClose}>
          <X size={18} />
        </IconButton>
      </header>

      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-5 pb-28">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => title.trim() && title !== post.title && onRename(title)}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          aria-label="제목 (폴더 이름에 쓰여요)"
          className="-mx-2 w-[calc(100%+1rem)] rounded-xl bg-transparent px-2 py-1 text-[22px] font-bold tracking-[-0.04em] outline-none transition-colors hover:bg-surface-2 focus:bg-surface-2"
        />
        <p className="mt-1 text-[13px] text-mute">{stats.join(" · ")}</p>

        <div className="relative mt-4">
          <div
            ref={scroller}
            onScroll={(e) => {
              const el = e.currentTarget;
              setActive(Math.round(el.scrollLeft / el.clientWidth));
            }}
            className="no-scrollbar flex snap-x snap-mandatory overflow-x-auto rounded-2xl bg-surface-2"
          >
            {post.media.map((m) => (
              <div key={m.index} className="grid aspect-[4/5] w-full shrink-0 snap-center place-items-center">
                {m.kind === "video" ? (
                  <video src={fileUrl(m.path)} controls playsInline preload="metadata" className="max-h-full w-full" />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={fileUrl(m.path)} alt="" className="max-h-full w-full object-contain" />
                )}
              </div>
            ))}
          </div>
          {post.media.length > 1 && (
            <div className="mt-2.5 flex justify-center gap-1.5">
              {post.media.map((m, i) => (
                <button
                  key={m.index}
                  aria-label={`${i + 1}번째`}
                  onClick={() => scroller.current?.scrollTo({ left: i * scroller.current.clientWidth, behavior: "smooth" })}
                  className="p-1"
                >
                  <motion.span
                    className="block h-1.5 rounded-full bg-ink"
                    animate={{ width: i === active ? 18 : 6, opacity: i === active ? 1 : 0.25 }}
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <ActionButton onClick={onDownload} primary>
            <Download size={15} /> 이 게시물 받기
          </ActionButton>
          <ActionButton href={post.url}>
            <ArrowUpRight size={15} /> 인스타에서 보기
          </ActionButton>
          {post.music && <span className="flex h-9 items-center px-1 text-[13px] text-ink-2">♪ {post.music}</span>}
        </div>

        <Section title="캡션">
          <p className="whitespace-pre-wrap break-words text-[14.5px] leading-[1.7] text-ink-2">{post.caption || "캡션 없음"}</p>
        </Section>

        {videos.length > 0 && (
          <Section
            title="영상 전사"
            action={
              busy ? (
                <span className="flex items-center gap-1.5 text-[13px] text-ink-2">
                  <Loader2 size={14} className="animate-spin" /> 전사 중
                </span>
              ) : (
                <button onClick={onTranscribe} className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[13px] text-ink-2 hover:bg-surface-2">
                  {post.transcripts.length ? <RotateCw size={13} /> : <Mic size={13} />}
                  {post.transcripts.length ? "다시 전사" : "전사하기"}
                </button>
              )
            }
          >
            {post.transcripts.length === 0 && !busy && <p className="text-[14px] text-mute">아직 전사하지 않았어요.</p>}
            <div className="flex flex-col gap-5">
              {post.transcripts.map((t) => (
                <div key={t.mediaIndex}>
                  {post.media.length > 1 && <p className="mb-2 text-[13px] font-semibold text-ink-2">{t.mediaIndex}번째 영상</p>}
                  {t.status === "error" ? (
                    <p className="text-[14px] text-danger">{t.error}</p>
                  ) : t.lines.length === 0 ? (
                    <p className="text-[14px] text-mute">
                      말이나 가사가 없어요{t.audio?.some((a) => a.kind === "music" || a.kind === "song") ? " (배경음악만 있음)" : ""}.
                    </p>
                  ) : (
                    <ol className="flex flex-col gap-2">
                      {t.lines.map((l, i) => (
                        <Line key={i} line={l} />
                      ))}
                    </ol>
                  )}
                </div>
              ))}
            </div>
          </Section>
        )}

        <Section
          title="DM 파일"
          action={
            <button
              onClick={() => input.current?.click()}
              className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[13px] text-ink-2 hover:bg-surface-2"
            >
              <FileUp size={13} /> 파일 추가
            </button>
          }
        >
          <input
            ref={input}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files?.length) onUpload([...e.target.files]);
              e.target.value = "";
            }}
          />
          <AnimatePresence initial={false}>
            {uploading != null && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
                <div className="mb-3 h-1 overflow-hidden rounded-full bg-surface-2">
                  <motion.div className="h-full rounded-full bg-ink" animate={{ width: `${uploading}%` }} />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          {post.attachments.length === 0 ? (
            <button
              onClick={() => input.current?.click()}
              className="w-full rounded-2xl bg-surface px-4 py-6 text-center text-[14px] text-mute transition-colors hover:text-ink-2"
            >
              DM으로 받은 파일을 여기로 끌어 놓거나 눌러서 고르세요
            </button>
          ) : (
            <motion.ul layout className="flex flex-col">
              <AnimatePresence initial={false}>
                {post.attachments.map((a) => (
                  <motion.li
                    key={a.path}
                    layout
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 8 }}
                    className="group flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-surface"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px]">{a.name}</span>
                      <span className="text-[12.5px] text-mute">{size(a.size)}</span>
                    </span>
                    <a
                      href={`${fileUrl(a.path)}&dl=${encodeURIComponent(a.name)}`}
                      aria-label="내려받기"
                      className="grid size-8 place-items-center rounded-full text-ink-2 hover:bg-surface-2"
                    >
                      <Download size={15} />
                    </a>
                    <button
                      onClick={() => onRemoveAttachment(a.path)}
                      aria-label="삭제"
                      className="grid size-8 place-items-center rounded-full text-ink-2 hover:bg-surface-2 hover:text-danger"
                    >
                      <Trash2 size={15} />
                    </button>
                  </motion.li>
                ))}
              </AnimatePresence>
            </motion.ul>
          )}
        </Section>

        <button onClick={onDelete} className="mt-10 text-[13px] text-mute transition-colors hover:text-danger">
          이 게시물 삭제
        </button>
      </div>

      <AnimatePresence>
        {over && (
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none absolute inset-3 z-10 grid place-items-center rounded-[24px] bg-ink text-on-ink"
          >
            <span className="flex items-center gap-2 text-[17px] font-semibold">
              <FileUp size={20} /> 놓으면 이 게시물에 추가돼요
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Line({ line }: { line: TranscriptLine }) {
  const kind = line.kind && line.kind !== "unknown" ? line.kind : null;
  return (
    <li className="grid grid-cols-[3.25rem_1fr] gap-2 text-[14.5px] leading-[1.6]">
      <span className="pt-px font-mono text-[12.5px] text-mute">{fmtTime(line.start)}</span>
      <span className={kind === "song" ? "text-song" : "text-ink"}>
        {kind && kind !== "speech" && (
          <span className={`mr-1.5 text-[12px] font-semibold ${kind === "song" ? "text-song" : "text-music"}`}>{KIND_LABEL[kind]}</span>
        )}
        {line.text}
      </span>
    </li>
  );
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[16px] font-bold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button aria-label={label} onClick={onClick} className="grid size-9 place-items-center rounded-full text-ink-2 hover:bg-surface-2 hover:text-ink">
      {children}
    </button>
  );
}

function ActionButton({ children, onClick, href, primary }: { children: React.ReactNode; onClick?: () => void; href?: string; primary?: boolean }) {
  const cls = `flex h-9 items-center gap-1.5 rounded-full px-4 text-[13.5px] font-semibold transition active:scale-95 ${
    primary ? "bg-ink text-on-ink" : "bg-surface text-ink hover:bg-surface-2"
  }`;
  return href ? (
    <a href={href} target="_blank" rel="noreferrer" className={cls}>
      {children}
    </a>
  ) : (
    <button onClick={onClick} className={cls}>
      {children}
    </button>
  );
}
