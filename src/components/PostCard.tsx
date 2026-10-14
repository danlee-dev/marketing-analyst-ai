"use client";

import { motion } from "motion/react";
import { Check, Copy, Loader2, Paperclip, Play } from "lucide-react";
import { useState } from "react";
import { fileUrl } from "@/lib/client/api";
import type { Post } from "@/lib/types";

const date = (iso: string) => new Date(iso).toLocaleDateString("ko-KR", { month: "short", day: "numeric" });

export function PostCard({
  post,
  index,
  selected,
  selecting,
  busy,
  onToggle,
  onOpen,
  onDropFiles,
}: {
  post: Post;
  index: number;
  selected: boolean;
  selecting: boolean;
  busy: boolean;
  onToggle: (shift: boolean) => void;
  onOpen: () => void;
  onDropFiles: (files: File[]) => void;
}) {
  const [over, setOver] = useState(false);
  const videos = post.media.filter((m) => m.kind === "video").length;
  const done = post.transcripts.filter((t) => t.status === "done").length;

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 18, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1, transition: { delay: Math.min(index * 0.035, 0.35) } }}
      exit={{ opacity: 0, scale: 0.94, transition: { duration: 0.18 } }}
      className="group relative"
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (e.dataTransfer.files.length) onDropFiles([...e.dataTransfer.files]);
      }}
    >
      <motion.div
        animate={{ scale: over ? 0.97 : selected ? 0.95 : 1 }}
        className={`relative aspect-[4/5] cursor-pointer overflow-hidden rounded-2xl bg-surface-2 outline-offset-[3px] transition-[outline-color] ${
          selected || over ? "outline-2 outline-ink" : "outline-2 outline-transparent"
        }`}
        onClick={(e) => (selecting ? onToggle(e.shiftKey) : onOpen())}
      >
        {post.thumbPath && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={fileUrl(post.thumbPath)}
            alt=""
            loading="lazy"
            className="size-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]"
          />
        )}

        <div className="absolute right-2.5 top-2.5 flex gap-1">
          {post.type !== "image" && (
            <span className="flex h-6 items-center gap-1 rounded-full bg-black px-2 text-[11px] font-semibold text-white">
              {post.type === "carousel" ? <Copy size={11} /> : <Play size={10} fill="currentColor" />}
              {post.type === "carousel" && post.media.length}
            </span>
          )}
        </div>

        <motion.button
          type="button"
          aria-label={selected ? "선택 해제" : "선택"}
          onClick={(e) => {
            e.stopPropagation();
            onToggle(e.shiftKey);
          }}
          initial={false}
          animate={{ scale: selected ? 1 : 0.9 }}
          whileTap={{ scale: 0.8 }}
          className={`absolute left-2.5 top-2.5 grid size-7 place-items-center rounded-full transition-opacity ${
            selected ? "bg-ink text-on-ink opacity-100" : "bg-white text-black opacity-0 shadow group-hover:opacity-100"
          } ${selecting ? "opacity-100" : ""}`}
        >
          {selected ? <Check size={15} strokeWidth={3} /> : <span className="size-3.5 rounded-full border-2 border-black/70" />}
        </motion.button>

        {over && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-x-2.5 bottom-2.5 rounded-xl bg-ink px-3 py-2 text-center text-[13px] font-semibold text-on-ink"
          >
            이 게시물에 파일 추가
          </motion.div>
        )}
      </motion.div>

      <button type="button" onClick={onOpen} className="mt-2.5 block w-full px-0.5 text-left">
        <p className="line-clamp-2 text-[14px] font-semibold leading-[1.35]">{post.title}</p>
        <p className="mt-1 flex items-center gap-1.5 truncate text-[13px] text-mute">
          <span className="truncate">@{post.account.username}</span>
          <span>·</span>
          <span className="shrink-0">{date(post.takenAt)}</span>
        </p>
        {(busy || videos > 0 || post.attachments.length > 0) && (
          <p className="mt-1 flex items-center gap-2.5 text-[12.5px] text-ink-2">
            {busy ? (
              <span className="flex items-center gap-1">
                <Loader2 size={12} className="animate-spin" /> 전사 중
              </span>
            ) : videos > 0 ? (
              <span>{done >= videos ? "전사 완료" : `전사 ${done}/${videos}`}</span>
            ) : null}
            {post.attachments.length > 0 && (
              <span className="flex items-center gap-0.5">
                <Paperclip size={12} /> {post.attachments.length}
              </span>
            )}
          </p>
        )}
      </button>
    </motion.li>
  );
}
