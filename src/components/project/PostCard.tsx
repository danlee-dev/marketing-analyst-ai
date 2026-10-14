"use client";

import { motion } from "motion/react";
import { Check, Copy, Folder as FolderIcon, Loader2, Paperclip, Play } from "lucide-react";
import { useState } from "react";
import { fileUrl } from "@/lib/client/api";
import type { Post } from "@/lib/types";
import { EASE } from "../ui/overlay";
import { POST_DRAG } from "../workspace/Sidebar";

const date = (iso: string) => new Date(iso).toLocaleDateString("ko-KR", { month: "short", day: "numeric" });

export function PostCard({
  post,
  index,
  folderName,
  selected,
  selecting,
  busy,
  onToggle,
  onOpen,
  onDropFiles,
  dragIds,
}: {
  post: Post;
  index: number;
  folderName?: string;
  selected: boolean;
  selecting: boolean;
  busy: boolean;
  onToggle: (shift: boolean) => void;
  onOpen: () => void;
  onDropFiles: (files: File[]) => void;
  dragIds: () => string[];
}) {
  const [over, setOver] = useState(false);
  const [dragging, setDragging] = useState(false);
  const videos = post.media.filter((m) => m.kind === "video").length;
  const done = post.transcripts.filter((t) => t.status === "done").length;

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: dragging ? 0.4 : 1, y: 0, transition: { duration: 0.45, ease: EASE, delay: Math.min(index * 0.035, 0.35) } }}
      exit={{ opacity: 0, scale: 0.94, transition: { duration: 0.18 } }}
      className="group relative"
    >
      {/* 드래그는 motion 이벤트와 겹치지 않게 안쪽 div 에서 */}
      <div
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData(POST_DRAG, JSON.stringify({ ids: dragIds(), projectId: post.project_id }));
          e.dataTransfer.effectAllowed = "move";
          setDragging(true);
        }}
        onDragEnd={() => setDragging(false)}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes("Files")) return;
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          if (!e.dataTransfer.files.length) return;
          e.preventDefault();
          setOver(false);
          onDropFiles([...e.dataTransfer.files]);
        }}
      >
        <motion.div
          animate={{ scale: over ? 0.97 : selected ? 0.94 : 1 }}
          transition={{ duration: 0.25, ease: EASE }}
          className={`relative aspect-[4/5] cursor-pointer overflow-hidden rounded-lg bg-surface-2 outline-2 outline-offset-[3px] transition-[outline-color] ${
            selected || over ? "outline-ink" : "outline-transparent"
          }`}
          onClick={(e) => (selecting ? onToggle(e.shiftKey) : onOpen())}
        >
          {post.thumb_path && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={fileUrl(post.thumb_path)}
              alt=""
              loading="lazy"
              draggable={false}
              className="size-full object-cover transition-transform duration-500 ease-[cubic-bezier(0.05,0.7,0.1,1)] group-hover:scale-[1.04]"
            />
          )}

          {post.type !== "image" && (
            <span className="absolute right-3 top-3 flex h-6 items-center gap-1 rounded-full bg-black px-2 text-[12px] font-semibold text-white">
              {post.type === "carousel" ? <Copy size={11} /> : <Play size={10} fill="currentColor" />}
              {post.type === "carousel" && post.media.length}
            </span>
          )}

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
            className={`absolute left-3 top-3 grid size-7 place-items-center rounded-full transition-opacity ${
              selected ? "bg-ink text-on-ink opacity-100" : "bg-white text-black opacity-0 shadow group-hover:opacity-100"
            } ${selecting ? "opacity-100" : ""}`}
          >
            {selected ? <Check size={15} strokeWidth={3} /> : <span className="size-3.5 rounded-full border-2 border-neutral-500" />}
          </motion.button>

          {over && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="absolute inset-x-3 bottom-3 rounded-md bg-ink px-3 py-2 text-center text-[13px] font-semibold text-on-ink"
            >
              이 게시물에 파일 추가
            </motion.div>
          )}
        </motion.div>
      </div>

      <button type="button" onClick={onOpen} className="mt-3 block w-full px-0.5 text-left">
        <p className="line-clamp-2 text-[15px] font-semibold leading-snug">{post.title}</p>
        <p className="mt-1 flex items-center gap-1.5 truncate text-[13px] text-mute">
          <span className="truncate">@{post.account.username}</span>
          <span aria-hidden>·</span>
          <span className="shrink-0">{date(post.taken_at)}</span>
        </p>
        {(busy || videos > 0 || post.attachments.length > 0 || folderName) && (
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[13px] text-ink-2">
            {busy ? (
              <span className="flex items-center gap-1">
                <Loader2 size={12} className="animate-spin" /> 전사 중
              </span>
            ) : videos > 0 ? (
              <span>{done >= videos ? "전사 완료" : `전사 ${done}/${videos}`}</span>
            ) : null}
            {post.attachments.length > 0 && (
              <span className="flex items-center gap-1">
                <Paperclip size={12} /> {post.attachments.length}
              </span>
            )}
            {folderName && (
              <span className="flex min-w-0 items-center gap-1">
                <FolderIcon size={12} /> <span className="truncate">{folderName}</span>
              </span>
            )}
          </p>
        )}
      </button>
    </motion.li>
  );
}
