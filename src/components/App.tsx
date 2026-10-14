"use client";

import { upload } from "@vercel/blob/client";
import { AnimatePresence, motion } from "motion/react";
import { LogOut, Search, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, fileUrl } from "@/lib/client/api";
import { classifyAudio } from "@/lib/client/audio";
import { downloadZip } from "@/lib/client/zip";
import { safeName } from "@/lib/naming";
import type { Post } from "@/lib/types";
import { IngestBox, type Job } from "./IngestBox";
import { PostCard } from "./PostCard";
import { PostSheet } from "./PostSheet";
import { SelectionBar } from "./SelectionBar";
import { ThemeToggle } from "./ThemeToggle";

type Toast = { id: number; text: string; tone?: "error" };

export function App() {
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [uploading, setUploading] = useState<{ id: string; pct: number } | null>(null);
  const [zipping, setZipping] = useState<{ done: number; total: number } | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const lastClicked = useRef<string | null>(null);
  const queue = useRef<Job[]>([]);
  const running = useRef(0);

  const toast = useCallback((text: string, tone?: "error") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3800);
  }, []);

  useEffect(() => {
    api
      .list()
      .then((r) => setPosts(r.posts))
      .catch((e) => {
        setPosts([]);
        toast(e.message, "error");
      });
  }, [toast]);

  const upsert = useCallback((post: Post) => {
    setPosts((list) => {
      const rest = (list ?? []).filter((p) => p.id !== post.id);
      const old = (list ?? []).findIndex((p) => p.id === post.id);
      if (old === -1) return [post, ...rest];
      const next = [...(list ?? [])];
      next[old] = post;
      return next;
    });
  }, []);

  const setBusy = (id: string, on: boolean) =>
    setBusyIds((s) => {
      const n = new Set(s);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });

  const updateJob = (key: string, patch: Partial<Job>) => setJobs((js) => js.map((j) => (j.key === key ? { ...j, ...patch } : j)));

  // 영상마다 브라우저에서 말/노래 점수를 뽑고 서버에서 Soniox 전사
  const transcribe = useCallback(
    async (post: Post, onStep?: (text: string) => void) => {
      const videos = post.media.filter((m) => m.kind === "video");
      if (!videos.length) return post;
      setBusy(post.id, true);
      let latest = post;
      try {
        for (const [i, v] of videos.entries()) {
          onStep?.(videos.length > 1 ? `영상 전사 중 (${i + 1}/${videos.length})` : "영상 전사 중");
          const audio = await classifyAudio(fileUrl(v.path));
          latest = (await api.transcribe(post.id, v.index, audio)).post;
          upsert(latest);
        }
      } finally {
        setBusy(post.id, false);
      }
      return latest;
    },
    [upsert],
  );

  const pump = useCallback(() => {
    while (running.current < 2 && queue.current.length) {
      const job = queue.current.shift()!;
      running.current++;
      (async () => {
        try {
          updateJob(job.key, { stage: "fetching", detail: undefined });
          const { post, existed } = await api.ingest(job.shortcode);
          upsert(post);
          if (existed) {
            updateJob(job.key, { stage: "done", detail: "이미 있는 게시물" });
          } else if (post.media.some((m) => m.kind === "video")) {
            updateJob(job.key, { stage: "transcribing" });
            await transcribe(post, (detail) => updateJob(job.key, { detail }));
            updateJob(job.key, { stage: "done", detail: `@${post.account.username} 완료` });
          } else {
            updateJob(job.key, { stage: "done", detail: `@${post.account.username} 완료` });
          }
          setTimeout(() => setJobs((js) => js.filter((j) => j.key !== job.key)), 1600);
        } catch (e) {
          updateJob(job.key, { stage: "error", detail: e instanceof Error ? e.message : "실패" });
        } finally {
          running.current--;
          pump();
        }
      })();
    }
  }, [transcribe, upsert]);

  const enqueue = useCallback(
    (codes: string[]) => {
      const fresh = codes.map((shortcode) => ({ key: `${shortcode}-${Date.now()}-${Math.random()}`, shortcode, stage: "queued" as const }));
      setJobs((js) => [...js, ...fresh]);
      queue.current.push(...fresh);
      pump();
    },
    [pump],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!posts) return [];
    if (!q) return posts;
    return posts.filter((p) =>
      [p.title, p.account.username, p.account.fullName ?? "", p.caption].some((s) => s.toLowerCase().includes(q)),
    );
  }, [posts, query]);

  function toggle(id: string, shift: boolean) {
    setSelected((s) => {
      const n = new Set(s);
      if (shift && lastClicked.current) {
        const ids = visible.map((p) => p.id);
        const [a, b] = [ids.indexOf(lastClicked.current), ids.indexOf(id)].sort((x, y) => x - y);
        if (a >= 0) ids.slice(a, b + 1).forEach((x) => n.add(x));
      } else if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
    lastClicked.current = id;
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.closest("input, textarea");
      if (typing || openId) return;
      if (e.key === "Escape") setSelected(new Set());
      if ((e.metaKey || e.ctrlKey) && e.key === "a" && visible.length) {
        e.preventDefault();
        setSelected(new Set(visible.map((p) => p.id)));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openId, visible]);

  async function zip(list: Post[]) {
    if (!list.length || zipping) return;
    setZipping({ done: 0, total: 1 });
    try {
      await downloadZip(list, (done, total) => setZipping({ done, total }));
      toast(`${list.length}개 게시물을 zip 으로 묶었어요`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "zip 만들기 실패", "error");
    } finally {
      setZipping(null);
    }
  }

  async function removePosts(ids: string[]) {
    if (!ids.length || !confirm(`${ids.length}개 게시물을 삭제할까요? 받아 둔 파일과 DM 파일도 함께 지워져요.`)) return;
    setPosts((list) => (list ?? []).filter((p) => !ids.includes(p.id)));
    setSelected(new Set());
    if (openId && ids.includes(openId)) setOpenId(null);
    await Promise.all(ids.map((id) => api.remove(id).catch(() => toast(`${id} 삭제 실패`, "error"))));
  }

  async function attach(post: Post, files: File[]) {
    setUploading({ id: post.id, pct: 0 });
    try {
      const total = files.reduce((s, f) => s + f.size, 0) || 1;
      let base = 0;
      const added = [];
      for (const f of files) {
        const name = safeName(f.name, 120);
        const blob = await upload(`posts/${post.id}/attachments/${name}`, f, {
          access: "private",
          handleUploadUrl: "/api/upload",
          multipart: f.size > 20 * 1024 * 1024,
          onUploadProgress: ({ loaded }) => setUploading({ id: post.id, pct: ((base + loaded) / total) * 100 }),
        });
        base += f.size;
        added.push({ name, path: blob.pathname, size: f.size, contentType: f.type || "application/octet-stream", addedAt: new Date().toISOString() });
      }
      upsert((await api.patch(post.id, { addAttachments: added })).post);
      toast(`${post.title.slice(0, 20)}에 파일 ${files.length}개를 추가했어요`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "업로드 실패", "error");
    } finally {
      setUploading(null);
    }
  }

  const open = posts?.find((p) => p.id === openId) ?? null;
  const selecting = selected.size > 0;

  return (
    <div className="mx-auto max-w-[1360px] px-4 pb-32 sm:px-8">
      <header className="flex h-16 items-center justify-between">
        <span className="text-[17px] font-bold tracking-[-0.04em]">레퍼런스 보관함</span>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <button
            aria-label="로그아웃"
            onClick={async () => {
              await fetch("/api/login", { method: "DELETE" });
              window.location.href = "/login";
            }}
            className="grid size-9 place-items-center rounded-full text-ink-2 hover:bg-surface-2 hover:text-ink"
          >
            <LogOut size={16} />
          </button>
        </div>
      </header>

      <section className="mx-auto mt-6 max-w-2xl sm:mt-12">
        <h1 className="text-[26px] font-bold leading-tight sm:text-[34px]">인스타 레퍼런스를 모아두고 한 번에 받으세요</h1>
        <p className="mt-2 text-[15px] text-ink-2">사진·영상·캡션·계정·전사까지 게시물별 폴더로 묶어 zip 으로 내려받아요.</p>
        <div className="mt-6">
          <IngestBox
            jobs={jobs}
            onSubmit={enqueue}
            onRetry={(job) => {
              setJobs((js) => js.filter((j) => j.key !== job.key));
              enqueue([job.shortcode]);
            }}
            onDismiss={(job) => setJobs((js) => js.filter((j) => j.key !== job.key))}
          />
        </div>
      </section>

      <div className="mt-14 flex flex-wrap items-center gap-3">
        <h2 className="text-[20px] font-bold">
          게시물 <span className="tabular-nums text-mute">{posts?.length ?? ""}</span>
        </h2>
        <div className="ml-auto flex items-center gap-2">
          <label className="flex h-9 w-44 items-center gap-2 rounded-full bg-surface px-3 text-ink-2 transition-[width] focus-within:w-60 sm:w-56 sm:focus-within:w-72">
            <Search size={15} className="shrink-0" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="제목·계정·캡션 검색"
              className="min-w-0 flex-1 bg-transparent text-[14px] text-ink outline-none placeholder:text-mute"
            />
            {query && (
              <button onClick={() => setQuery("")} aria-label="지우기">
                <X size={14} />
              </button>
            )}
          </label>
          {!!visible.length && (
            <button
              onClick={() => setSelected(selected.size === visible.length ? new Set() : new Set(visible.map((p) => p.id)))}
              className="h-9 rounded-full bg-surface px-4 text-[14px] font-medium text-ink-2 hover:text-ink"
            >
              {selected.size === visible.length ? "선택 해제" : "전체 선택"}
            </button>
          )}
        </div>
      </div>

      {posts === null ? (
        <ul className="mt-6 grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {Array.from({ length: 5 }, (_, i) => (
            <li key={i}>
              <motion.div
                className="aspect-[4/5] rounded-2xl bg-surface-2"
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.12 }}
              />
              <div className="mt-3 h-3.5 w-3/4 rounded bg-surface-2" />
              <div className="mt-2 h-3 w-1/2 rounded bg-surface-2" />
            </li>
          ))}
        </ul>
      ) : visible.length === 0 ? (
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-20 text-center text-[15px] text-mute">
          {query ? "검색 결과가 없어요." : "위에 인스타 링크를 붙여넣으면 여기에 쌓여요."}
        </motion.p>
      ) : (
        <motion.ul layout className="mt-6 grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          <AnimatePresence initial={true}>
            {visible.map((post, i) => (
              <PostCard
                key={post.id}
                post={post}
                index={i}
                selected={selected.has(post.id)}
                selecting={selecting}
                busy={busyIds.has(post.id)}
                onToggle={(shift) => toggle(post.id, shift)}
                onOpen={() => setOpenId(post.id)}
                onDropFiles={(files) => attach(post, files)}
              />
            ))}
          </AnimatePresence>
        </motion.ul>
      )}

      <SelectionBar
        count={selected.size}
        total={visible.length}
        zipping={zipping}
        onAll={() => setSelected(new Set(visible.map((p) => p.id)))}
        onClear={() => setSelected(new Set())}
        onDownload={() => zip((posts ?? []).filter((p) => selected.has(p.id)))}
        onDelete={() => removePosts([...selected])}
      />

      <PostSheet
        post={open}
        busy={!!open && busyIds.has(open.id)}
        uploading={open && uploading?.id === open.id ? uploading.pct : null}
        onClose={() => setOpenId(null)}
        onRename={async (title) => open && upsert((await api.patch(open.id, { title })).post)}
        onUpload={(files) => open && attach(open, files)}
        onRemoveAttachment={async (path) => open && upsert((await api.patch(open.id, { removeAttachment: path })).post)}
        onTranscribe={() =>
          open && transcribe(open).catch((e) => toast(e instanceof Error ? e.message : "전사 실패", "error"))
        }
        onDownload={() => open && zip([open])}
        onDelete={() => open && removePosts([open.id])}
      />

      <div className="pointer-events-none fixed bottom-24 left-1/2 z-[60] flex w-full max-w-sm -translate-x-1/2 flex-col items-center gap-2 px-4">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.96 }}
              className={`rounded-full px-4 py-2.5 text-[14px] font-medium shadow-[var(--shadow-lg)] ${
                t.tone === "error" ? "bg-danger text-white" : "bg-ink text-on-ink"
              }`}
            >
              {t.text}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
