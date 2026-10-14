"use client";

import { db } from "@/lib/client/api";
import type { Folder, Project } from "@/lib/types";
import { downloadZip } from "@/lib/client/zip";
import { ask, promptText, setProgress, toast, toastError } from "../ui/overlay";
import { descendantIds } from "./context";

// 사이드바·홈·프로젝트 화면이 같이 쓰는 생성/이름변경/삭제 흐름

export async function newProject(wsId: string): Promise<Project | null> {
  const name = await promptText({ title: "새 프로젝트", body: "예: 런칭 캠페인, 경쟁사 기술 분석", placeholder: "프로젝트 이름" });
  if (!name) return null;
  try {
    return await db.createProject(wsId, name);
  } catch (e) {
    toastError(e);
    return null;
  }
}

export async function renameProject(p: Project): Promise<Project | null> {
  const name = await promptText({ title: "프로젝트 이름 바꾸기", initial: p.name, confirm: "저장" });
  if (!name || name === p.name) return null;
  try {
    return await db.updateProject(p.id, { name });
  } catch (e) {
    toastError(e);
    return null;
  }
}

export async function removeProject(p: Project): Promise<boolean> {
  const ok = await ask({
    title: `'${p.name}' 프로젝트를 삭제할까요?`,
    body: "안에 있는 폴더와 게시물, 받아 둔 파일이 모두 지워지고 되돌릴 수 없어요.",
    confirm: "삭제",
    danger: true,
  });
  if (!ok) return false;
  try {
    const posts = await db.posts(p.id);
    await db.deleteProject(p.id, p.workspace_id, posts.map((x) => x.id));
    return true;
  } catch (e) {
    toastError(e);
    return false;
  }
}

export async function newFolder(project: Project, parentId: string | null): Promise<Folder | null> {
  const name = await promptText({ title: parentId ? "하위 폴더 만들기" : "새 폴더", placeholder: "폴더 이름" });
  if (!name) return null;
  try {
    return await db.createFolder(project, name, parentId);
  } catch (e) {
    toastError(e);
    return null;
  }
}

export async function renameFolder(f: Folder): Promise<Folder | null> {
  const name = await promptText({ title: "폴더 이름 바꾸기", initial: f.name, confirm: "저장" });
  if (!name || name === f.name) return null;
  try {
    return await db.renameFolder(f.id, name);
  } catch (e) {
    toastError(e);
    return null;
  }
}

export async function removeFolder(f: Folder, folders: Folder[]): Promise<Set<string> | null> {
  const ok = await ask({
    title: `'${f.name}' 폴더를 삭제할까요?`,
    body: "하위 폴더도 함께 지워져요. 안에 있던 게시물은 지워지지 않고 프로젝트 맨 위로 옮겨져요.",
    confirm: "삭제",
    danger: true,
  });
  if (!ok) return null;
  try {
    await db.deleteFolder(f.id);
    return descendantIds(folders, f.id);
  } catch (e) {
    toastError(e);
    return null;
  }
}

let zipping = false;

// 프로젝트 전체 또는 폴더 하나(하위 폴더 포함)를 구조 그대로 zip 으로
export async function zipScope(project: Project, folderId: string | null, folders: Folder[]) {
  if (zipping) return toast("이미 압축 중이에요. 끝나면 다시 눌러 주세요");
  zipping = true;
  const folder = folderId ? folders.find((f) => f.id === folderId) : null;
  const label = folder ? folder.name : project.name;
  try {
    setProgress({ label: `${label} 모으는 중`, done: 0, total: 1 });
    const all = await db.posts(project.id);
    const scope = folderId ? descendantIds(folders, folderId) : null;
    const posts = scope ? all.filter((p) => p.folder_id && scope.has(p.folder_id)) : all;
    if (!posts.length) {
      toast(`'${label}'에 게시물이 없어요`);
      return;
    }
    await downloadZip(posts, { projectName: project.name, folders, baseFolderId: folderId, rootName: label }, (done, total) =>
      setProgress({ label: `${label} 압축 중`, done, total }),
    );
    toast(`'${label}' ${posts.length}개를 zip 으로 묶었어요`);
  } catch (e) {
    toastError(e);
  } finally {
    zipping = false;
    setProgress(null);
  }
}
