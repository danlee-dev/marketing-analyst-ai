"use client";

import { upload } from "@vercel/blob/client";
import { AnimatePresence, motion } from "motion/react";
import { FileUp, Loader2, X } from "lucide-react";
import { useRef, useState } from "react";
import { supabase } from "@/lib/supabase/browser";
import { safeName } from "@/lib/naming";
import type { Attachment, Format, MediaItem, Post, Project } from "@/lib/types";
import { Modal, toastError } from "../ui/overlay";
import { useWorkspace } from "../workspace/context";

// 링크가 없는 레퍼런스: 캡처·이미지·영상·PDF·메모를 직접 올려 카드로 만든다
export function AddDialog({
  open,
  onClose,
  project,
  folderId,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  project: Project;
  folderId: string | null;
  onCreated: (post: Post) => void;
}) {
  return (
    <Modal open={open} onClose={onClose} width={520}>
      {open && <Body onClose={onClose} project={project} folderId={folderId} onCreated={onCreated} />}
    </Modal>
  );
}

function Body({ onClose, project, folderId, onCreated }: { onClose: () => void; project: Project; folderId: string | null; onCreated: (post: Post) => void }) {
  const w = useWorkspace();
  const [title, setTitle] = useState("");
  const [memo, setMemo] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState<number | null>(null);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const me = w.members.find((m) => m.user_id === w.me?.id);

  async function save() {
    if (busy != null || (!memo.trim() && !files.length)) return;
    setBusy(0);
    try {
      const id = crypto.randomUUID();
      const base = `w/${project.workspace_id}/p/${id}`;
      const media: MediaItem[] = [];
      const attachments: Attachment[] = [];
      const total = files.reduce((s, f) => s + f.size, 0) || 1;
      let done = 0;
      for (const f of files) {
        const isMedia = f.type.startsWith("image/") || f.type.startsWith("video/");
        const name = safeName(f.name, 120);
        const path = isMedia ? `${base}/media/${String(media.length + 1).padStart(2, "0")}.${name.split(".").pop() || "bin"}` : `${base}/attachments/${name}`;
        const blob = await upload(path, f, {
          access: "private",
          handleUploadUrl: "/api/upload",
          multipart: f.size > 20 * 1024 * 1024,
          onUploadProgress: ({ loaded }) => setBusy(((done + loaded) / total) * 100),
        });
        done += f.size;
        if (isMedia) media.push({ index: media.length + 1, kind: f.type.startsWith("video/") ? "video" : "image", path: blob.pathname, contentType: f.type, size: f.size });
        else attachments.push({ name, path: blob.pathname, size: f.size, contentType: f.type || "application/octet-stream", addedAt: new Date().toISOString() });
      }
      const format: Format = media.length > 1 ? "carousel" : media[0]?.kind ?? "note";
      const firstLine = memo.split("\n").find((l) => l.trim())?.trim();
      const { data, error } = await supabase()
        .from("posts")
        .insert({
          id,
          workspace_id: project.workspace_id,
          project_id: project.id,
          folder_id: folderId,
          source: "upload",
          format,
          type: format,
          shortcode: id,
          url: "",
          title: (title.trim() || firstLine || files[0]?.name || "메모").slice(0, 80),
          account: { username: me?.profile?.name ?? me?.profile?.email ?? "나", fullName: null, profileUrl: "" },
          caption: memo.trim(),
          body: memo.trim(),
          taken_at: new Date().toISOString(),
          media,
          attachments,
          thumb_path: media.find((m) => m.kind === "image")?.path ?? null,
        })
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      onCreated(data as Post);
      w.refreshCounts();
      onClose();
    } catch (e) {
      toastError(e);
      setBusy(null);
    }
  }

  return (
    <div
      className="relative p-6 sm:p-7"
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        setFiles((l) => [...l, ...e.dataTransfer.files]);
      }}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[20px] font-bold">직접 추가</h2>
          <p className="mt-1 text-[14px] text-mute">링크 없는 캡처, 받은 파일, 떠오른 아이디어를 카드로 남겨요.</p>
        </div>
        <button aria-label="닫기" onClick={onClose} className="press -mr-2 -mt-1 grid size-9 place-items-center rounded-full text-ink-2 hover:bg-surface-2">
          <X size={18} />
        </button>
      </div>

      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="제목 (비워 두면 메모 첫 줄)"
        maxLength={80}
        className="mt-6 h-12 w-full rounded-md bg-surface-2 px-4 text-[15px] outline-none placeholder:text-mute focus:ring-1 focus:ring-ink/25"
      />
      <textarea
        value={memo}
        onChange={(e) => setMemo(e.target.value)}
        rows={5}
        placeholder="메모, 카피, 아이디어"
        className="mt-2 w-full resize-y rounded-md bg-surface-2 px-4 py-3 text-[15px] leading-relaxed outline-none placeholder:text-mute focus:ring-1 focus:ring-ink/25"
      />

      <input ref={input} type="file" multiple hidden onChange={(e) => (e.target.files && setFiles((l) => [...l, ...e.target.files!]), (e.target.value = ""))} />
      <button onClick={() => input.current?.click()} className="press mt-2 flex w-full items-center justify-center gap-2 rounded-md bg-surface-2 px-4 py-5 text-[14px] text-mute hover:text-ink-2">
        <FileUp size={16} /> 파일을 끌어 놓거나 눌러서 고르세요
      </button>
      <AnimatePresence initial={false}>
        {files.map((f, i) => (
          <motion.div key={`${f.name}-${i}`} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="mt-1 flex items-center gap-3 rounded-sm px-2 py-1.5 text-[14px]">
              <span className="min-w-0 flex-1 truncate">{f.name}</span>
              <span className="text-[13px] text-mute">{f.size > 1e6 ? `${(f.size / 1e6).toFixed(1)}MB` : `${Math.max(1, Math.round(f.size / 1e3))}KB`}</span>
              <button aria-label="빼기" onClick={() => setFiles((l) => l.filter((_, j) => j !== i))} className="grid size-7 place-items-center rounded-full text-ink-2 hover:bg-surface-2">
                <X size={14} />
              </button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>

      <div className="mt-6 flex justify-end">
        <button
          onClick={save}
          disabled={busy != null || (!memo.trim() && !files.length)}
          className="press relative flex h-11 items-center gap-2 overflow-hidden rounded-md bg-ink px-5 text-[15px] font-semibold text-on-ink disabled:opacity-30"
        >
          {busy != null && <Loader2 size={16} className="animate-spin" />}
          {busy != null ? `올리는 중 ${Math.round(busy)}%` : "추가하기"}
        </button>
      </div>

      {over && <div className="pointer-events-none absolute inset-2 grid place-items-center rounded-lg bg-ink text-[16px] font-semibold text-on-ink">놓으면 추가돼요</div>}
    </div>
  );
}
