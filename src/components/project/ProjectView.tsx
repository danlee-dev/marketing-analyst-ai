"use client";

import { upload } from "@vercel/blob/client";
import { AnimatePresence, motion } from "motion/react";
import { AlignLeft, ChevronRight, Download, Folder as FolderIcon, FolderPlus, Globe, Image as ImageIcon, Pencil, Play, Plus, Search, X } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { db, fileUrl, server } from "@/lib/client/api";
import { classifyAudio } from "@/lib/client/audio";
import { downloadZip } from "@/lib/client/zip";
import { safeName } from "@/lib/naming";
import { detect, jobLabel, type Detected } from "@/lib/sources/detect";
import { FORMAT_GROUP, type Attachment, type Post } from "@/lib/types";
import { ask, EASE, toast, toastError } from "../ui/overlay";
import { newFolder, zipScope } from "../workspace/actions";
import { childrenOf, descendantIds, folderTrail, useWorkspace } from "../workspace/context";
import { movedEvent, POST_DRAG } from "../workspace/Sidebar";
import { AddDialog } from "./AddDialog";
import { IngestBox, type Job } from "./IngestBox";
import { PostCard } from "./PostCard";
import { PostSheet } from "./PostSheet";
import { SelectionBar } from "./SelectionBar";

// 프로젝트가 바뀌면 목록·선택 상태를 새로 시작
export function ProjectView() {
  const { project } = useParams<{ project: string }>();
  return <ProjectBody key={project} />;
}

function ProjectBody() {
  const w = useWorkspace();
  const router = useRouter();
  const params = useParams<{ ws: string; project: string; f?: string[] }>();
  const projectId = params.project;
  const folderId = params.f?.[0] ?? null;
  const project = w.projects.find((p) => p.id === projectId) ?? null;

  const [posts, setPosts] = useState<Post[] | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<"all" | "video" | "image" | "text" | "page">("all");
  const [adding, setAdding] = useState(false);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [uploading, setUploading] = useState<{ id: string; pct: number } | null>(null);
  const [zipping, setZipping] = useState<{ done: number; total: number } | null>(null);
  const lastClicked = useRef<string | null>(null);
  const queue = useRef<(Job & { folderId: string | null })[]>([]);
  const running = useRef(0);

  useEffect(() => {
    let alive = true;
    db.posts(projectId)
      .then((p) => alive && setPosts(p))
      .catch((e) => {
        toastError(e);
        if (alive) setPosts([]);
      });
    return () => {
      alive = false;
    };
  }, [projectId]);

  // 사이드바에서 폴더로 옮기거나 폴더를 지웠을 때
  useEffect(() => {
    const onMoved = (e: Event) => {
      const { ids, folderId: to } = (e as CustomEvent<{ ids: string[]; folderId: string | null }>).detail;
      setPosts((l) => l?.map((p) => (ids.includes(p.id) ? { ...p, folder_id: to } : p)) ?? l);
      setSelected(new Set());
    };
    const onRemoved = (e: Event) => {
      const gone = new Set((e as CustomEvent<{ ids: string[] }>).detail.ids);
      setPosts((l) => l?.map((p) => (p.folder_id && gone.has(p.folder_id) ? { ...p, folder_id: null } : p)) ?? l);
    };
    window.addEventListener("posts:moved", onMoved);
    window.addEventListener("folders:removed", onRemoved);
    return () => {
      window.removeEventListener("posts:moved", onMoved);
      window.removeEventListener("folders:removed", onRemoved);
    };
  }, []);

  const upsert = useCallback((post: Post) => {
    setPosts((list) => {
      const l = list ?? [];
      const i = l.findIndex((p) => p.id === post.id);
      if (i === -1) return [post, ...l];
      const next = [...l];
      next[i] = post;
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

  // 영상마다: 브라우저에서 말/노래 점수 → 서버에서 Soniox 전사
  const transcribe = useCallback(
    async (post: Post, onStep?: (t: string) => void) => {
      const videos = post.media.filter((m) => m.kind === "video");
      if (!videos.length) return;
      setBusy(post.id, true);
      try {
        for (const [i, v] of videos.entries()) {
          onStep?.(videos.length > 1 ? `영상 전사 중 (${i + 1}/${videos.length})` : "영상 전사 중");
          const audio = await classifyAudio(fileUrl(v.path));
          upsert((await server.transcribe(post.id, v.index, audio)).post);
        }
      } finally {
        setBusy(post.id, false);
      }
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
          const { post, existed } = await server.ingest(projectId, job.url, job.folderId);
          upsert(post);
          w.refreshCounts();
          if (existed) updateJob(job.key, { stage: "done", detail: "이 프로젝트에 이미 있어요" });
          else {
            if (post.media.some((m) => m.kind === "video") && !post.transcripts.length) {
              updateJob(job.key, { stage: "transcribing" });
              await transcribe(post, (detail) => updateJob(job.key, { detail }));
            }
            updateJob(job.key, { stage: "done", detail: `${post.source === "web" ? post.site : `@${post.account.username}`} 저장했어요` });
          }
          setTimeout(() => setJobs((js) => js.filter((j) => j.key !== job.key)), 1800);
        } catch (e) {
          updateJob(job.key, { stage: "error", detail: e instanceof Error ? e.message : "실패" });
        } finally {
          running.current--;
          pump();
        }
      })();
    }
  }, [projectId, transcribe, upsert, w]);

  const enqueue = useCallback(
    (links: Detected[]) => {
      const fresh = links.map((d) => ({ key: `${d.url}-${Date.now()}-${Math.random()}`, url: d.url, label: jobLabel(d), stage: "queued" as const }));
      setJobs((js) => [...js, ...fresh]);
      queue.current.push(...fresh.map((j) => ({ ...j, folderId })));
      pump();
    },
    [pump, folderId],
  );

  const scope = useMemo(() => (folderId ? descendantIds(w.folders, folderId) : null), [folderId, w.folders]);
  const visible = useMemo(() => {
    if (!posts) return [];
    const q = query.trim().toLowerCase();
    return posts.filter(
      (p) =>
        (!scope || (p.folder_id && scope.has(p.folder_id))) &&
        (group === "all" || FORMAT_GROUP[p.format] === group) &&
        (!q || [p.title, p.account.username, p.account.fullName ?? "", p.caption, p.note, p.site ?? "", p.body.slice(0, 2000)].some((s) => s.toLowerCase().includes(q))),
    );
  }, [posts, scope, query, group]);

  // 형식 필터 개수는 폴더 범위 기준
  const groupCounts = useMemo(() => {
    const c = { all: 0, video: 0, image: 0, text: 0, page: 0 };
    for (const p of posts ?? []) {
      if (scope && !(p.folder_id && scope.has(p.folder_id))) continue;
      c.all++;
      c[FORMAT_GROUP[p.format]]++;
    }
    return c;
  }, [posts, scope]);

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
      if ((e.target as HTMLElement)?.closest("input, textarea, [role=dialog]") || openId) return;
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
    if (!list.length || zipping || !project) return;
    setZipping({ done: 0, total: 1 });
    try {
      await downloadZip(list, { projectName: project.name, folders: w.folders }, (done, total) => setZipping({ done, total }));
      toast(`${list.length}개 게시물을 zip 으로 묶었어요`);
    } catch (e) {
      toastError(e);
    } finally {
      setZipping(null);
    }
  }

  async function removePosts(ids: string[]) {
    if (!ids.length) return;
    const ok = await ask({
      title: `${ids.length}개 게시물을 삭제할까요?`,
      body: "받아 둔 사진·영상과 DM 파일도 함께 지워져요.",
      confirm: "삭제",
      danger: true,
    });
    if (!ok) return;
    setPosts((l) => l?.filter((p) => !ids.includes(p.id)) ?? l);
    setSelected(new Set());
    if (openId && ids.includes(openId)) setOpenId(null);
    await Promise.all(ids.map((id) => server.deletePost(id).catch(() => toast("일부 게시물을 지우지 못했어요", "error"))));
    w.refreshCounts();
  }

  async function move(ids: string[], to: string | null) {
    try {
      await db.movePosts(ids, to);
      movedEvent(ids, to, projectId);
      w.refreshCounts();
      toast(`${ids.length}개를 ${to ? `'${w.folders.find((f) => f.id === to)?.name}'` : "프로젝트 맨 위"}로 옮겼어요`);
    } catch (e) {
      toastError(e);
    }
  }

  async function attach(post: Post, files: File[]) {
    setUploading({ id: post.id, pct: 0 });
    try {
      const total = files.reduce((s, f) => s + f.size, 0) || 1;
      let base = 0;
      const added: Attachment[] = [];
      for (const f of files) {
        const name = safeName(f.name, 120);
        const blob = await upload(`w/${post.workspace_id}/p/${post.id}/attachments/${name}`, f, {
          access: "private",
          handleUploadUrl: "/api/upload",
          multipart: f.size > 20 * 1024 * 1024,
          onUploadProgress: ({ loaded }) => setUploading({ id: post.id, pct: ((base + loaded) / total) * 100 }),
        });
        base += f.size;
        added.push({ name, path: blob.pathname, size: f.size, contentType: f.type || "application/octet-stream", addedAt: new Date().toISOString() });
      }
      upsert(await db.addAttachments(post, added));
      toast(`파일 ${files.length}개를 추가했어요`);
    } catch (e) {
      toastError(e);
    } finally {
      setUploading(null);
    }
  }

  async function addSubfolder() {
    if (!project) return;
    const f = await newFolder(project, folderId);
    if (f) w.setFolders((l) => [...l, f]);
  }

  if (!project) {
    return w.loading ? null : (
      <div className="px-6 py-24 text-center text-[15px] text-mute">
        프로젝트를 찾을 수 없어요.{" "}
        <Link href={`/w/${params.ws}`} className="text-ink underline underline-offset-4">
          홈으로
        </Link>
      </div>
    );
  }

  const trail = folderTrail(w.folders, folderId);
  const current = trail[trail.length - 1] ?? null;
  const subfolders = childrenOf(w.folders, project.id, folderId);
  const open = posts?.find((p) => p.id === openId) ?? null;
  const base = `/w/${project.workspace_id}/p/${project.id}`;

  return (
    <div className="mx-auto max-w-[1280px] px-4 pb-36 pt-6 sm:px-10 sm:pt-10">
      <nav className="flex min-h-6 flex-wrap items-center gap-1 text-[14px] text-mute">
        {trail.length > 0 && (
          <>
            <Link href={base} className="rounded-sm px-1 hover:text-ink">
              {project.name}
            </Link>
            {trail.slice(0, -1).map((f) => (
              <span key={f.id} className="flex items-center gap-1">
                <ChevronRight size={14} />
                <Link href={`${base}/${f.id}`} className="rounded-sm px-1 hover:text-ink">
                  {f.name}
                </Link>
              </span>
            ))}
          </>
        )}
      </nav>
      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-3">
        <EditableTitle
          key={`title-${current?.id ?? project.id}`}
          value={current?.name ?? project.name}
          onSave={async (name) => {
            try {
              if (current) {
                const up = await db.renameFolder(current.id, name);
                w.setFolders((l) => l.map((f) => (f.id === up.id ? up : f)));
              } else {
                const up = await db.updateProject(project.id, { name });
                w.setProjects((l) => l.map((p) => (p.id === up.id ? up : p)));
              }
            } catch (e) {
              toastError(e);
            }
          }}
        />
        <button
          onClick={() => zipScope(project, folderId, w.folders)}
          className="press flex h-10 items-center gap-2 rounded-md bg-surface-2 px-4 text-[14px] font-semibold text-ink-2 hover:bg-surface-3 hover:text-ink"
        >
          <Download size={15} /> {current ? "폴더 zip 받기" : "전체 zip 받기"}
        </button>
      </div>
      {!current && <Description key={`desc-${project.id}`} />}

      <div className="mt-8 max-w-2xl">
        <IngestBox
          jobs={jobs}
          placeholder="인스타·YouTube·X·TikTok·웹 링크를 붙여넣으세요"
          onSubmit={enqueue}
          onRetry={(job) => {
            setJobs((js) => js.filter((j) => j.key !== job.key));
            const d = detect(job.url);
            if (d) enqueue([d]);
          }}
          onDismiss={(job) => setJobs((js) => js.filter((j) => j.key !== job.key))}
        />
        <button onClick={() => setAdding(true)} className="press mt-3 flex h-9 items-center gap-1.5 rounded-md px-3 text-[14px] text-ink-2 hover:bg-surface-2 hover:text-ink">
          <Plus size={15} /> 캡처·파일·메모 직접 추가
        </button>
      </div>

      <div className="mt-10 flex flex-wrap gap-2">
        {subfolders.map((f, i) => (
          <FolderTile key={f.id} href={`${base}/${f.id}`} name={f.name} count={w.counts.get(f.id) ?? 0} index={i} onDropPosts={(ids) => move(ids, f.id)} />
        ))}
        <button onClick={addSubfolder} className="press flex h-12 items-center gap-2 rounded-md px-4 text-[14px] font-semibold text-mute ring-1 ring-inset ring-surface-3 hover:text-ink">
          <FolderPlus size={16} /> {folderId ? "하위 폴더" : "새 폴더"}
        </button>
      </div>

      <div className="mt-10 flex flex-wrap items-center gap-3">
        <h2 className="text-[20px] font-bold">
          레퍼런스 <span className="tabular-nums text-mute">{posts ? visible.length : ""}</span>
        </h2>
        <div className="ml-auto flex items-center gap-2">
          <label className="flex h-10 w-44 items-center gap-2 rounded-md bg-surface-2 px-3 text-ink-2 transition-[width] duration-300 focus-within:w-60 sm:w-56 sm:focus-within:w-72">
            <Search size={15} className="shrink-0" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="제목·계정·캡션·메모"
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
              className="press h-10 rounded-md bg-surface-2 px-4 text-[14px] font-semibold text-ink-2 hover:text-ink"
            >
              {selected.size === visible.length ? "선택 해제" : "전체 선택"}
            </button>
          )}
        </div>
      </div>

      <div className="no-scrollbar -mx-1 mt-4 flex gap-1.5 overflow-x-auto px-1">
        {(
          [
            ["all", "전체", null],
            ["video", "영상", <Play key="v" size={13} />],
            ["image", "이미지", <ImageIcon key="i" size={13} />],
            ["text", "글", <AlignLeft key="t" size={13} />],
            ["page", "웹페이지", <Globe key="g" size={13} />],
          ] as const
        ).map(([key, label, icon]) =>
          key !== "all" && !groupCounts[key] ? null : (
            <button
              key={key}
              onClick={() => setGroup(key)}
              className={`press relative flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[14px] font-medium transition-colors ${
                group === key ? "text-on-ink" : "text-ink-2 hover:text-ink"
              }`}
            >
              {group === key && <motion.span layoutId="format-pill" className="absolute inset-0 rounded-full bg-ink" transition={{ duration: 0.3, ease: EASE }} />}
              {group !== key && <span className="absolute inset-0 rounded-full bg-surface-2" />}
              <span className="relative flex items-center gap-1.5">
                {icon}
                {label}
                <span className={`tabular-nums ${group === key ? "opacity-70" : "text-mute"}`}>{groupCounts[key]}</span>
              </span>
            </button>
          ),
        )}
      </div>

      {posts === null ? (
        <ul className="mt-6 grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {Array.from({ length: 4 }, (_, i) => (
            <li key={i}>
              <motion.div className="aspect-[4/5] rounded-lg bg-surface-2" animate={{ opacity: [0.5, 1, 0.5] }} transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.12 }} />
              <div className="mt-3 h-4 w-3/4 rounded-sm bg-surface-2" />
              <div className="mt-2 h-3 w-1/2 rounded-sm bg-surface-2" />
            </li>
          ))}
        </ul>
      ) : visible.length === 0 ? (
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-16 text-center text-[15px] text-mute">
          {query ? "검색 결과가 없어요." : "위에 인스타 링크를 붙여넣으면 여기에 쌓여요."}
        </motion.p>
      ) : (
        <motion.ul layout className="mt-6 grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          <AnimatePresence>
            {visible.map((post, i) => (
              <PostCard
                key={post.id}
                post={post}
                index={i}
                folderName={post.folder_id && post.folder_id !== folderId ? w.folders.find((f) => f.id === post.folder_id)?.name : undefined}
                selected={selected.has(post.id)}
                selecting={selected.size > 0}
                busy={busyIds.has(post.id)}
                onToggle={(shift) => toggle(post.id, shift)}
                onOpen={() => setOpenId(post.id)}
                onDropFiles={(files) => attach(post, files)}
                dragIds={() => (selected.has(post.id) ? [...selected] : [post.id])}
              />
            ))}
          </AnimatePresence>
        </motion.ul>
      )}

      <SelectionBar
        count={selected.size}
        total={visible.length}
        zipping={zipping}
        project={project}
        onAll={() => setSelected(new Set(visible.map((p) => p.id)))}
        onClear={() => setSelected(new Set())}
        onDownload={() => zip((posts ?? []).filter((p) => selected.has(p.id)))}
        onDelete={() => removePosts([...selected])}
        onMove={(to) => move([...selected], to)}
      />

      <AddDialog open={adding} onClose={() => setAdding(false)} project={project} folderId={folderId} onCreated={upsert} />

      <PostSheet
        post={open}
        project={project}
        busy={!!open && busyIds.has(open.id)}
        uploading={open && uploading?.id === open.id ? uploading.pct : null}
        onClose={() => setOpenId(null)}
        onChange={async (patch) => {
          if (!open) return;
          try {
            upsert(await db.updatePost(open.id, patch));
            if ("folder_id" in patch) w.refreshCounts();
          } catch (e) {
            toastError(e);
          }
        }}
        onUpload={(files) => open && attach(open, files)}
        onRemoveAttachment={async (path) => {
          if (!open) return;
          try {
            upsert((await server.removeAttachment(open.id, path)).post);
          } catch (e) {
            toastError(e);
          }
        }}
        onTranscribe={() => open && transcribe(open).catch(toastError)}
        onDownload={() => open && zip([open])}
        onDelete={() => open && removePosts([open.id])}
        onOpenFolder={(id) => {
          setOpenId(null);
          router.push(id ? `${base}/${id}` : base);
        }}
      />
    </div>
  );
}

function Description() {
  const w = useWorkspace();
  const { project: projectId } = useParams<{ project: string }>();
  const project = w.projects.find((p) => p.id === projectId)!;
  const [value, setValue] = useState(project.description ?? "");
  return (
    <input
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={async () => {
        if (value === (project.description ?? "")) return;
        try {
          const up = await db.updateProject(project.id, { description: value.trim() || null });
          w.setProjects((l) => l.map((p) => (p.id === up.id ? up : p)));
        } catch (e) {
          toastError(e);
        }
      }}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      placeholder="이 프로젝트의 목적을 한 줄로 적어 두세요"
      className="-mx-2 mt-1 w-full max-w-2xl rounded-sm bg-transparent px-2 py-1 text-[15px] text-ink-2 outline-none transition-colors placeholder:text-mute hover:bg-surface-2 focus:bg-surface-2"
    />
  );
}

function FolderTile({ href, name, count, index, onDropPosts }: { href: string; name: string; count: number; index: number; onDropPosts: (ids: string[]) => void }) {
  const [over, setOver] = useState(false);
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0, scale: over ? 1.04 : 1 }}
      transition={{ duration: 0.35, ease: EASE, delay: Math.min(index * 0.04, 0.2) }}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes(POST_DRAG)) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const raw = e.dataTransfer.getData(POST_DRAG);
        if (raw) onDropPosts((JSON.parse(raw) as { ids: string[] }).ids);
      }}
    >
      <Link
        href={href}
        className={`press flex h-12 items-center gap-2.5 rounded-md px-4 text-[14px] font-semibold transition-colors ${
          over ? "bg-ink text-on-ink" : "bg-surface-2 hover:bg-surface-3"
        }`}
      >
        <FolderIcon size={16} className="opacity-60" />
        {name}
        <span className={`tabular-nums ${over ? "" : "text-mute"}`}>{count}</span>
      </Link>
    </motion.div>
  );
}

// 큰 제목을 눌러 바로 이름 바꾸기 (Enter 저장, Esc 취소)
function EditableTitle({ value, onSave }: { value: string; onSave: (v: string) => void | Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const cls = "min-w-0 text-[28px] font-bold leading-tight tracking-[-0.02em] sm:text-[36px]";

  const commit = async () => {
    const next = draft.trim();
    setEditing(false);
    if (next && next !== value) await onSave(next.slice(0, 60));
    else setDraft(value);
  };

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        maxLength={60}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.nativeEvent.isComposing) e.currentTarget.blur();
          if (e.key === "Escape") {
            setDraft(value);
            setEditing(false);
          }
        }}
        aria-label="이름"
        className={`${cls} -mx-2 w-full max-w-2xl rounded-md bg-surface-2 px-2 outline-none ring-1 ring-ink/25`}
      />
    );
  }
  return (
    <motion.h1 initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE }} className={cls}>
      <button
        type="button"
        onClick={() => {
          setDraft(value);
          setEditing(true);
        }}
        title="눌러서 이름 바꾸기"
        className="group/title -mx-2 flex max-w-full items-center gap-2 rounded-md px-2 text-left transition-colors hover:bg-surface-2"
      >
        <span className="truncate">{value}</span>
        <Pencil size={18} className="shrink-0 text-mute opacity-0 transition-opacity group-hover/title:opacity-100" />
      </button>
    </motion.h1>
  );
}
