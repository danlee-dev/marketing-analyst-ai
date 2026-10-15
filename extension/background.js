import { collectLinksInPage, detect } from "./lib/detect.js";

// 레퍼런스 보관함 확장 서비스 워커: API 호출, 저장 큐(팝업을 닫아도 계속), 우클릭 메뉴, 단축키, 화면 캡처.

const DEFAULT_BASE = "https://marketing-analyst-ai.vercel.app";
const CONCURRENCY = 2;

// ---------- 저장소 ----------
const get = (keys) => chrome.storage.local.get(keys);
const set = (obj) => chrome.storage.local.set(obj);

async function config() {
  const { token, base, dest } = await get(["token", "base", "dest"]);
  return { token: token || null, base: base || DEFAULT_BASE, dest: dest || null };
}

async function api(path, init = {}) {
  const { token, base } = await config();
  if (!token) throw new Error("확장이 연결되지 않았어요");
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(init.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    await set({ token: null });
    throw new Error("연결이 끊겼어요. 다시 연결해 주세요");
  }
  if (!res.ok) throw new Error(data.error || `요청 실패 (${res.status})`);
  return data;
}

// ---------- 화면 캡처 (긴 변 1600px JPEG 로 줄여 4MB 제한 아래로) ----------
async function capture(windowId) {
  const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: "jpeg", quality: 85 });
  const blob = await (await fetch(dataUrl)).blob();
  const bmp = await createImageBitmap(blob);
  const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const canvas = new OffscreenCanvas(Math.round(bmp.width * scale), Math.round(bmp.height * scale));
  canvas.getContext("2d").drawImage(bmp, 0, 0, canvas.width, canvas.height);
  const out = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.82 });
  const buf = new Uint8Array(await out.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return `data:image/jpeg;base64,${btoa(bin)}`;
}

// ---------- 페이지 안 토스트 (닫힌 shadow DOM 이라 페이지가 건드릴 수 없다) ----------
function pageToast(text, tone) {
  const id = "rb-ext-toast";
  document.getElementById(id)?.remove();
  const host = document.createElement("div");
  host.id = id;
  host.style.cssText = "position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:2147483647;";
  const root = host.attachShadow({ mode: "closed" });
  const dark = matchMedia("(prefers-color-scheme: dark)").matches;
  const bg = tone === "error" ? "#c62a28" : dark ? "#f2f2ef" : "#161616";
  const fg = tone === "error" ? "#fff" : dark ? "#0c0c0c" : "#fff";
  root.innerHTML = `<style>
    div{font:600 14px/1.4 -apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Pretendard",sans-serif;letter-spacing:-.01em;
      background:${bg};color:${fg};padding:12px 18px;border-radius:999px;box-shadow:0 16px 48px rgb(0 0 0/.28);
      animation:in .35s cubic-bezier(.05,.7,.1,1) both;white-space:nowrap;max-width:80vw;overflow:hidden;text-overflow:ellipsis}
    @keyframes in{from{opacity:0;transform:translateY(12px) scale(.96)}}
    @media (prefers-reduced-motion:reduce){div{animation:none}}</style><div></div>`;
  root.querySelector("div").textContent = text;
  document.documentElement.appendChild(host);
  setTimeout(() => host.remove(), 3200);
}

async function toast(tabId, text, tone) {
  if (!tabId) return;
  try {
    await chrome.scripting.executeScript({ target: { tabId }, func: pageToast, args: [text, tone || null] });
  } catch {
    // chrome:// 같은 페이지에는 못 띄운다
  }
}

// ---------- 저장 ----------
async function saveOne({ url, note, screenshot, transcribe, dest }) {
  const target = dest || (await config()).dest;
  if (!target?.projectId) throw new Error("확장 아이콘을 눌러 저장 위치를 먼저 골라 주세요");
  const data = await api("/api/ext/save", {
    method: "POST",
    body: JSON.stringify({ projectId: target.projectId, folderId: target.folderId || null, url, note, screenshot, transcribe: transcribe !== false }),
  });
  await pushRecent(data.post, data.existed);
  return data;
}

async function pushRecent(post, existed) {
  const { recent = [] } = await get("recent");
  const next = [{ ...post, existed: !!existed, at: Date.now() }, ...recent.filter((r) => r.id !== post.id)].slice(0, 8);
  await set({ recent: next });
}

async function saveTab(tab, { withShot } = {}) {
  const d = detect(tab.url);
  if (!d) return toast(tab.id, "이 페이지는 저장할 수 없어요", "error");
  try {
    const shot = (withShot ?? d.source === "web") ? await capture(tab.windowId).catch(() => undefined) : undefined;
    await toast(tab.id, "보관함에 저장하는 중");
    const res = await saveOne({ url: tab.url, screenshot: shot });
    await toast(tab.id, res.existed ? "이미 보관함에 있어요" : `저장했어요 · ${res.post.title}`);
  } catch (e) {
    await toast(tab.id, e.message, "error");
  }
}

// ---------- 한 번에 가져오기 큐 ----------
// queue: { dest, transcribe, items: [{ url, status: pending|running|done|existed|error, title?, error?, startedAt? }] }
let pumping = false;

async function enqueue(urls, dest, transcribe) {
  const { queue } = await get("queue");
  const items = (queue?.items || []).filter((i) => i.status === "pending" || i.status === "running");
  const known = new Set(items.map((i) => i.url));
  for (const url of urls) if (!known.has(url)) items.push({ url, status: "pending" });
  await set({ queue: { dest, transcribe: transcribe !== false, items, startedAt: Date.now() } });
  chrome.alarms.create("rb-pump", { periodInMinutes: 0.5 });
  pump();
}

async function updateItem(url, patch) {
  const { queue } = await get("queue");
  if (!queue) return;
  queue.items = queue.items.map((i) => (i.url === url ? { ...i, ...patch } : i));
  await set({ queue });
}

async function pump() {
  if (pumping) return;
  pumping = true;
  try {
    for (;;) {
      const { queue } = await get("queue");
      if (!queue) break;
      // 서비스 워커가 중간에 꺼졌다 켜지면 오래 멈춘 항목을 다시 대기로
      const stale = queue.items.filter((i) => i.status === "running" && Date.now() - (i.startedAt || 0) > 6 * 60_000);
      for (const s of stale) await updateItem(s.url, { status: "pending" });
      const next = queue.items.filter((i) => i.status === "pending").slice(0, CONCURRENCY);
      if (!next.length) {
        chrome.alarms.clear("rb-pump");
        break;
      }
      await Promise.all(
        next.map(async (item) => {
          await updateItem(item.url, { status: "running", startedAt: Date.now() });
          try {
            const res = await saveOne({ url: item.url, dest: queue.dest, transcribe: queue.transcribe });
            await updateItem(item.url, { status: res.existed ? "existed" : "done", title: res.post.title });
          } catch (e) {
            await updateItem(item.url, { status: "error", error: e.message });
          }
        }),
      );
      await new Promise((r) => setTimeout(r, 800));
    }
  } finally {
    pumping = false;
  }
}

chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === "rb-pump") pump();
});
chrome.runtime.onStartup.addListener(() => pump());

async function collectAndQueue(tabId, { scroll = true } = {}) {
  const { dest, token } = await config();
  if (!token) throw new Error("확장이 연결되지 않았어요");
  if (!dest?.projectId) throw new Error("확장 아이콘을 눌러 저장 위치를 먼저 골라 주세요");
  const [{ result: urls = [] } = {}] = await chrome.scripting.executeScript({ target: { tabId }, func: collectLinksInPage, args: [{ scroll, max: 600 }] });
  if (!urls.length) return { found: 0, added: 0 };
  const { existing = [] } = await api("/api/ext/check", { method: "POST", body: JSON.stringify({ projectId: dest.projectId, urls }) });
  const fresh = urls.filter((u) => !existing.includes(u));
  if (fresh.length) await enqueue(fresh, dest, true);
  return { found: urls.length, added: fresh.length };
}

// ---------- 메시지 (팝업, 인스타 버튼, 사이트 연결) ----------
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  (async () => {
    switch (msg?.type) {
      case "set-token": {
        // 사이트 연결 페이지(bridge.js)에서만 온다
        if (!sender.tab || !sender.url || !/^(https:\/\/marketing-analyst-ai\.vercel\.app|http:\/\/localhost:3017)\//.test(sender.url)) return { ok: false };
        await set({ token: msg.token, base: new URL(sender.url).origin });
        return { ok: true };
      }
      case "collect-progress":
        // 페이지에서 모으는 중 개수를 그 탭의 플로팅 버튼에도 전달
        if (sender.tab?.id != null) chrome.tabs.sendMessage(sender.tab.id, msg).catch(() => {});
        return null;
      case "tree":
        return api("/api/ext/tree");
      case "save": {
        const shot = msg.screenshot && msg.windowId != null ? await capture(msg.windowId).catch(() => undefined) : undefined;
        return saveOne({ url: msg.url, note: msg.note, screenshot: shot, transcribe: msg.transcribe, dest: msg.dest });
      }
      case "check":
        return api("/api/ext/check", { method: "POST", body: JSON.stringify({ projectId: msg.projectId, urls: msg.urls }) });
      case "enqueue":
        await enqueue(msg.urls, msg.dest, msg.transcribe);
        return { ok: true };
      case "queue-clear": {
        const { queue } = await get("queue");
        if (queue) await set({ queue: { ...queue, items: queue.items.filter((i) => i.status === "pending" || i.status === "running") } });
        return { ok: true };
      }
      case "queue-cancel":
        await set({ queue: null });
        chrome.alarms.clear("rb-pump");
        return { ok: true };
      case "fab-save":
        if (sender.tab) await saveTab({ ...sender.tab, url: msg.url || sender.tab.url }, { withShot: false });
        return { ok: true };
      case "fab-collect":
        if (!sender.tab) return { ok: false };
        try {
          const r = await collectAndQueue(sender.tab.id, { scroll: true });
          await toast(sender.tab.id, r.found ? `${r.found}개 중 새 게시물 ${r.added}개를 가져와요` : "가져올 게시물을 찾지 못했어요");
          return r;
        } catch (e) {
          await toast(sender.tab.id, e.message, "error");
          return { error: e.message };
        }
      default:
        return null;
    }
  })()
    .then((r) => reply(r))
    .catch((e) => reply({ error: e.message }));
  return true;
});

// ---------- 우클릭 메뉴 ----------
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: "rb-link", title: "링크를 보관함에 저장", contexts: ["link"] });
    chrome.contextMenus.create({ id: "rb-page", title: "이 페이지를 보관함에 저장", contexts: ["page", "video", "image"] });
    chrome.contextMenus.create({ id: "rb-shot", title: "화면 캡처해서 보관함에 저장", contexts: ["page"] });
    chrome.contextMenus.create({ id: "rb-text", title: "선택한 문구를 메모로 저장", contexts: ["selection"] });
    chrome.contextMenus.create({ id: "rb-list", title: "이 페이지 게시물 모두 가져오기", contexts: ["page"], documentUrlPatterns: ["https://www.instagram.com/*", "https://www.youtube.com/*", "https://x.com/*", "https://twitter.com/*", "https://www.tiktok.com/*"] });
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab) return;
  try {
    if (info.menuItemId === "rb-link" && info.linkUrl) {
      if (!detect(info.linkUrl)) return toast(tab.id, "저장할 수 없는 링크예요", "error");
      await toast(tab.id, "보관함에 저장하는 중");
      const r = await saveOne({ url: info.linkUrl });
      await toast(tab.id, r.existed ? "이미 보관함에 있어요" : `저장했어요 · ${r.post.title}`);
    } else if (info.menuItemId === "rb-page") {
      await saveTab(tab);
    } else if (info.menuItemId === "rb-shot") {
      await saveTab(tab, { withShot: true });
    } else if (info.menuItemId === "rb-text" && info.selectionText) {
      const { dest } = await config();
      if (!dest?.projectId) throw new Error("확장 아이콘을 눌러 저장 위치를 먼저 골라 주세요");
      await api("/api/ext/note", {
        method: "POST",
        body: JSON.stringify({ projectId: dest.projectId, folderId: dest.folderId || null, text: info.selectionText, url: tab.url, title: tab.title }),
      });
      await toast(tab.id, "선택한 문구를 메모로 저장했어요");
    } else if (info.menuItemId === "rb-list") {
      await toast(tab.id, "페이지를 끝까지 내리며 게시물을 모으는 중");
      const r = await collectAndQueue(tab.id);
      await toast(tab.id, r.found ? `${r.found}개 중 새 게시물 ${r.added}개를 가져와요` : "가져올 게시물을 찾지 못했어요");
    }
  } catch (e) {
    await toast(tab.id, e.message, "error");
  }
});

// ---------- 단축키 ----------
chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command === "save-page" && tab) await saveTab(tab);
});
