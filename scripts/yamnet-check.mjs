// YAMNet 으로 말/노래/음악 구간 판정이 되는지 확인하는 로컬 스크립트
// 사용: node scripts/yamnet-check.mjs <audio-file>
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import * as tf from "@tensorflow/tfjs";

const dir = new URL("../public/models/yamnet/", import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("model.json", dir)));
const shards = manifest.weightsManifest[0].paths.map((p) => readFileSync(new URL(p, dir)));
const weightData = Buffer.concat(shards);
const model = await tf.loadGraphModel(tf.io.fromMemory({
  modelTopology: manifest.modelTopology,
  weightSpecs: manifest.weightsManifest[0].weights,
  weightData: weightData.buffer.slice(weightData.byteOffset, weightData.byteOffset + weightData.byteLength),
}));

const pcm = execFileSync("ffmpeg", ["-loglevel", "error", "-i", process.argv[2], "-ac", "1", "-ar", "16000", "-f", "f32le", "-"], { maxBuffer: 1 << 28 });
const wave = new Float32Array(pcm.buffer, pcm.byteOffset, pcm.byteLength / 4);
const scores = model.execute(tf.tensor1d(wave), "Identity:0");
const s = await scores.array();

const SPEECH = [0, 1, 2, 3];
const SINGING = [24, 25, 26, 27, 29, 30, 31, 32, 261];
const MUSIC = 132;
s.forEach((row, i) => {
  const t = (i * 0.48).toFixed(1);
  const sp = Math.max(...SPEECH.map((k) => row[k]));
  const sg = Math.max(...SINGING.map((k) => row[k]));
  console.log(t.padStart(5), "speech", sp.toFixed(2), "sing", sg.toFixed(2), "music", row[MUSIC].toFixed(2));
});
