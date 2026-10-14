"use client";

import { AnimatePresence, motion } from "motion/react";
import { ArrowUpRight, ChevronDown, Download, FileUp, Folder as FolderIcon, Loader2, Mic, RotateCw, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { fileUrl } from "@/lib/client/api";
import { fmtTime, KIND_LABEL } from "@/lib/naming";
import { isNoAudio, type Post, type Project, type TranscriptLine } from "@/lib/types";
import { EASE, Popover } from "../ui/overlay";
import { useWorkspace } from "../workspace/context";
import { MoveMenu } from "./SelectionBar";
import ReactMarkdown from "react-markdown";
import { SOURCE_LABEL } from "@/lib/sources/detect";

const n = (v: number | null) => (v == null ? null : v.toLocaleString("ko-KR"));
const size = (b: number) => (b > 1e6 ? `${(b / 1e6).toFixed(1)}MB` : `${Math.max(1, Math.round(b / 1e3))}KB`);

type Props = {
  post: Post | null;
  project: Project;
  busy: boolean;
  uploading: number | null;
  onClose: () => void;
  onChange: (patch: Partial<Pick<Post, "title" | "note" | "folder_id">>) => void;
  onUpload: (files: File[]) => void;
  onRemoveAttachment: (path: string) => void;
  onTranscribe: () => void;
  onDownload: () => void;
  onDelete: () => void;
  onOpenFolder: (id: string | null) => void;
};

export function PostSheet(props: Props) {
  const { post, onClose } = props;
  useEffect(() => {
    if (!post) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !document.querySelector("[role=dialog][aria-modal]") && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [post, onClose]);

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
            transition={{ duration: 0.25 }}
            onClick={onClose}
          />
          <motion.aside
            key="sheet"
            aria-label={post.title}
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%", transition: { duration: 0.25, ease: [0.3, 0, 0.8, 0.15] } }}
            transition={{ duration: 0.4, ease: EASE }}
            className="fixed inset-y-0 right-0 z-50 flex w-full flex-col bg-surface shadow-[var(--shadow-lg)] sm:inset-y-2 sm:right-2 sm:w-[580px] sm:rounded-xl"
          >
            <Body key={post.id} {...props} post={post} />
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function Body({ post, project, busy, uploading, onClose, onChange, onUpload, onRemoveAttachment, onTranscribe, onDownload, onDelete, onOpenFolder }: Props & { post: Post }) {
  const w = useWorkspace();
  const [title, setTitle] = useState(post.title);
  const [note, setNote] = useState(post.note);
  const [active, setActive] = useState(0);
  const [over, setOver] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const videos = post.media.filter((m) => m.kind === "video");
  const folder = w.folders.find((f) => f.id === post.folder_id) ?? null;
  const stats = [
    n(post.likes) && `좋아요 ${n(post.likes)}`,
    n(post.comments) && `댓글 ${n(post.comments)}`,
    n(post.views) && `조회 ${n(post.views)}`,
    new Date(post.taken_at).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" }),
  ].filter(Boolean);

  return (
    <div
      className="relative flex min-h-0 flex-1 flex-col"
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (e.dataTransfer.files.length) onUpload([...e.dataTransfer.files]);
      }}
    >
      <header className="flex items-center gap-3 px-6 pb-3 pt-[max(1rem,env(safe-area-inset-top))] sm:pt-5">
        <a href={post.account.profileUrl} target="_blank" rel="noreferrer" className="flex min-w-0 flex-1 items-center gap-3">
          {post.account.profilePicPath ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={fileUrl(post.account.profilePicPath)} alt="" className="size-10 rounded-full bg-surface-2 object-cover" />
          ) : (
            <span className="size-10 rounded-full bg-surface-2" />
          )}
          <span className="min-w-0">
            <span className="block truncate text-[15px] font-semibold leading-tight">@{post.account.username}</span>
            {post.account.fullName && <span className="block truncate text-[13px] text-mute">{post.account.fullName}</span>}
          </span>
        </a>
        <button aria-label="닫기" onClick={onClose} className="press grid size-10 place-items-center rounded-full text-ink-2 hover:bg-surface-2 hover:text-ink">
          <X size={19} />
        </button>
      </header>

      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-6 pb-16">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => title.trim() && title !== post.title && onChange({ title: title.trim() })}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          aria-label="제목 (zip 폴더 이름에 쓰여요)"
          className="-mx-2 w-[calc(100%+1rem)] rounded-sm bg-transparent px-2 py-1 text-[24px] font-bold tracking-[-0.02em] outline-none transition-colors hover:bg-surface-2 focus:bg-surface-2"
        />
        <p className="mt-1 text-[14px] text-mute">{stats.join(" · ")}</p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Popover
            trigger={({ toggle }) => (
              <button onClick={toggle} className="press flex h-10 items-center gap-2 rounded-md bg-surface-2 px-3.5 text-[14px] font-semibold hover:bg-surface-3">
                <FolderIcon size={15} className="opacity-60" />
                {folder?.name ?? `${project.name} (맨 위)`}
                <ChevronDown size={14} className="opacity-60" />
              </button>
            )}
          >
            {(close) => (
              <MoveMenu
                project={project}
                current={post.folder_id}
                onPick={(id) => {
                  close();
                  if (id !== post.folder_id) onChange({ folder_id: id });
                }}
              />
            )}
          </Popover>
          {folder && (
            <button onClick={() => onOpenFolder(folder.id)} className="press h-10 rounded-md px-3 text-[14px] text-ink-2 hover:bg-surface-2">
              폴더 열기
            </button>
          )}
        </div>

        {post.source === "youtube" ? (
          <div className={`mt-5 overflow-hidden rounded-lg bg-surface-2 ${post.site?.includes("shorts") ? "mx-auto aspect-[9/16] max-h-[70dvh]" : "aspect-video"}`}>
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${post.shortcode}`}
              title={post.title}
              allow="accelerometer; encrypted-media; picture-in-picture"
              allowFullScreen
              className="size-full"
            />
          </div>
        ) : post.source === "tiktok" ? (
          <div className="mx-auto mt-5 aspect-[9/16] max-h-[75dvh] overflow-hidden rounded-lg bg-surface-2">
            <iframe src={`https://www.tiktok.com/embed/v2/${post.shortcode}`} title={post.title} allow="encrypted-media" className="size-full" />
          </div>
        ) : !post.media.length ? (
          post.thumb_path ? (
            <a href={post.url} target="_blank" rel="noreferrer" className="mt-5 block overflow-hidden rounded-lg bg-surface-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={fileUrl(post.thumb_path)} alt="" className="w-full object-cover" />
            </a>
          ) : null
        ) : (
        <div className="mt-5">
          <div
            ref={scroller}
            onScroll={(e) => setActive(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}
            className="no-scrollbar flex snap-x snap-mandatory overflow-x-auto rounded-lg bg-surface-2"
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
            <div className="mt-3 flex justify-center gap-1">
              {post.media.map((m, i) => (
                <button
                  key={m.index}
                  aria-label={`${i + 1}번째`}
                  onClick={() => scroller.current?.scrollTo({ left: i * scroller.current.clientWidth, behavior: "smooth" })}
                  className="p-1"
                >
                  <motion.span className="block h-1.5 rounded-full bg-ink" animate={{ width: i === active ? 18 : 6, opacity: i === active ? 1 : 0.25 }} transition={{ duration: 0.25 }} />
                </button>
              ))}
            </div>
          )}
        </div>
        )}

        <div className="mt-5 flex flex-wrap gap-2">
          <Action onClick={onDownload} primary>
            <Download size={16} /> zip 받기
          </Action>
          {post.url && (
            <Action href={post.url}>
              <ArrowUpRight size={16} /> {post.source === "web" ? "사이트 열기" : `${SOURCE_LABEL[post.source]}에서 보기`}
            </Action>
          )}
        </div>
        {post.music && <p className="mt-3 text-[14px] text-ink-2">음악 · {post.music}</p>}

        <Section title="메모">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onBlur={() => note !== post.note && onChange({ note })}
            rows={3}
            placeholder="왜 저장했는지, 따라 할 점, 팀에게 남길 말"
            className="w-full resize-y rounded-md bg-surface-2 px-4 py-3 text-[15px] leading-relaxed outline-none placeholder:text-mute focus:ring-1 focus:ring-ink/25"
          />
        </Section>

        {post.caption && post.format !== "text" && post.format !== "note" && (
          <Section title={post.source === "web" ? "요약" : "캡션"}>
            <p className="whitespace-pre-wrap text-[15px] leading-[1.7] text-ink-2">{post.caption}</p>
          </Section>
        )}

        {post.body && post.body.trim() !== post.caption.trim() || post.format === "text" || post.format === "note" ? (
          <Section title={post.format === "article" ? "본문" : "내용"}>
            <div className="prose-ref text-[15px] leading-[1.75] text-ink-2">
              <ReactMarkdown
                components={{
                  a: ({ href, children }) => (
                    <a href={href} target="_blank" rel="noreferrer" className="text-ink underline underline-offset-4">
                      {children}
                    </a>
                  ),
                  img: () => null,
                }}
              >
                {(post.body || post.caption).slice(0, 40_000)}
              </ReactMarkdown>
            </div>
          </Section>
        ) : null}

        {(videos.length > 0 || post.transcripts.length > 0) && (
          <Section
            title="영상 전사"
            action={
              busy ? (
                <span className="flex items-center gap-1.5 text-[14px] text-ink-2">
                  <Loader2 size={14} className="animate-spin" /> 전사 중
                </span>
              ) : !videos.length ? null : (
                <button onClick={onTranscribe} className="press flex h-9 items-center gap-1.5 rounded-md px-3 text-[14px] text-ink-2 hover:bg-surface-2">
                  {post.transcripts.length ? <RotateCw size={14} /> : <Mic size={14} />}
                  {post.transcripts.length ? "다시 전사" : "전사하기"}
                </button>
              )
            }
          >
            {post.transcripts.length === 0 && !busy && <p className="text-[15px] text-mute">아직 전사하지 않았어요.</p>}
            <div className="flex flex-col gap-6">
              {post.transcripts.map((t) => (
                <div key={t.mediaIndex}>
                  {post.media.length > 1 && <p className="mb-2 text-[14px] font-semibold text-ink-2">{t.mediaIndex}번째 영상</p>}
                  {isNoAudio(t) ? (
                    <p className="text-[15px] text-mute">소리가 없는 영상이에요.</p>
                  ) : t.status === "error" ? (
                    <p className="text-[15px] text-danger">전사하지 못했어요. 다시 전사를 눌러 주세요.</p>
                  ) : t.lines.length === 0 ? (
                    <p className="text-[15px] text-mute">
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
            <button onClick={() => input.current?.click()} className="press flex h-9 items-center gap-1.5 rounded-md px-3 text-[14px] text-ink-2 hover:bg-surface-2">
              <FileUp size={14} /> 파일 추가
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
                  <motion.div className="h-full origin-left rounded-full bg-ink" initial={{ scaleX: 0 }} animate={{ scaleX: uploading / 100 }} />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          {post.attachments.length === 0 ? (
            <button onClick={() => input.current?.click()} className="press w-full rounded-md bg-surface-2 px-4 py-6 text-center text-[15px] text-mute hover:text-ink-2">
              DM으로 받은 파일을 여기로 끌어 놓거나 눌러서 고르세요
            </button>
          ) : (
            <motion.ul layout className="flex flex-col gap-1">
              <AnimatePresence initial={false}>
                {post.attachments.map((a) => (
                  <motion.li
                    key={a.path}
                    layout
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 8 }}
                    className="flex items-center gap-3 rounded-md px-3 py-2 hover:bg-surface-2"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px]">{a.name}</span>
                      <span className="text-[13px] text-mute">{size(a.size)}</span>
                    </span>
                    <a href={`${fileUrl(a.path)}&dl=${encodeURIComponent(a.name)}`} aria-label="내려받기" className="press grid size-9 place-items-center rounded-full text-ink-2 hover:bg-surface-3">
                      <Download size={15} />
                    </a>
                    <button onClick={() => onRemoveAttachment(a.path)} aria-label="삭제" className="press grid size-9 place-items-center rounded-full text-ink-2 hover:bg-surface-3 hover:text-danger">
                      <Trash2 size={15} />
                    </button>
                  </motion.li>
                ))}
              </AnimatePresence>
            </motion.ul>
          )}
        </Section>

        <button onClick={onDelete} className="mt-12 text-[14px] text-mute hover:text-danger">
          이 게시물 삭제
        </button>
      </div>

      <AnimatePresence>
        {over && (
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none absolute inset-2 z-10 grid place-items-center rounded-lg bg-ink text-on-ink"
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
    <li className="grid grid-cols-[3.25rem_1fr] gap-2 text-[15px] leading-[1.6]">
      <span className="pt-0.5 font-mono text-[13px] text-mute">{fmtTime(line.start)}</span>
      <span className={kind === "song" ? "text-song" : "text-ink"}>
        {kind && kind !== "speech" && <span className={`mr-1.5 text-[13px] font-semibold ${kind === "song" ? "text-song" : "text-music"}`}>{KIND_LABEL[kind]}</span>}
        {line.text}
      </span>
    </li>
  );
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <div className="mb-3 flex min-h-9 items-center justify-between">
        <h3 className="text-[17px] font-bold">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function Action({ children, onClick, href, primary }: { children: React.ReactNode; onClick?: () => void; href?: string; primary?: boolean }) {
  const cls = `press flex h-11 items-center gap-2 rounded-md px-4 text-[14px] font-semibold ${primary ? "bg-ink text-on-ink" : "bg-surface-2 text-ink hover:bg-surface-3"}`;
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
