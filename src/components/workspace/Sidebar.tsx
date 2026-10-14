"use client";

import { AnimatePresence, motion } from "motion/react";
import {
  Check,
  ChevronRight,
  Download,
  ChevronsUpDown,
  Folder as FolderIcon,
  FolderPlus,
  Home,
  LogOut,
  Moon,
  MoreHorizontal,
  PanelLeftClose,
  Pencil,
  Plus,
  Settings,
  Sun,
  Trash2,
  UserPlus,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useState } from "react";
import { db } from "@/lib/client/api";
import { supabase } from "@/lib/supabase/browser";
import type { Folder, Project } from "@/lib/types";
import { MenuItem, Popover, promptText, toast, toastError } from "../ui/overlay";
import { newFolder, newProject, removeFolder, removeProject, renameFolder, renameProject, zipScope } from "./actions";
import { childrenOf, useWorkspace } from "./context";

export const POST_DRAG = "application/x-post-ids";

export function movedEvent(ids: string[], folderId: string | null, projectId: string) {
  window.dispatchEvent(new CustomEvent("posts:moved", { detail: { ids, folderId, projectId } }));
}

export function Sidebar({ onNavigate, onCollapse }: { onNavigate?: () => void; onCollapse?: () => void }) {
  const w = useWorkspace();
  const params = useParams<{ ws: string; project?: string; f?: string[] }>();
  const router = useRouter();
  const activeProject = params.project ?? null;
  const activeFolder = params.f?.[0] ?? null;
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(activeProject ? [activeProject] : []));
  const toggle = (id: string, force?: boolean) =>
    setExpanded((s) => {
      const n = new Set(s);
      if (force ?? !n.has(id)) n.add(id);
      else n.delete(id);
      return n;
    });

  const ws = w.workspace;
  const myName = w.members.find((m) => m.user_id === w.me?.id)?.profile?.name ?? w.me?.email ?? "";

  async function addProject() {
    if (!ws) return;
    const p = await newProject(ws.id);
    if (!p) return;
    w.setProjects((list) => [...list, p]);
    onNavigate?.();
    router.push(`/w/${ws.id}/p/${p.id}`);
  }

  async function addFolder(project: Project, parentId: string | null) {
    const f = await newFolder(project, parentId);
    if (!f) return;
    w.setFolders((list) => [...list, f]);
    toggle(parentId ?? project.id, true);
  }

  async function dropPosts(e: React.DragEvent, project: Project, folderId: string | null) {
    const raw = e.dataTransfer.getData(POST_DRAG);
    if (!raw) return;
    const { ids, projectId } = JSON.parse(raw) as { ids: string[]; projectId: string };
    if (projectId !== project.id) return toast("다른 프로젝트로는 옮길 수 없어요", "error");
    try {
      await db.movePosts(ids, folderId);
      movedEvent(ids, folderId, project.id);
      w.refreshCounts();
      toast(`${ids.length}개를 옮겼어요`);
    } catch (err) {
      toastError(err);
    }
  }

  return (
    <div className="flex h-full flex-col px-3 pb-3 pt-3">
      <div className="flex items-center gap-1">
        <div className="min-w-0 flex-1">
          <WorkspaceSwitcher onNavigate={onNavigate} />
        </div>
        {onCollapse && (
          <button
            onClick={onCollapse}
            aria-label="사이드바 접기 (⌘\)"
            title="사이드바 접기 (⌘\)"
            className="press grid size-9 shrink-0 place-items-center rounded-md text-mute hover:bg-surface-2 hover:text-ink"
          >
            <PanelLeftClose size={17} />
          </button>
        )}
      </div>

      <nav className="mt-4 flex flex-col gap-0.5">
        <NavRow href={ws ? `/w/${ws.id}` : "#"} icon={<Home size={16} />} active={!activeProject} onClick={onNavigate}>
          홈
        </NavRow>
        <button onClick={() => w.setSettingsOpen(true)} className="press flex h-9 items-center gap-2.5 rounded-md px-2.5 text-[14px] text-ink-2 hover:bg-surface-2 hover:text-ink">
          <UserPlus size={16} /> 팀원 초대
        </button>
        <button onClick={() => w.setClaudeOpen(true)} className="press flex h-9 items-center gap-2.5 rounded-md px-2.5 text-[14px] text-ink-2 hover:bg-surface-2 hover:text-ink">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/claude-mark.svg" alt="" width={16} height={16} /> 내 Claude 연결
        </button>
      </nav>

      <div className="no-scrollbar mt-5 min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col gap-0.5">
          {w.projects.map((p) => (
            <div key={p.id}>
              <TreeRow
                depth={0}
                label={p.name}
                count={w.counts.get(p.id)}
                active={activeProject === p.id && !activeFolder}
                expandable={childrenOf(w.folders, p.id, null).length > 0}
                expanded={expanded.has(p.id)}
                onToggle={() => toggle(p.id)}
                href={`/w/${p.workspace_id}/p/${p.id}`}
                onNavigate={onNavigate}
                onDropPosts={(e) => dropPosts(e, p, null)}
                project
                menu={(close) => (
                  <>
                    <MenuItem icon={<Download size={15} />} onClick={() => (close(), zipScope(p, null, w.folders))}>
                      프로젝트 전체 zip 받기
                    </MenuItem>
                    <MenuItem icon={<FolderPlus size={15} />} onClick={() => (close(), addFolder(p, null))}>
                      폴더 추가
                    </MenuItem>
                    <MenuItem
                      icon={<Pencil size={15} />}
                      onClick={async () => {
                        close();
                        const up = await renameProject(p);
                        if (up) w.setProjects((l) => l.map((x) => (x.id === up.id ? up : x)));
                      }}
                    >
                      이름 바꾸기
                    </MenuItem>
                    <MenuItem
                      danger
                      icon={<Trash2 size={15} />}
                      onClick={async () => {
                        close();
                        if (await removeProject(p)) {
                          w.setProjects((l) => l.filter((x) => x.id !== p.id));
                          w.setFolders((l) => l.filter((x) => x.project_id !== p.id));
                          if (activeProject === p.id) router.push(`/w/${p.workspace_id}`);
                        }
                      }}
                    >
                      삭제
                    </MenuItem>
                  </>
                )}
                onAdd={() => addFolder(p, null)}
              />
              <AnimatePresence initial={false}>
                {expanded.has(p.id) && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                    <FolderTree
                      project={p}
                      parentId={null}
                      depth={1}
                      expanded={expanded}
                      toggle={toggle}
                      activeFolder={activeFolder}
                      onNavigate={onNavigate}
                      addFolder={addFolder}
                      dropPosts={dropPosts}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
          <button onClick={addProject} className="press flex h-9 items-center gap-2.5 rounded-md px-2.5 text-[14px] text-mute hover:bg-surface-2 hover:text-ink">
            <Plus size={16} /> 새 프로젝트
          </button>
        </div>
      </div>

      <UserRow name={myName} email={w.me?.email ?? ""} />
    </div>
  );
}

function FolderTree({
  project,
  parentId,
  depth,
  expanded,
  toggle,
  activeFolder,
  onNavigate,
  addFolder,
  dropPosts,
}: {
  project: Project;
  parentId: string | null;
  depth: number;
  expanded: Set<string>;
  toggle: (id: string, force?: boolean) => void;
  activeFolder: string | null;
  onNavigate?: () => void;
  addFolder: (p: Project, parentId: string | null) => void;
  dropPosts: (e: React.DragEvent, p: Project, folderId: string | null) => void;
}) {
  const w = useWorkspace();
  const router = useRouter();
  return (
    <>
      {childrenOf(w.folders, project.id, parentId).map((f: Folder) => (
        <div key={f.id}>
          <TreeRow
            depth={depth}
            label={f.name}
            count={w.counts.get(f.id)}
            active={activeFolder === f.id}
            expandable={childrenOf(w.folders, project.id, f.id).length > 0}
            expanded={expanded.has(f.id)}
            onToggle={() => toggle(f.id)}
            href={`/w/${project.workspace_id}/p/${project.id}/${f.id}`}
            onNavigate={onNavigate}
            onDropPosts={(e) => dropPosts(e, project, f.id)}
            onAdd={() => addFolder(project, f.id)}
            menu={(close) => (
              <>
                <MenuItem icon={<Download size={15} />} onClick={() => (close(), zipScope(project, f.id, w.folders))}>
                  폴더 zip 받기
                </MenuItem>
                <MenuItem icon={<FolderPlus size={15} />} onClick={() => (close(), addFolder(project, f.id))}>
                  하위 폴더 추가
                </MenuItem>
                <MenuItem
                  icon={<Pencil size={15} />}
                  onClick={async () => {
                    close();
                    const up = await renameFolder(f);
                    if (up) w.setFolders((l) => l.map((x) => (x.id === up.id ? up : x)));
                  }}
                >
                  이름 바꾸기
                </MenuItem>
                <MenuItem
                  danger
                  icon={<Trash2 size={15} />}
                  onClick={async () => {
                    close();
                    const gone = await removeFolder(f, w.folders);
                    if (!gone) return;
                    w.setFolders((l) => l.filter((x) => !gone.has(x.id)));
                    window.dispatchEvent(new CustomEvent("folders:removed", { detail: { ids: [...gone] } }));
                    w.refreshCounts();
                    if (activeFolder && gone.has(activeFolder)) router.push(`/w/${project.workspace_id}/p/${project.id}`);
                  }}
                >
                  삭제
                </MenuItem>
              </>
            )}
          />
          <AnimatePresence initial={false}>
            {expanded.has(f.id) && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                <FolderTree {...{ project, expanded, toggle, activeFolder, onNavigate, addFolder, dropPosts }} parentId={f.id} depth={depth + 1} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ))}
    </>
  );
}

function TreeRow({
  depth,
  label,
  count,
  active,
  expandable,
  expanded,
  onToggle,
  href,
  onNavigate,
  onDropPosts,
  onAdd,
  menu,
  project,
}: {
  depth: number;
  label: string;
  count?: number;
  active: boolean;
  expandable: boolean;
  expanded: boolean;
  onToggle: () => void;
  href: string;
  onNavigate?: () => void;
  onDropPosts: (e: React.DragEvent) => void;
  onAdd: () => void;
  menu: (close: () => void) => React.ReactNode;
  project?: boolean;
}) {
  const [over, setOver] = useState(false);
  return (
    <motion.div
      animate={{ scale: over ? 1.02 : 1 }}
      className={`group relative flex h-9 items-center rounded-md transition-colors ${
        over ? "bg-ink text-on-ink" : active ? "bg-surface text-ink shadow-[var(--shadow)]" : "text-ink-2 hover:bg-surface-2 hover:text-ink"
      }`}
      style={{ paddingLeft: 4 + depth * 14 }}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes(POST_DRAG)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        onDropPosts(e);
      }}
    >
      <button
        type="button"
        aria-label={expanded ? "접기" : "펼치기"}
        onClick={onToggle}
        className={`grid size-6 shrink-0 place-items-center rounded-sm ${expandable ? "hover:bg-surface-3" : "pointer-events-none"}`}
      >
        {expandable ? (
          <motion.span animate={{ rotate: expanded ? 90 : 0 }} transition={{ duration: 0.2 }}>
            <ChevronRight size={14} />
          </motion.span>
        ) : project ? (
          <span className="size-1.5 rounded-full bg-current opacity-50" />
        ) : (
          <FolderIcon size={14} className="opacity-60" />
        )}
      </button>
      <Link href={href} onClick={onNavigate} className={`min-w-0 flex-1 truncate pl-1 text-[14px] ${active ? "font-semibold" : ""}`}>
        {label}
      </Link>
      <span className="pr-2 text-[12px] tabular-nums text-mute group-hover:hidden">{count || ""}</span>
      <div className="hidden items-center pr-1 group-hover:flex group-focus-within:flex">
        <Popover
          align="end"
          trigger={({ toggle }) => (
            <button aria-label="메뉴" onClick={toggle} className="grid size-7 place-items-center rounded-sm hover:bg-surface-3">
              <MoreHorizontal size={15} />
            </button>
          )}
        >
          {menu}
        </Popover>
        <button aria-label="폴더 추가" onClick={onAdd} className="grid size-7 place-items-center rounded-sm hover:bg-surface-3">
          <Plus size={15} />
        </button>
      </div>
    </motion.div>
  );
}

function NavRow({ href, icon, active, children, onClick }: { href: string; icon: React.ReactNode; active: boolean; children: React.ReactNode; onClick?: () => void }) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={`press flex h-9 items-center gap-2.5 rounded-md px-2.5 text-[14px] ${
        active ? "bg-surface font-semibold text-ink shadow-[var(--shadow)]" : "text-ink-2 hover:bg-surface-2 hover:text-ink"
      }`}
    >
      {icon}
      {children}
    </Link>
  );
}

function WorkspaceSwitcher({ onNavigate }: { onNavigate?: () => void }) {
  const w = useWorkspace();
  const router = useRouter();
  const name = w.workspace?.name ?? "";
  return (
    <Popover
      trigger={({ toggle, open }) => (
        <button onClick={toggle} className={`press flex h-12 w-full items-center gap-2.5 rounded-md px-2 text-left ${open ? "bg-surface-2" : "hover:bg-surface-2"}`}>
          <span className="grid size-8 shrink-0 place-items-center rounded-sm bg-ink text-[14px] font-bold text-on-ink">{name.slice(0, 1) || "·"}</span>
          <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{name}</span>
          <ChevronsUpDown size={15} className="text-mute" />
        </button>
      )}
    >
      {(close) => (
        <>
          {w.workspaces.map((x) => (
            <MenuItem
              key={x.id}
              active={x.id === w.workspace?.id}
              icon={x.id === w.workspace?.id ? <Check size={15} /> : <span className="size-1.5 rounded-full bg-mute" />}
              onClick={() => {
                close();
                onNavigate?.();
                router.push(`/w/${x.id}`);
              }}
            >
              {x.name}
            </MenuItem>
          ))}
          <div className="h-1.5" />
          <MenuItem
            icon={<Plus size={15} />}
            onClick={async () => {
              close();
              const n = await promptText({ title: "새 워크스페이스", body: "사업 아이템마다 하나씩 만들어 두면 편해요.", placeholder: "워크스페이스 이름" });
              if (!n) return;
              try {
                const created = await db.createWorkspace(n);
                onNavigate?.();
                router.push(`/w/${created.id}`);
              } catch (e) {
                toastError(e);
              }
            }}
          >
            새 워크스페이스
          </MenuItem>
          <MenuItem icon={<Settings size={15} />} onClick={() => (close(), w.setSettingsOpen(true))}>
            설정과 팀원
          </MenuItem>
        </>
      )}
    </Popover>
  );
}

function UserRow({ name, email }: { name: string; email: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <Popover
      side="top"
      trigger={({ toggle, open }) => (
        <button onClick={toggle} className={`press mt-2 flex h-12 w-full items-center gap-2.5 rounded-md px-2 text-left ${open ? "bg-surface-2" : "hover:bg-surface-2"}`}>
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-surface-3 text-[13px] font-semibold">{(name || email).slice(0, 1).toUpperCase()}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[14px] font-semibold leading-tight">{name}</span>
            <span className="block truncate text-[12px] leading-tight text-mute">{email}</span>
          </span>
        </button>
      )}
    >
      {(close) => (
        <>
          <MenuItem
            icon={resolvedTheme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
            onClick={() => (close(), setTheme(resolvedTheme === "dark" ? "light" : "dark"))}
          >
            {resolvedTheme === "dark" ? "라이트 모드" : "다크 모드"}
          </MenuItem>
          <MenuItem
            icon={<LogOut size={15} />}
            onClick={async () => {
              close();
              await supabase().auth.signOut();
              window.location.assign("/login");
            }}
          >
            로그아웃
          </MenuItem>
        </>
      )}
    </Popover>
  );
}
