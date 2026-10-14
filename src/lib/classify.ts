import type { LineKind, Transcript, TranscriptLine } from "./types";

// 브라우저에서 YAMNet 으로 뽑은 프레임별 점수 (0.48s hop, 0.96s window)
export type AudioClasses = { hop: number; speech: number[]; music: number[]; sing: number[] };

const center = (i: number, hop: number) => i * hop + hop;

function framesIn(ac: AudioClasses, start: number, end: number): number[] {
  const idx: number[] = [];
  for (let i = 0; i < ac.speech.length; i++) {
    const c = center(i, ac.hop);
    if (c >= start && c <= end) idx.push(i);
  }
  if (!idx.length && ac.speech.length) {
    const mid = (start + end) / 2;
    idx.push(Math.min(ac.speech.length - 1, Math.max(0, Math.round((mid - ac.hop) / ac.hop))));
  }
  return idx;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export function lineKind(ac: AudioClasses, start: number, end: number): LineKind {
  const idx = framesIn(ac, start, end);
  if (!idx.length) return "unknown";
  const sp = mean(idx.map((i) => ac.speech[i]));
  const mu = mean(idx.map((i) => Math.max(ac.music[i], ac.sing[i])));
  if (sp >= mu) return mu >= 0.3 ? "speech_music" : "speech";
  return "song";
}

export function labelLines(lines: TranscriptLine[], ac: AudioClasses | null): TranscriptLine[] {
  if (!ac) return lines;
  return lines.map((l) => ({ ...l, kind: lineKind(ac, l.start, l.end) }));
}

// 가사·말이 없는 배경음악 구간도 보이도록 프레임을 구간으로 묶는다
export function audioRuns(ac: AudioClasses | null): Transcript["audio"] {
  if (!ac || !ac.speech.length) return undefined;
  type K = "speech" | "music" | "song" | "silence";
  const kindAt = (i: number): K => {
    const sp = ac.speech[i];
    const mu = Math.max(ac.music[i], ac.sing[i]);
    if (sp >= 0.35 && sp >= mu) return "speech";
    if (mu >= 0.3) return ac.sing[i] >= 0.3 ? "song" : "music";
    return "silence";
  };
  const runs: { start: number; end: number; kind: K }[] = [];
  for (let i = 0; i < ac.speech.length; i++) {
    const k = kindAt(i);
    const s = i * ac.hop;
    const e = s + ac.hop;
    const last = runs[runs.length - 1];
    if (last && last.kind === k) last.end = e;
    else runs.push({ start: s, end: e, kind: k });
  }
  // 1초 미만 구간은 앞 구간에 흡수
  const merged: typeof runs = [];
  for (const r of runs) {
    const last = merged[merged.length - 1];
    if (last && (r.end - r.start < 1 || last.kind === r.kind)) last.end = r.end;
    else merged.push({ ...r });
  }
  return merged.map((r) => ({ ...r, start: +r.start.toFixed(2), end: +r.end.toFixed(2) }));
}
