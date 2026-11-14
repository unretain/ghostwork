import { useEffect, useRef } from "react";
import { paintMatrix, seeded } from "../lib/matrix";

// Hero background: a photo shown on an LED matrix, with slow drift,
// moving stage light and a faint LED shimmer.
const BG = "#131009";
const CELL_W = 6; // css px
const CELL_H = 7;
const FPS = 24;

export const TOGGLE_EVENT = "ghostwork:toggle-hero-bg";

const LIGHTS = [
  { c: "120,170,255", x: 0.3, y: 0.18, r: 0.42, sx: 0.11, sy: 0.07, p: 0.0 },
  { c: "255,120,200", x: 0.62, y: 0.3, r: 0.36, sx: 0.09, sy: 0.05, p: 2.1 },
  { c: "255,220,150", x: 0.5, y: 0.12, r: 0.3, sx: 0.16, sy: 0.04, p: 4.0 },
];

export function HeroBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const host = canvas.parentElement!;
    const ctx = canvas.getContext("2d")!;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const scene = document.createElement("canvas");
    const sctx = scene.getContext("2d")!;
    const noise = document.createElement("canvas");

    const photo = new Image();
    photo.src = `${import.meta.env.BASE_URL}hero-statues.jpg`;

    let cols = 0,
      rows = 0,
      cw = 0,
      ch = 0,
      gap = 1;
    let raf = 0,
      last = 0,
      paused = false,
      shown = false;
    const start = performance.now();

    const buildNoise = () => {
      noise.width = cols;
      noise.height = rows;
      const n = noise.getContext("2d")!;
      const img = n.createImageData(cols, rows);
      const rnd = seeded(99);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = rnd() < 0.5 ? 255 : 0;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
        img.data[i + 3] = Math.floor(rnd() * 46);
      }
      n.putImageData(img, 0, 0);
    };

    const resize = () => {
      const rect = host.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      cw = Math.round(CELL_W * dpr);
      ch = Math.round(CELL_H * dpr);
      gap = Math.max(1, Math.round(dpr));
      cols = Math.max(1, Math.ceil((rect.width * dpr) / cw));
      rows = Math.max(1, Math.ceil((rect.height * dpr) / ch));
      canvas.width = cols * cw;
      canvas.height = rows * ch;
      // exact device-pixel mapping keeps the 1px gaps crisp (the host clips the overhang)
      canvas.style.width = `${(cols * cw) / dpr}px`;
      canvas.style.height = `${(rows * ch) / dpr}px`;
      scene.width = cols;
      scene.height = rows;
      buildNoise();
      render((performance.now() - start) / 1000);
    };

    const render = (t: number) => {
      if (!cols || !photo.complete || !photo.naturalWidth) return;
      const W = cols,
        H = rows;
      sctx.globalCompositeOperation = "source-over";
      sctx.globalAlpha = 1;
      sctx.fillStyle = BG;
      sctx.fillRect(0, 0, W, H);

      // The picture sits in the upper part of the hero, like a screen behind the headline.
      // Cells are not square, so correct the aspect ratio when fitting the photo.
      const cellAspect = cw / ch;
      const boxH = H * 0.84;
      // Keep the photo in proportion: on narrow screens its sides are cropped, never squeezed.
      const boxW = (boxH * (photo.naturalWidth / photo.naturalHeight)) / cellAspect;
      const zoom = 1.05 + 0.03 * Math.sin(t / 9);
      const dw = boxW * zoom,
        dh = boxH * zoom;
      const dx = (W - dw) / 2 + W * 0.008 * Math.sin(t / 13);
      const dy = (boxH - dh) / 2;
      sctx.imageSmoothingEnabled = true;
      sctx.imageSmoothingQuality = "high";
      // grade the photo cooler and darker so it sits in the warm-black page
      sctx.filter = "saturate(0.95) brightness(1.3) contrast(1.08)";
      sctx.drawImage(photo, dx, dy, dw, dh);
      sctx.filter = "none";
      sctx.globalCompositeOperation = "soft-light";
      const grade = sctx.createLinearGradient(0, 0, 0, boxH);
      grade.addColorStop(0, "rgba(70,120,255,0.35)");
      grade.addColorStop(0.55, "rgba(120,110,200,0.1)");
      grade.addColorStop(1, "rgba(0,0,0,0.35)");
      sctx.fillStyle = grade;
      sctx.fillRect(0, 0, W, boxH);

      // moving stage light
      sctx.globalCompositeOperation = "lighter";
      for (const l of LIGHTS) {
        const x = W * (l.x + l.sx * Math.sin(t * 0.21 + l.p));
        const y = H * (l.y + l.sy * Math.cos(t * 0.17 + l.p));
        const r = Math.max(W, H) * l.r * 0.5;
        const a = 0.07 + 0.05 * Math.sin(t * 0.6 + l.p * 1.7);
        const g = sctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, `rgba(${l.c},${a.toFixed(3)})`);
        g.addColorStop(1, "rgba(0,0,0,0)");
        sctx.fillStyle = g;
        sctx.fillRect(x - r, y - r, r * 2, r * 2);
      }

      // LED shimmer: a fixed noise field that jumps a few times a second
      sctx.globalCompositeOperation = "overlay";
      const step = Math.floor(t * 7);
      const ox = (step * 37) % W,
        oy = (step * 23) % H;
      for (const [x, y] of [
        [-ox, -oy],
        [W - ox, -oy],
        [-ox, H - oy],
        [W - ox, H - oy],
      ])
        sctx.drawImage(noise, x, y);

      // oval spotlight: fade the picture into the page on every side but the top
      sctx.globalCompositeOperation = "source-over";
      const cx = W / 2,
        cy = H * 0.34;
      const rx = Math.min(boxW * 0.5, Math.max(W * 0.46, Math.min(W * 0.56, H * 0.55))),
        ry = H * 0.58;
      sctx.save();
      sctx.translate(cx, cy);
      sctx.scale(rx, ry);
      const v = sctx.createRadialGradient(0, 0, 0.42, 0, 0, 1);
      v.addColorStop(0, "rgba(19,16,9,0)");
      v.addColorStop(0.5, "rgba(19,16,9,0.6)");
      v.addColorStop(0.85, "rgba(19,16,9,0.97)");
      v.addColorStop(1, "rgba(19,16,9,1)");
      sctx.fillStyle = v;
      sctx.fillRect(-W, -H, W * 2, H * 2);
      sctx.restore();

      paintMatrix(ctx, scene, cols, rows, cw, ch, gap, BG);
      if (!shown) {
        shown = true;
        canvas.style.opacity = "1";
      }
    };

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (paused || now - last < 1000 / FPS) return;
      last = now;
      render((now - start) / 1000);
    };

    const onToggle = () => (paused = !paused);
    photo.onload = () => render((performance.now() - start) / 1000);
    canvas.style.transition = "opacity 360ms cubic-bezier(0.2,0,0,1)";
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(host);
    window.addEventListener(TOGGLE_EVENT, onToggle);
    if (!reduce) raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener(TOGGLE_EVENT, onToggle);
    };
  }, []);

  return (
    <div className="hero-bg" aria-hidden>
      <div className="hero-bg__sticky">
        <canvas ref={canvasRef} className="hero-bg__canvas" />
        <div className="hero-bg__fade" />
      </div>
    </div>
  );
}
