import { useEffect, useRef } from "react";

// Static ASCII texture used as a faint card background (stands in for a photo).
export function CardTexture({
  hue = 30,
  seed = 1,
  className = "",
}: {
  hue?: number;
  seed?: number;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const draw = () => {
      const { width, height } = canvas.getBoundingClientRect();
      if (!width || !height) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      const ctx = canvas.getContext("2d")!;
      ctx.scale(dpr, dpr);
      ctx.font = '500 11px "IBM Plex Mono", monospace';
      ctx.textBaseline = "top";
      const ramp = " .,:-=+*o#%@";
      let s = seed * 9301 + 49297;
      const rnd = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
      const blobs = Array.from({ length: 5 }, () => ({
        x: rnd() * width,
        y: rnd() * height,
        r: 80 + rnd() * 180,
      }));
      for (let y = 0; y < height; y += 12) {
        for (let x = 0; x < width; x += 7) {
          let v = 0;
          for (const b of blobs) {
            const d = Math.hypot(x - b.x, y - b.y) / b.r;
            v += Math.max(0, 1 - d);
          }
          v = Math.min(1, v * 0.8 + rnd() * 0.15);
          const ch = ramp[Math.floor(v * (ramp.length - 1))];
          if (ch === " ") continue;
          ctx.fillStyle = `hsl(${hue + v * 40} 80% ${35 + v * 50}%)`;
          ctx.fillText(ch, x, y);
        }
      }
    };
    draw();
    document.fonts.ready.then(draw);
    const ro = new ResizeObserver(draw);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [hue, seed]);

  return <canvas ref={ref} className={`card-texture ${className}`.trim()} aria-hidden />;
}
