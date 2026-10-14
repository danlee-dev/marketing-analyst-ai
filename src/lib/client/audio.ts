import type { AudioClasses } from "@/lib/classify";

// YAMNet(AudioSet 521 클래스)으로 말/노래/음악 점수를 브라우저에서 뽑는다
const SPEECH = [0, 1, 2, 3];
const SING = [24, 25, 26, 27, 29, 30, 31, 32, 261];
const MUSIC = 132;
const HOP = 0.48;

type Tf = typeof import("@tensorflow/tfjs");
let modelPromise: Promise<{ tf: Tf; model: import("@tensorflow/tfjs").GraphModel }> | null = null;

function loadModel() {
  modelPromise ??= (async () => {
    const tf = await import("@tensorflow/tfjs");
    await tf.ready();
    const model = await tf.loadGraphModel("/models/yamnet/model.json");
    return { tf, model };
  })();
  return modelPromise;
}

async function decode16k(buf: ArrayBuffer): Promise<Float32Array> {
  const ctx = new AudioContext();
  try {
    const audio = await ctx.decodeAudioData(buf);
    const off = new OfflineAudioContext(1, Math.ceil(audio.duration * 16000), 16000);
    const src = off.createBufferSource();
    src.buffer = audio;
    src.connect(off.destination);
    src.start();
    return (await off.startRendering()).getChannelData(0);
  } finally {
    ctx.close();
  }
}

export async function classifyAudio(videoUrl: string): Promise<AudioClasses | null> {
  try {
    const [{ tf, model }, buf] = await Promise.all([loadModel(), fetch(videoUrl).then((r) => r.arrayBuffer())]);
    const wave = await decode16k(buf);
    if (wave.length < 16000) return null;
    const input = tf.tensor1d(wave);
    const out = model.execute(input, "Identity:0") as import("@tensorflow/tfjs").Tensor2D;
    const rows = (await out.array()) as number[][];
    input.dispose();
    out.dispose();
    const r2 = (x: number) => Math.round(x * 100) / 100;
    return {
      hop: HOP,
      speech: rows.map((r) => r2(Math.max(...SPEECH.map((i) => r[i])))),
      sing: rows.map((r) => r2(Math.max(...SING.map((i) => r[i])))),
      music: rows.map((r) => r2(r[MUSIC])),
    };
  } catch (e) {
    console.warn("> audio classify failed", e);
    return null;
  }
}
