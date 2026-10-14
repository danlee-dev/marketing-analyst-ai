"use client";

import type { User } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { db } from "@/lib/client/api";
import type { Folder, Invite, Member, Project, Workspace } from "@/lib/types";

type Ctx = {
  me: User | null;
  workspace: Workspace | null;
  workspaces: Workspace[];
  projects: Project[];
  folders: Folder[];
  members: Member[];
  invites: Invite[];
  counts: Map<string, number>;
  loading: boolean;
  missing: boolean;
  isOwner: boolean;
  reload: () => Promise<void>;
  refreshCounts: () => void;
  setProjects: React.Dispatch<React.SetStateAction<Project[]>>;
  setFolders: React.Dispatch<React.SetStateAction<Folder[]>>;
  setInvites: React.Dispatch<React.SetStateAction<Invite[]>>;
  setMembers: React.Dispatch<React.SetStateAction<Member[]>>;
  setWorkspace: React.Dispatch<React.SetStateAction<Workspace | null>>;
  settingsOpen: boolean;
  setSettingsOpen: (v: boolean) => void;
  claudeOpen: boolean;
  setClaudeOpen: (v: boolean) => void;
};

const WorkspaceCtx = createContext<Ctx | null>(null);

export function useWorkspace() {
  const v = useContext(WorkspaceCtx);
  if (!v) throw new Error("WorkspaceProvider missing");
  return v;
}

export function WorkspaceProvider({ wsId, children }: { wsId: string; children: React.ReactNode }) {
  const [me, setMe] = useState<User | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [counts, setCounts] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [claudeOpen, setClaudeOpen] = useState(false);

  const refreshCounts = useCallback(() => {
    db.postCounts(wsId).then(setCounts).catch(() => {});
  }, [wsId]);

  const load = useCallback(() => Promise.all([db.me(), db.workspaces(), db.bundle(wsId)]), [wsId]);

  const apply = useCallback(
    ([user, list, bundle]: Awaited<ReturnType<typeof load>>) => {
      setMe(user);
      setWorkspaces(list);
      setWorkspace(bundle.workspace);
      setProjects(bundle.projects);
      setFolders(bundle.folders);
      setMembers(bundle.members);
      setInvites(bundle.invites);
      setLoading(false);
      refreshCounts();
      try {
        localStorage.setItem("lastWorkspace", wsId);
      } catch {}
    },
    [wsId, refreshCounts],
  );

  const reload = useCallback(async () => apply(await load()), [apply, load]);

  useEffect(() => {
    let alive = true;
    load()
      .then((data) => alive && apply(data))
      .catch(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [load, apply]);

  const isOwner = !!me && members.some((m) => m.user_id === me.id && m.role === "owner");

  return (
    <WorkspaceCtx.Provider
      value={{
        me,
        workspace,
        workspaces,
        projects,
        folders,
        members,
        invites,
        counts,
        loading,
        missing: !loading && !workspace,
        isOwner,
        reload,
        refreshCounts,
        setProjects,
        setFolders,
        setInvites,
        setMembers,
        setWorkspace,
        settingsOpen,
        setSettingsOpen,
        claudeOpen,
        setClaudeOpen,
      }}
    >
      {children}
    </WorkspaceCtx.Provider>
  );
}

// 폴더 트리 도우미
export function childrenOf(folders: Folder[], projectId: string, parentId: string | null) {
  return folders.filter((f) => f.project_id === projectId && f.parent_id === parentId).sort((a, b) => a.position - b.position);
}

export function descendantIds(folders: Folder[], id: string): Set<string> {
  const out = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const f of folders) if (f.parent_id && out.has(f.parent_id) && !out.has(f.id)) (out.add(f.id), (grew = true));
  }
  return out;
}

export function folderTrail(folders: Folder[], id: string | null): Folder[] {
  const trail: Folder[] = [];
  let cur = id ? folders.find((f) => f.id === id) : undefined;
  while (cur && trail.length < 20) {
    trail.unshift(cur);
    cur = cur.parent_id ? folders.find((f) => f.id === cur!.parent_id) : undefined;
  }
  return trail;
}
