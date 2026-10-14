// 출처별 수집기 점검: npx tsx --conditions=react-server scripts/collect-check.mts
process.loadEnvFile(".env.local");
import { collect } from "../src/lib/sources/collect";
import { detect } from "../src/lib/sources/detect";

const urls = process.argv.slice(2).length
  ? process.argv.slice(2)
  : [
      "https://x.com/jack/status/20",
      "https://www.youtube.com/watch?v=jNQXAC9IVRw",
      "https://www.tiktok.com/@scout2015/video/6718335390845095173",
      "https://vercel.com/blog/introducing-react-tweet",
      "https://linear.app",
    ];
for (const u of urls) {
  const d = detect(u);
  try {
    const c = await collect(d!);
    const t = c.transcripts[0];
    console.log(`> ${c.source}/${c.format} id=${c.shortcode} | ${c.title.slice(0, 50)} | @${c.account.username} | media=${c.media.length} thumb=${!!c.thumbUrl} body=${c.body.length}ch` + (t ? ` | transcript ${t.status} ${t.lines.length}줄 ${t.lines[0]?.text.slice(0, 40) ?? t.error ?? ""}` : ""));
  } catch (e) {
    console.log(`> FAIL ${u}: ${e instanceof Error ? e.message : e}`);
  }
}
