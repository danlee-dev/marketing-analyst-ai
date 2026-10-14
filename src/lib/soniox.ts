import "server-only";
import type { TranscriptLine } from "./types";

// lectranscribe backend/stt_soniox.py 의 업로드·폴링·줄 나누기를 옮긴 것
const API = "https://api.soniox.com/v1";
const MODEL = process.env.SONIOX_MODEL || "stt-async-v5";
const PAUSE_MS = 800;
const LONG_PAUSE_MS = 2000;
const MIN_LINE_CHARS = 40;
const MAX_LINE_MS = 25000;
const BREATH_MS = 300;
const SHORT_LINE_CHARS = 15;
const SENTENCE_END = /[.?!。？！]$/;

type Token = {
  text: string;
  start_ms: number;
  end_ms: number;
  confidence?: number;
  language?: string;
  speaker?: string;
  is_audio_event?: boolean;
  translation_status?: string;
};

function headers(json = false): HeadersInit {
  const key = process.env.SONIOX_API_KEY;
  if (!key) throw new Error("SONIOX_API_KEY missing");
  return json ? { Authorization: `Bearer ${key}`, "Content-Type": "application/json" } : { Authorization: `Bearer ${key}` };
}

async function ok<T>(res: Response, what: string): Promise<T> {
  if (!res.ok) throw new Error(`Soniox ${what} 실패 (HTTP ${res.status}) ${(await res.text()).slice(0, 200)}`);
  return res.json() as Promise<T>;
}

export async function transcribeFile(file: Blob, filename: string, deadlineMs = 240_000): Promise<TranscriptLine[]> {
  const form = new FormData();
  form.append("file", file, filename);
  const uploaded = await ok<{ id: string }>(await fetch(`${API}/files`, { method: "POST", headers: headers(), body: form }), "업로드");
  let transcriptionId: string | null = null;
  try {
    const created = await ok<{ id: string }>(
      await fetch(`${API}/transcriptions`, {
        method: "POST",
        headers: headers(true),
        body: JSON.stringify({
          model: MODEL,
          file_id: uploaded.id,
          language_hints: ["ko", "en"],
          enable_language_identification: true,
          enable_speaker_diarization: true,
        }),
      }),
      "요청",
    );
    transcriptionId = created.id;
    const until = Date.now() + deadlineMs;
    for (;;) {
      const st = await ok<{ status: string; error_message?: string }>(
        await fetch(`${API}/transcriptions/${created.id}`, { headers: headers() }),
        "상태 조회",
      );
      if (st.status === "completed") break;
      if (st.status === "error") throw new Error(`Soniox 전사 오류: ${st.error_message ?? ""}`);
      if (Date.now() > until) throw new Error("Soniox 전사 시간 초과");
      await new Promise((r) => setTimeout(r, 1000));
    }
    const t = await ok<{ tokens: Token[] }>(
      await fetch(`${API}/transcriptions/${created.id}/transcript`, { headers: headers() }),
      "결과 조회",
    );
    return tokensToLines(t.tokens);
  } finally {
    if (transcriptionId) await fetch(`${API}/transcriptions/${transcriptionId}`, { method: "DELETE", headers: headers() }).catch(() => {});
    await fetch(`${API}/files/${uploaded.id}`, { method: "DELETE", headers: headers() }).catch(() => {});
  }
}

// Soniox 토큰은 단어 조각이라 띄어쓰기로 시작하거나 한자·가나일 때만 줄을 끊는다
const startsWord = (text: string) => !text || /^[\s぀-ヿ一-鿿]/.test(text);

export function tokensToLines(tokens: Token[]): TranscriptLine[] {
  const lines: TranscriptLine[] = [];
  let cur: Token[] = [];

  const flush = () => {
    const text = cur.map((t) => t.text).join("").trim();
    if (text) {
      const count = (key: "language" | "speaker") => {
        const m = new Map<string, number>();
        for (const t of cur) if (t[key]) m.set(t[key]!, (m.get(t[key]!) ?? 0) + 1);
        return [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
      };
      lines.push({
        start: cur[0].start_ms / 1000,
        end: cur[cur.length - 1].end_ms / 1000,
        text,
        lang: count("language"),
        speaker: count("speaker"),
      });
    }
    cur = [];
  };

  for (const tk of tokens) {
    if (tk.is_audio_event || tk.translation_status === "translation") continue;
    if (cur.length && startsWord(tk.text)) {
      const gap = tk.start_ms - cur[cur.length - 1].end_ms;
      const chars = cur.map((t) => t.text).join("").trim().length;
      if (
        gap > LONG_PAUSE_MS ||
        (gap > PAUSE_MS && chars >= MIN_LINE_CHARS) ||
        (gap > BREATH_MS && tk.start_ms - cur[0].start_ms > MAX_LINE_MS)
      )
        flush();
    }
    cur.push(tk);
    if (SENTENCE_END.test(tk.text.trimEnd())) flush();
  }
  flush();
  return mergeShort(lines);
}

function mergeShort(lines: TranscriptLine[]): TranscriptLine[] {
  const out: TranscriptLine[] = [];
  let pending: TranscriptLine | null = null;
  for (let line of lines) {
    if (pending) {
      if ((line.start - pending.end) * 1000 <= LONG_PAUSE_MS) {
        line = { ...line, start: pending.start, text: `${pending.text} ${line.text}` };
      } else out.push(pending);
      pending = null;
    }
    if (line.text.length < SHORT_LINE_CHARS && !SENTENCE_END.test(line.text)) pending = line;
    else out.push(line);
  }
  if (pending) out.push(pending);
  return out;
}
