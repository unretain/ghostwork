import { useEffect, useMemo, useRef, type CSSProperties } from "react";

type Dot = { x: number; y: number; phase: number; duration: number; stutter: boolean };

const R = 66;
const C = 66;
const PITCH = 2.7;

// Orthographic wireframe globe sampled as dots: rim, meridians every 30°,
// a doubled equator and parallels at ±20° / ±45°. Dots are bucketed into
// spatial clusters that blink together.
function buildDots(): Dot[] {
  const pts: { x: number; y: number }[] = [];
  const addCurve = (fn: (t: number) => [number, number], steps = 400) => {
    let prev: [number, number] | null = null;
    let acc = PITCH;
    for (let i = 0; i <= steps; i++) {
      const p = fn(i / steps);
      if (prev) acc += Math.hypot(p[0] - prev[0], p[1] - prev[1]);
      if (acc >= PITCH) {
        pts.push({ x: p[0], y: p[1] });
        acc = 0;
      }
      prev = p;
    }
  };
  const rad = Math.PI / 180;
  // rim
  addCurve((t) => [C + R * Math.cos(t * Math.PI * 2), C + R * Math.sin(t * Math.PI * 2)], 800);
  // meridians
  for (const lon of [-60, -30, 0, 30, 60]) {
    addCurve((t) => {
      const lat = (-90 + 180 * t) * rad;
      return [C + R * Math.sin(lon * rad) * Math.cos(lat), C - R * Math.sin(lat)];
    });
  }
  // parallels (+ doubled equator)
  for (const [lat, off] of [[0, 0], [0, 2.6], [20, 0], [-20, 0], [45, 0], [-45, 0]] as const) {
    const y = C - R * Math.sin(lat * rad) + off;
    const half = R * Math.cos(lat * rad);
    addCurve((t) => [C - half + 2 * half * t, y]);
  }
  // merge near-duplicates
  const kept: { x: number; y: number }[] = [];
  for (const p of pts) if (!kept.some((k) => Math.hypot(k.x - p.x, k.y - p.y) < 0.9)) kept.push(p);

  let s = 4242;
  const rnd = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
  const clusters = new Map<number, { phase: number; duration: number; stutter: boolean }>();
  return kept.map((p) => {
    const key = Math.floor(p.x / 19) + Math.floor(p.y / 19) * 8;
    if (!clusters.has(key))
      clusters.set(key, { phase: rnd() * 7, duration: 2.8 + rnd() * 4.1, stutter: rnd() < 0.45 });
    return { ...p, ...clusters.get(key)! };
  });
}

export function Globe() {
  const dots = useMemo(buildDots, []);
  const ref = useRef<HTMLDivElement>(null);

  // pause when off-screen
  useEffect(() => {
    const el = ref.current!;
    const io = new IntersectionObserver(([e]) => el.classList.toggle("globe-paused", !e.isIntersecting), {
      threshold: 0,
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div className="globe globe-spin" ref={ref} aria-hidden>
      <svg viewBox="0 0 132 132" width="100%" height="100%" fill="none">
        {dots.map((d, i) => (
          <circle
            key={i}
            cx={d.x.toFixed(2)}
            cy={d.y.toFixed(2)}
            r="0.9"
            className={d.stutter ? "globe-dot globe-dot--stutter" : "globe-dot"}
            style={
              {
                "--twinkle-delay": `${d.phase.toFixed(3)}s`,
                "--twinkle-duration": `${d.duration.toFixed(3)}s`,
              } as CSSProperties
            }
          />
        ))}
      </svg>
    </div>
  );
}
