"use client";

import { AnimatePresence, motion } from "motion/react";
import { Check, Copy, KeyRound, X } from "lucide-react";
import { useEffect, useState } from "react";
import { ask, Modal, toastError } from "../ui/overlay";
import { useWorkspace } from "./context";

type Token = { id: string; name: string; prefix: string; created_at: string; last_used_at: string | null };

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {}
    ta.remove();
    return ok;
  }
}

export function ClaudeDialog() {
  const w = useWorkspace();
  return (
    <Modal open={w.claudeOpen} onClose={() => w.setClaudeOpen(false)} width={580}>
      {w.claudeOpen && (
        <div className="relative p-6 sm:p-8">
          <button
            aria-label="닫기"
            onClick={() => w.setClaudeOpen(false)}
            className="press absolute right-4 top-4 grid size-9 place-items-center rounded-full text-ink-2 hover:bg-surface-2"
          >
            <X size={18} />
          </button>
          <ClaudeConnect />
        </div>
      )}
    </Modal>
  );
}

// 내 로컬 Claude(Claude Code / Desktop)를 MCP 로 붙인다. 분석은 사용자 Claude 가 하므로 API 비용 없음.
export function ClaudeConnect() {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [fresh, setFresh] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const url = typeof window === "undefined" ? "" : `${window.location.origin}/api/mcp`;

  useEffect(() => {
    fetch("/api/tokens")
      .then((r) => r.json())
      .then((d) => setTokens(d.tokens ?? []))
      .catch(() => {});
  }, []);

  async function create() {
    setBusy(true);
    try {
      const res = await fetch("/api/tokens", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Claude" }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "만들지 못했어요");
      setFresh(d.token);
      setTokens((l) => [d.record, ...l]);
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  }

  async function copy(key: string, value: string) {
    if (await copyText(value)) {
      setCopied(key);
      setTimeout(() => setCopied(null), 1600);
    }
  }

  const token = fresh ?? "<토큰>";
  const codeCmd = `claude mcp add --transport http reference-box ${url} --header "Authorization: Bearer ${token}"`;
  const desktop = JSON.stringify(
    { mcpServers: { "reference-box": { command: "npx", args: ["-y", "mcp-remote", url, "--header", "Authorization:${AUTH}"], env: { AUTH: `Bearer ${token}` } } } },
    null,
    2,
  );

  return (
    <div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/claude-mark.svg" alt="" width={40} height={40} />
      <h2 className="mt-4 text-[22px] font-bold">내 Claude 연결</h2>
      <p className="mt-2 pr-6 text-[15px] text-ink-2">
        Claude Code나 Claude Desktop이 레퍼런스를 직접 읽고 분석해 메모로 남겨요. Claude Code는 릴스 원본 영상을 내려받아 장면별로 나눠 보는 것까지 해요. 분석은 내 Claude 안에서 돌아서 따로 API 비용이 들지 않아요.
      </p>
      <button onClick={create} disabled={busy} className="press mt-5 flex h-11 items-center gap-2 rounded-md bg-ink px-5 text-[15px] font-semibold text-on-ink disabled:opacity-40">
        <KeyRound size={16} /> 연결 토큰 만들기
      </button>

      <AnimatePresence initial={false}>
        {fresh && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <p className="mt-4 text-[14px] font-semibold text-ink">이 토큰은 지금만 보여요. 아래 명령을 바로 복사해 두세요.</p>
            <Snippet label="Claude Code (터미널)" value={codeCmd} copied={copied === "code"} onCopy={() => copy("code", codeCmd)} />
            <Snippet label="Claude Desktop (claude_desktop_config.json)" value={desktop} copied={copied === "desk"} onCopy={() => copy("desk", desktop)} />
            <p className="mt-2 text-[13px] text-mute">연결한 뒤 Claude에게 &ldquo;레퍼런스 보관함 릴스 훅 폴더의 영상들 장면까지 분석해서 메모로 남겨 줘&rdquo;처럼 말하면 돼요.</p>
          </motion.div>
        )}
      </AnimatePresence>

      {tokens.length > 0 && (
        <ul className="mt-4 flex flex-col gap-1">
          {tokens.map((t) => (
            <li key={t.id} className="flex items-center gap-3 rounded-md px-1 py-2">
              <span className="font-mono text-[13px] text-ink-2">{t.prefix}…</span>
              <span className="min-w-0 flex-1 truncate text-[13px] text-mute">
                {t.last_used_at ? `마지막 사용 ${new Date(t.last_used_at).toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" })}` : "아직 사용 안 함"}
              </span>
              <button
                aria-label="토큰 끊기"
                onClick={async () => {
                  if (!(await ask({ title: "이 연결을 끊을까요?", body: "이 토큰을 쓰는 Claude는 더 이상 레퍼런스를 볼 수 없어요.", confirm: "끊기", danger: true }))) return;
                  await fetch(`/api/tokens?id=${t.id}`, { method: "DELETE" });
                  setTokens((l) => l.filter((x) => x.id !== t.id));
                }}
                className="press grid size-9 place-items-center rounded-full text-ink-2 hover:bg-surface-2 hover:text-danger"
              >
                <X size={15} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Snippet({ label, value, copied, onCopy }: { label: string; value: string; copied: boolean; onCopy: () => void }) {
  return (
    <div className="mt-3">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[13px] font-semibold text-ink-2">{label}</span>
        <button onClick={onCopy} className="press flex h-8 items-center gap-1.5 rounded-sm px-2.5 text-[13px] font-semibold hover:bg-surface-2">
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? "복사됨" : "복사"}
        </button>
      </div>
      <pre className="no-scrollbar max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-md bg-surface-2 p-3 font-mono text-[12.5px] leading-relaxed text-ink-2">{value}</pre>
    </div>
  );
}
