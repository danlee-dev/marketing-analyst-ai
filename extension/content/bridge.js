// 레퍼런스 보관함 사이트 ↔ 확장 연결. 사이트의 /extension/connect 페이지가 만든 토큰을 받아 확장에 저장한다.
// 같은 창의 같은 출처 메시지만 받는다.
(() => {
  const version = chrome.runtime.getManifest().version;
  const announce = () => window.postMessage({ type: "RB_EXT_PRESENT", version }, location.origin);
  window.addEventListener("message", (e) => {
    if (e.source !== window || e.origin !== location.origin) return;
    const d = e.data;
    if (d?.type === "RB_EXT_PING") announce();
    if (d?.type === "RB_EXT_TOKEN" && typeof d.token === "string" && d.token.startsWith("rb_")) {
      chrome.runtime.sendMessage({ type: "set-token", token: d.token }, (r) => {
        window.postMessage({ type: r?.ok ? "RB_EXT_CONNECTED" : "RB_EXT_FAILED" }, location.origin);
      });
    }
  });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", announce, { once: true });
  else announce();
})();
