"use client";

import { motion } from "motion/react";
import { Plus, UserPlus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { newProject } from "@/components/workspace/actions";
import { childrenOf, useWorkspace } from "@/components/workspace/context";
import { EASE } from "@/components/ui/overlay";

export default function WorkspaceHome() {
  const w = useWorkspace();
  const router = useRouter();
  const ws = w.workspace;

  async function add() {
    if (!ws) return;
    const p = await newProject(ws.id);
    if (!p) return;
    w.setProjects((l) => [...l, p]);
    router.push(`/w/${ws.id}/p/${p.id}`);
  }

  return (
    <div className="mx-auto max-w-[1080px] px-4 pb-24 pt-8 sm:px-10 sm:pt-14">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: EASE }}>
        <h1 className="text-[28px] font-bold sm:text-[36px]">{ws?.name ?? ""}</h1>
        <p className="mt-2 text-[15px] text-ink-2">
          프로젝트 {w.projects.length}개 · 팀원 {w.members.length}명
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <button onClick={add} className="press flex h-11 items-center gap-2 rounded-md bg-ink px-5 text-[15px] font-semibold text-on-ink">
            <Plus size={17} /> 새 프로젝트
          </button>
          <button onClick={() => w.setSettingsOpen(true)} className="press flex h-11 items-center gap-2 rounded-md bg-surface-2 px-5 text-[15px] font-semibold hover:bg-surface-3">
            <UserPlus size={17} /> 팀원 초대
          </button>
        </div>
      </motion.div>

      <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {w.loading
          ? Array.from({ length: 3 }, (_, i) => <li key={i} className="h-40 animate-pulse rounded-xl bg-surface-2" />)
          : w.projects.map((p, i) => {
              const folders = childrenOf(w.folders, p.id, null);
              return (
                <motion.li
                  key={p.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.45, ease: EASE, delay: Math.min(i * 0.05, 0.3) }}
                >
                  <Link
                    href={`/w/${p.workspace_id}/p/${p.id}`}
                    className="press group flex h-40 flex-col rounded-xl bg-surface-2 p-6 transition-colors hover:bg-surface-3"
                  >
                    <span className="text-[13px] tabular-nums text-mute">게시물 {w.counts.get(p.id) ?? 0}</span>
                    <span className="mt-auto line-clamp-2 text-[20px] font-bold leading-tight">{p.name}</span>
                    <span className="mt-1.5 truncate text-[14px] text-ink-2">
                      {p.description || (folders.length ? folders.map((f) => f.name).join(" · ") : "폴더 없음")}
                    </span>
                  </Link>
                </motion.li>
              );
            })}
        {!w.loading && (
          <li>
            <button onClick={add} className="press flex h-40 w-full flex-col items-start rounded-xl p-6 text-left text-mute ring-1 ring-inset ring-surface-3 transition-colors hover:text-ink">
              <Plus size={20} />
              <span className="mt-auto text-[17px] font-semibold">새 프로젝트</span>
              <span className="mt-1 text-[14px]">마케팅, 기술 분석처럼 목적별로</span>
            </button>
          </li>
        )}
      </ul>
    </div>
  );
}
