"use client";

import { useEffect, useRef } from "react";

// 배경 점 격자. 몇몇 점이 천천히 밝아졌다 사그라들고, 커서 근처 점이 살짝 밝아진다.
// 색은 --ink 를 읽어 라이트·다크 모두 맞춘다. 동작 줄이기면 정지 화면만 그린다.
const GAP = 24;
const BASE = 0.12;

export function DotField({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d")!;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let w = 0;
    let h = 0;
    let cols = 0;
    let rows = 0;
    let phase: Float32Array = new Float32Array(0);
    let speed: Float32Array = new Float32Array(0);
    let raf = 0;
    let rgb = "22,22,22";
    const mouse = { x: -9999, y: -9999 };

    const readColor = () => {
      const v = getComputedStyle(document.documentElement).getPropertyValue("--ink").trim();
      const m = v.match(/^#([0-9a-f]{6})$/i);
      if (m) rgb = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)).join(",");
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const r = canvas.getBoundingClientRect();
      w = r.width;
      h = r.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cols = Math.ceil(w / GAP) + 1;
      rows = Math.ceil(h / GAP) + 1;
      phase = new Float32Array(cols * rows);
      speed = new Float32Array(cols * rows);
      for (let i = 0; i < phase.length; i++) {
        phase[i] = Math.random() * Math.PI * 2;
        // 대부분은 거의 정지, 일부만 반짝인다
        speed[i] = Math.random() < 0.08 ? 0.4 + Math.random() * 0.8 : 0;
      }
    };

    const draw = (t: number) => {
      ctx.clearRect(0, 0, w, h);
      const sec = t / 1000;
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const i = y * cols + x;
          const px = x * GAP + GAP / 2;
          const py = y * GAP + GAP / 2;
          let a = BASE;
          if (speed[i]) a += Math.max(0, Math.sin(sec * speed[i] + phase[i])) * 0.38;
          const d = Math.hypot(px - mouse.x, py - mouse.y);
          if (d < 140) a += (1 - d / 140) * 0.35;
          ctx.fillStyle = `rgba(${rgb},${Math.min(a, 0.7).toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(px, py, a > 0.3 ? 1.25 : 1, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    };

    const loop = (t: number) => {
      draw(t);
      raf = requestAnimationFrame(loop);
    };

    readColor();
    resize();
    if (reduce) draw(0);
    else raf = requestAnimationFrame(loop);

    const ro = new ResizeObserver(() => {
      resize();
      if (reduce) draw(0);
    });
    ro.observe(canvas);
    const mo = new MutationObserver(() => {
      readColor();
      if (reduce) draw(0);
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      mouse.x = e.clientX - r.left;
      mouse.y = e.clientY - r.top;
    };
    const onLeave = () => {
      mouse.x = mouse.y = -9999;
    };
    const onVis = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden && !reduce) raf = requestAnimationFrame(loop);
    };
    window.addEventListener("pointermove", onMove);
    document.addEventListener("pointerleave", onLeave);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      mo.disconnect();
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  return <canvas ref={ref} aria-hidden className={`pointer-events-none absolute inset-0 size-full ${className}`} />;
}
