import { collectLinksInPage, detect, listKind, SOURCE_LABEL } from "./lib/detect.js";

// 팝업: 저장 위치 고르기, 지금 페이지 저장, 목록 한 번에 가져오기, 진행 상황.

const $ = (id) => document.getElementById(id);
const send = (msg) => chrome.runtime.sendMessage(msg);
const DEFAULT_BASE = "https://marketing-analyst-ai.vercel.app";

let tab = null;
let page = null;
let tree = null;
let dest = null;
let collected = null;

function show(view) {
  for (const v of ["v-connect", "v-main", "v-settings"]) $(v).classList.toggle("hidden", v !== view);
  $("btn-settings").classList.toggle("hidden", view !== "v-main");
}

function setMsg(text, err, link) {
  const m = $("msg");
  m.textContent = text || "";
  m.classList.toggle("err", !!err);
  if (link) {
    const a = document.createElement("a");
    a.href = link.href;
    a.target = "_blank";
    a.textContent = ` ${link.text}`;
    m.appendChild(a);
  }
}

// ---------- 저장 위치 ----------
function destinations() {
  const out = [];
  for (const w of tree?.workspaces ?? []) {
    for (const p of w.projects) {
      out.push({ workspaceId: w.id, wsName: w.name, projectId: p.id, folderId: null, label: p.name, path: p.name, depth: 0 });
      const walk = (parent, depth, prefix) => {
        for (const f of p.folders.filter((x) => (x.parent_id ?? null) === parent)) {
          const path = `${prefix} / ${f.name}`;
          out.push({ workspaceId: w.id, wsName: w.name, projectId: p.id, folderId: f.id, label: f.name, path, depth });
          walk(f.id, depth + 1, path);
        }
      };
      walk(null, 1, p.name);
    }
  }
  return out;
}

function renderDest() {
  const all = destinations();
  const cur = all.find((d) => d.projectId === dest?.projectId && (d.folderId ?? null) === (dest?.folderId ?? null));
  $("dest-path").textContent = cur ? `${cur.wsName} · ${cur.path}` : all.length ? "골라 주세요" : "프로젝트가 없어요";
  $("btn-save").disabled = !cur || !page;
}

function renderPicker(filter = "") {
  const list = $("picker-list");
  list.textContent = "";
  const q = filter.trim().toLowerCase();
  let lastWs = null;
  for (const d of destinations().filter((x) => !q || x.path.toLowerCase().includes(q) || x.wsName.toLowerCase().includes(q))) {
    if (d.wsName !== lastWs && (tree?.workspaces?.length ?? 0) > 1) {
      const h = document.createElement("p");
      h.className = "pick-ws";
      h.textContent = d.wsName;
      list.appendChild(h);
      lastWs = d.wsName;
    }
    const b = document.createElement("button");
    b.type = "button";
    b.className = "pick" + (d.projectId === dest?.projectId && (d.folderId ?? null) === (dest?.folderId ?? null) ? " on" : "");
    b.style.paddingLeft = `${10 + d.depth * 14}px`;
    const dot = document.createElement("span");
    dot.className = "dot";
    const t = document.createElement("span");
    t.textContent = d.label;
    b.append(dot, t);
    b.addEventListener("click", async () => {
      dest = { workspaceId: d.workspaceId, projectId: d.projectId, folderId: d.folderId };
      await chrome.storage.local.set({ dest });
      $("picker").classList.add("hidden");
      renderDest();
    });
    list.appendChild(b);
  }
  if (!list.children.length) {
    const p = document.createElement("p");
    p.className = "pick-ws";
    p.textContent = "찾는 위치가 없어요";
    list.appendChild(p);
  }
}

// ---------- 현재 페이지 ----------
function renderPage() {
  page = detect(tab?.url);
  const el = $("page");
  if (!page) {
    el.classList.add("off");
    $("page-badge").textContent = "저장 불가";
    $("page-host").textContent = "";
    $("page-title").textContent = "이 페이지는 저장할 수 없어요";
    $("opts").classList.add("hidden");
    return;
  }
  $("page-badge").textContent = page.source === "web" ? "웹페이지" : `${SOURCE_LABEL[page.source]} ${page.kind}`;
  $("page-host").textContent = page.host ?? new URL(tab.url).hostname.replace(/^www\./, "");
  $("page-title").textContent = tab.title || tab.url;
  $("c-shot").checked = page.source === "web";
  $("t-tr").classList.toggle("hidden", !["instagram", "x"].includes(page.source));
  // 컬렉션·프로필 같은 목록 화면은 페이지 자체를 저장할 일이 없어서 한 번에 가져오기만 보여 준다
  const isList = page.source === "web" && !!listKind(tab.url);
  for (const id of ["page", "opts", "btn-save"]) $(id).classList.toggle("hidden", isList);
}

// ---------- 한 번에 가져오기 ----------
async function scanList(scroll) {
  const kind = listKind(tab?.url);
  try {
    const [{ result = [] } = {}] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: collectLinksInPage, args: [{ scroll, max: 600 }] });
    return { kind, urls: result };
  } catch {
    return { kind, urls: [] };
  }
}

async function renderBulk(scroll) {
  const box = $("bulk");
  const r = await scanList(scroll);
  if (!r.urls.length || (!r.kind && r.urls.length < 3)) {
    if (!scroll) box.classList.add("hidden");
    else ($("bulk-sub").textContent = "게시물 링크를 찾지 못했어요");
    return;
  }
  box.classList.remove("hidden");
  $("bulk-title").textContent = r.kind ?? "이 페이지의 게시물";
  collected = r.urls;
  let existing = [];
  if (dest?.projectId) existing = (await send({ type: "check", projectId: dest.projectId, urls: r.urls }))?.existing ?? [];
  const fresh = r.urls.filter((u) => !existing.includes(u));
  collected = fresh;
  $("bulk-sub").textContent = `${scroll ? "끝까지 모아서" : "지금 보이는"} ${r.urls.length}개 · 새로 ${fresh.length}개${existing.length ? ` · 이미 있음 ${existing.length}개` : ""}`;
  const imp = $("btn-import");
  imp.classList.toggle("hidden", !fresh.length);
  imp.textContent = `새 게시물 ${fresh.length}개 가져오기`;
  $("btn-collect").textContent = scroll ? "다시 모으기" : "끝까지 모으기";
}

// ---------- 진행 상황 ----------
const STATUS = { pending: "대기", running: "가져오는 중", done: "완료", existed: "이미 있음", error: "실패" };

function renderQueue(queue) {
  const box = $("queue");
  if (!queue?.items?.length) return box.classList.add("hidden");
  box.classList.remove("hidden");
  const total = queue.items.length;
  const finished = queue.items.filter((i) => !["pending", "running"].includes(i.status)).length;
  const failed = queue.items.filter((i) => i.status === "error").length;
  $("queue-title").textContent = finished < total ? `가져오는 중 ${finished}/${total}` : `가져오기 끝 · ${total - failed}개 저장${failed ? ` · 실패 ${failed}` : ""}`;
  $("queue-bar").style.transform = `scaleX(${total ? finished / total : 0})`;
  $("btn-queue").textContent = finished < total ? "멈추기" : "목록 지우기";
  $("btn-queue").onclick = () => send({ type: finished < total ? "queue-cancel" : "queue-clear" }).then(() => chrome.storage.local.get("queue").then((r) => renderQueue(r.queue)));
  const list = $("queue-list");
  list.textContent = "";
  for (const i of [...queue.items].reverse().slice(0, 40)) {
    const li = document.createElement("li");
    const t = document.createElement("span");
    t.className = "t";
    t.textContent = i.title || i.url.replace(/^https?:\/\/(www\.)?/, "");
    const st = document.createElement("span");
    st.className = "st" + (i.status === "error" ? " err" : "");
    st.textContent = i.status === "error" ? i.error || "실패" : STATUS[i.status];
    st.title = i.error || "";
    li.append(t, st);
    list.appendChild(li);
  }
}

function renderRecent(recent, base) {
  const box = $("recent");
  if (!recent?.length) return box.classList.add("hidden");
  box.classList.remove("hidden");
  const ul = $("recent-list");
  ul.textContent = "";
  for (const r of recent.slice(0, 4)) {
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.className = "t";
    a.href = `${base}/w/${r.workspace_id}/p/${r.project_id}${r.folder_id ? `/${r.folder_id}` : ""}`;
    a.target = "_blank";
    a.textContent = r.title;
    const st = document.createElement("span");
    st.className = "st";
    st.textContent = r.existed ? "이미 있음" : new Date(r.at).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
    li.append(a, st);
    ul.appendChild(li);
  }
}

// ---------- 시작 ----------
async function main() {
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const store = await chrome.storage.local.get(["token", "base", "dest", "tree", "queue", "recent"]);
  const base = store.base || DEFAULT_BASE;

  $("btn-connect").onclick = () => chrome.tabs.create({ url: `${base}/extension/connect` });
  $("btn-token").onclick = async () => {
    const v = $("in-token").value.trim();
    if (!v.startsWith("rb_")) return;
    await chrome.storage.local.set({ token: v, base });
    location.reload();
  };
  if (!store.token) return show("v-connect");

  show("v-main");
  dest = store.dest || null;
  tree = store.tree || null;
  renderPage();
  renderDest();
  renderQueue(store.queue);
  renderRecent(store.recent, base);

  // 저장 위치 목록은 캐시로 먼저 그리고 새로 받아 갱신
  send({ type: "tree" }).then(async (t) => {
    if (t?.error) {
      setMsg(t.error, true);
      if (/연결/.test(t.error)) show("v-connect");
      return;
    }
    tree = t;
    const all = destinations();
    if (!all.some((d) => d.projectId === dest?.projectId && (d.folderId ?? null) === (dest?.folderId ?? null)) && all[0]) {
      dest = { workspaceId: all[0].workspaceId, projectId: all[0].projectId, folderId: null };
      await chrome.storage.local.set({ dest });
    }
    await chrome.storage.local.set({ tree });
    renderDest();
    $("who").textContent = t.user ? `${t.user.name || t.user.email}(으)로 연결돼 있어요.` : "";
  });

  if (page) renderBulk(false);

  $("btn-dest").onclick = () => {
    const p = $("picker");
    p.classList.toggle("hidden");
    if (!p.classList.contains("hidden")) {
      renderPicker();
      $("in-filter").value = "";
      $("in-filter").focus();
    }
  };
  $("in-filter").oninput = (e) => renderPicker(e.target.value);
  $("btn-note").onclick = () => {
    $("in-note").classList.toggle("hidden");
    $("in-note").focus();
  };

  $("btn-save").onclick = async () => {
    const btn = $("btn-save");
    btn.disabled = true;
    btn.textContent = "저장하는 중";
    setMsg("");
    const r = await send({
      type: "save",
      url: tab.url,
      note: $("in-note").value,
      screenshot: $("c-shot").checked,
      windowId: tab.windowId,
      transcribe: $("c-tr").checked,
      dest,
    });
    btn.disabled = false;
    if (r?.error) {
      btn.textContent = "보관함에 저장";
      return setMsg(r.error, true);
    }
    btn.textContent = r.existed ? "이미 있어요" : "저장했어요";
    const p = r.post;
    setMsg(r.existed ? "이 프로젝트에 이미 있는 레퍼런스예요." : `${p.title}`, false, { href: `${base}/w/${p.workspace_id}/p/${p.project_id}${p.folder_id ? `/${p.folder_id}` : ""}`, text: "보기" });
    $("in-note").value = "";
    renderRecent((await chrome.storage.local.get("recent")).recent, base);
    setTimeout(() => (btn.textContent = "보관함에 저장"), 2400);
  };

  $("btn-collect").onclick = async () => {
    const b = $("btn-collect");
    b.disabled = true;
    b.textContent = "모으는 중";
    $("bulk").classList.remove("hidden");
    $("bulk-sub").textContent = "페이지를 끝까지 내리며 모으고 있어요";
    await renderBulk(true);
    b.disabled = false;
  };
  $("btn-import").onclick = async () => {
    if (!collected?.length || !dest) return;
    await send({ type: "enqueue", urls: collected, dest, transcribe: true });
    $("btn-import").classList.add("hidden");
    $("bulk-sub").textContent = "보관함으로 보내는 중이에요. 팝업을 닫아도 계속돼요.";
  };

  $("btn-settings").onclick = () => show("v-settings");
  $("btn-back").onclick = () => show("v-main");
  $("btn-open").onclick = () => chrome.tabs.create({ url: base });
  $("btn-logout").onclick = async () => {
    await chrome.storage.local.remove(["token", "tree", "dest", "recent"]);
    show("v-connect");
  };

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === "collect-progress") $("bulk-sub").textContent = `모으는 중 · ${msg.count}개`;
  });
  chrome.storage.onChanged.addListener((ch) => {
    if (ch.queue) renderQueue(ch.queue.newValue);
    if (ch.recent) renderRecent(ch.recent.newValue, base);
  });
}

main();
