// 인스타그램 플로팅 버튼: 게시물 화면이면 "보관함에 저장", 저장됨·프로필 목록이면 "목록 모두 가져오기".
// 닫힌 shadow DOM + 실제 클릭(isTrusted)만 받아서 페이지 스크립트가 건드리거나 대신 누를 수 없다.
(() => {
  if (window.top !== window || document.getElementById("rb-ext-fab")) return;

  const LOGO = chrome.runtime.getURL("icons/logo.svg");
  const FONT = chrome.runtime.getURL("fonts/PretendardVariable.woff2");
  const isPost = () => /^\/(?:[\w.]+\/)?(?:p|reel|reels|tv)\/[\w-]+/.test(location.pathname);
  const isList = () =>
    /^\/[\w.]+\/saved\//.test(location.pathname) || /^\/[\w.]+\/(reels\/|tagged\/)?$/.test(location.pathname) || /^\/explore\/(tags|locations)\//.test(location.pathname);

  const host = document.createElement("div");
  host.id = "rb-ext-fab";
  host.style.cssText = "position:fixed;right:22px;bottom:22px;z-index:2147483646;display:none;";
  const root = host.attachShadow({ mode: "closed" });
  root.innerHTML = `
<style>
  @font-face { font-family: "RB Pretendard"; src: url("${FONT}") format("woff2"); font-weight: 45 920; font-display: swap; }
  :host { all: initial; }
  .fab { --bg:#161616; --fg:#fff; --sub:rgba(255,255,255,.62);
    display:flex; align-items:center; gap:10px; height:48px; padding:0 6px 0 6px; border:0; border-radius:24px;
    background:var(--bg); color:var(--fg); cursor:pointer; box-shadow:0 12px 36px rgb(0 0 0/.28);
    font:600 14px/1 "RB Pretendard",-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo",sans-serif; letter-spacing:-.01em;
    transition: transform .2s cubic-bezier(.2,0,0,1), padding .35s cubic-bezier(.05,.7,.1,1);
    animation: in .45s cubic-bezier(.05,.7,.1,1) both; }
  @media (prefers-color-scheme: dark) { .fab { --bg:#f2f2ef; --fg:#0c0c0c; --sub:rgba(12,12,12,.6); } }
  .fab:active { transform: scale(.96); }
  .fab:focus-visible { outline: 2px solid #8a8a86; outline-offset: 3px; }
  .mark { width:36px; height:36px; border-radius:12px; background:url("${LOGO}") center/cover; flex:0 0 auto; }
  .label { max-width:0; overflow:hidden; white-space:nowrap; opacity:0;
    transition: max-width .4s cubic-bezier(.05,.7,.1,1), opacity .2s, margin .4s cubic-bezier(.05,.7,.1,1); }
  .sub { color:var(--sub); font-weight:500; margin-left:6px; }
  .fab:hover .label, .fab.open .label { max-width:260px; opacity:1; margin-right:10px; }
  .spin { width:16px; height:16px; border-radius:50%; border:2px solid var(--sub); border-top-color:var(--fg); animation: sp .8s linear infinite; display:none; margin-right:8px; }
  .busy .spin { display:block; }
  @keyframes sp { to { transform: rotate(360deg); } }
  @keyframes in { from { opacity:0; transform: translateY(16px) scale(.92); } }
  @media (prefers-reduced-motion: reduce) { .fab, .label { animation:none; transition:none; } }
</style>
<button class="fab" type="button" aria-label="레퍼런스 보관함">
  <span class="mark"></span><span class="label"><span class="text"></span><span class="sub"></span></span><span class="spin"></span>
</button>`;
  const btn = root.querySelector(".fab");
  const text = root.querySelector(".text");
  const sub = root.querySelector(".sub");
  let mode = null;
  let busy = false;
  let flashTimer = 0;

  function render() {
    const m = isPost() ? "post" : isList() ? "list" : null;
    if (m !== mode) {
      mode = m;
      host.style.display = m ? "block" : "none";
    }
    if (busy) return;
    text.textContent = mode === "post" ? "보관함에 저장" : "목록 모두 가져오기";
    sub.textContent = "";
  }

  function flash(t, s, keepOpen) {
    text.textContent = t;
    sub.textContent = s || "";
    btn.classList.add("open");
    clearTimeout(flashTimer);
    if (!keepOpen) flashTimer = setTimeout(() => (btn.classList.remove("open"), render()), 2600);
  }

  btn.addEventListener("click", (e) => {
    if (!e.isTrusted || busy || !mode) return;
    busy = true;
    btn.classList.add("busy", "open");
    if (mode === "post") {
      flash("저장하는 중", "", true);
      chrome.runtime.sendMessage({ type: "fab-save", url: location.href }, () => {
        busy = false;
        btn.classList.remove("busy");
        flash("요청 보냄", "", false);
      });
    } else {
      flash("끝까지 내리며 모으는 중", "", true);
      chrome.runtime.sendMessage({ type: "fab-collect" }, (r) => {
        busy = false;
        btn.classList.remove("busy");
        if (r?.error) flash("가져오지 못했어요", "", false);
        else flash(r?.found ? `새 게시물 ${r.added}개 가져오는 중` : "게시물을 못 찾았어요", r?.found ? `전체 ${r.found}개` : "", !!r?.added);
      });
    }
  });

  // 모으는 중 개수, 가져오기 진행 상황
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === "collect-progress" && busy) flash("끝까지 내리며 모으는 중", `${msg.count}개`, true);
  });
  chrome.storage.onChanged.addListener((changes) => {
    const q = changes.queue?.newValue;
    if (!q || busy || mode !== "list") return;
    const total = q.items.length;
    const done = q.items.filter((i) => i.status !== "pending" && i.status !== "running").length;
    if (total && done < total) flash("보관함으로 가져오는 중", `${done}/${total}`, true);
    else if (total) flash("가져오기 끝", `${total}개`, false);
  });

  (document.body || document.documentElement).appendChild(host);
  render();
  // 인스타는 SPA 라 주소가 바뀌어도 새로고침되지 않는다
  let last = location.href;
  setInterval(() => {
    if (location.href !== last) {
      last = location.href;
      render();
    }
  }, 700);
})();
