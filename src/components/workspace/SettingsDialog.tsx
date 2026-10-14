"use client";

import { AnimatePresence, motion } from "motion/react";
import { Check, Copy, Link2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { db } from "@/lib/client/api";
import { ask, Modal, toast, toastError } from "../ui/overlay";
import { useWorkspace } from "./context";

export function SettingsDialog() {
  const w = useWorkspace();
  return (
    <Modal open={w.settingsOpen} onClose={() => w.setSettingsOpen(false)} width={560}>
      {w.workspace && <Body key={w.workspace.id} />}
    </Modal>
  );
}

function Body() {
  const w = useWorkspace();
  const router = useRouter();
  const ws = w.workspace!;
  const [name, setName] = useState(ws.name);
  const [copied, setCopied] = useState<string | null>(null);
  const link = (token: string) => `${window.location.origin}/invite/${token}`;

  async function copy(token: string) {
    await navigator.clipboard.writeText(link(token));
    setCopied(token);
    setTimeout(() => setCopied(null), 1600);
  }

  async function createLink() {
    try {
      const inv = await db.createInvite(ws.id);
      w.setInvites((l) => [inv, ...l]);
      await copy(inv.token);
      toast("초대 링크를 복사했어요. 팀원에게 보내 주세요");
    } catch (e) {
      toastError(e);
    }
  }

  return (
    <div className="p-6 sm:p-8">
      <div className="flex items-start justify-between gap-4">
        <h2 className="text-[20px] font-bold">설정과 팀원</h2>
        <button aria-label="닫기" onClick={() => w.setSettingsOpen(false)} className="press -mr-2 -mt-1 grid size-9 place-items-center rounded-full text-ink-2 hover:bg-surface-2">
          <X size={18} />
        </button>
      </div>

      <label className="mt-6 block text-[14px] font-semibold text-ink-2" htmlFor="ws-name">
        워크스페이스 이름
      </label>
      <input
        id="ws-name"
        value={name}
        disabled={!w.isOwner}
        onChange={(e) => setName(e.target.value)}
        onBlur={async () => {
          if (!name.trim() || name === ws.name) return;
          try {
            await db.renameWorkspace(ws.id, name.trim());
            w.setWorkspace({ ...ws, name: name.trim() });
            w.reload();
          } catch (e) {
            toastError(e);
          }
        }}
        className="mt-2 h-12 w-full rounded-md bg-surface-2 px-4 text-[15px] outline-none focus:ring-2 focus:ring-ink disabled:opacity-60"
      />

      <div className="mt-8 flex items-center justify-between gap-3">
        <h3 className="text-[16px] font-bold">
          팀원 <span className="tabular-nums text-mute">{w.members.length}</span>
        </h3>
        <button onClick={createLink} className="press flex h-10 items-center gap-2 rounded-md bg-ink px-4 text-[14px] font-semibold text-on-ink">
          <Link2 size={15} /> 초대 링크 만들기
        </button>
      </div>
      <p className="mt-1 text-[14px] text-mute">링크를 받은 사람은 로그인하면 바로 이 워크스페이스에 들어와요. 14일 동안 쓸 수 있어요.</p>

      <AnimatePresence initial={false}>
        {w.invites.map((inv) => (
          <motion.div
            key={inv.id}
            layout
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-3 flex items-center gap-2 rounded-md bg-surface-2 py-1.5 pl-4 pr-1.5">
              <span className="min-w-0 flex-1 truncate font-mono text-[13px] text-ink-2">{link(inv.token)}</span>
              <button onClick={() => copy(inv.token)} className="press flex h-9 items-center gap-1.5 rounded-sm px-3 text-[13px] font-semibold hover:bg-surface-3">
                {copied === inv.token ? <Check size={14} /> : <Copy size={14} />}
                {copied === inv.token ? "복사됨" : "복사"}
              </button>
              <button
                aria-label="링크 끄기"
                onClick={async () => {
                  try {
                    await db.revokeInvite(inv.id);
                    w.setInvites((l) => l.filter((x) => x.id !== inv.id));
                  } catch (e) {
                    toastError(e);
                  }
                }}
                className="press grid size-9 place-items-center rounded-sm text-ink-2 hover:bg-surface-3"
              >
                <X size={15} />
              </button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>

      <ul className="mt-5 flex flex-col gap-1">
        {w.members.map((m) => {
          const label = m.profile?.name || m.profile?.email || "알 수 없음";
          const me = m.user_id === w.me?.id;
          return (
            <li key={m.user_id} className="flex items-center gap-3 rounded-md px-1 py-2">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-3 text-[14px] font-semibold">{label.slice(0, 1).toUpperCase()}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-semibold leading-tight">
                  {label}
                  {me && <span className="font-normal text-mute"> (나)</span>}
                </span>
                <span className="block truncate text-[13px] text-mute">{m.profile?.email}</span>
              </span>
              {w.isOwner && !me ? (
                <select
                  value={m.role}
                  onChange={async (e) => {
                    const role = e.target.value as "owner" | "member";
                    try {
                      await db.setRole(ws.id, m.user_id, role);
                      w.setMembers((l) => l.map((x) => (x.user_id === m.user_id ? { ...x, role } : x)));
                    } catch (err) {
                      toastError(err);
                    }
                  }}
                  className="h-9 rounded-sm bg-surface-2 px-2 text-[13px] outline-none"
                >
                  <option value="owner">관리자</option>
                  <option value="member">멤버</option>
                </select>
              ) : (
                <span className="text-[13px] text-ink-2">{m.role === "owner" ? "관리자" : "멤버"}</span>
              )}
              {(w.isOwner || me) && (
                <button
                  aria-label={me ? "나가기" : "내보내기"}
                  onClick={async () => {
                    const ok = await ask({
                      title: me ? "이 워크스페이스에서 나갈까요?" : `${label} 님을 내보낼까요?`,
                      confirm: me ? "나가기" : "내보내기",
                      danger: true,
                    });
                    if (!ok) return;
                    try {
                      await db.removeMember(ws.id, m.user_id);
                      if (me) {
                        localStorage.removeItem("lastWorkspace");
                        router.push("/");
                      } else w.setMembers((l) => l.filter((x) => x.user_id !== m.user_id));
                    } catch (e) {
                      toastError(e);
                    }
                  }}
                  className="press grid size-9 place-items-center rounded-full text-ink-2 hover:bg-surface-2 hover:text-danger"
                >
                  <X size={15} />
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {w.isOwner && (
        <button
          onClick={async () => {
            const ok = await ask({
              title: `'${ws.name}' 워크스페이스를 삭제할까요?`,
              body: "모든 프로젝트와 게시물 기록이 지워지고 되돌릴 수 없어요.",
              confirm: "삭제",
              danger: true,
            });
            if (!ok) return;
            try {
              await db.deleteWorkspace(ws.id);
              localStorage.removeItem("lastWorkspace");
              router.push("/");
            } catch (e) {
              toastError(e);
            }
          }}
          className="mt-8 text-[14px] text-mute hover:text-danger"
        >
          워크스페이스 삭제
        </button>
      )}
    </div>
  );
}
