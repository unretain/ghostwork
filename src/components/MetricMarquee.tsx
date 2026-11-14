import { useEffect, useRef, useState } from "react";
import type { MetricGroup } from "../content";

const SPEED = 36; // px per second

function Groups({ groups }: { groups: MetricGroup[] }) {
  return (
    <>
      {groups.map((g) => (
        <div className="mq-group" key={g.title}>
          <div className="mq-group__title">{g.title}</div>
          <div className="mq-group__metrics">
            {g.metrics.map((m) => (
              <div className="metric" key={m.label}>
                <div className="metric__label">
                  {m.attributed && <span className="metric__dot" />}
                  {m.label}
                </div>
                <div className="metric__value" style={m.attributed ? { paddingRight: 28 } : undefined}>
                  {m.value}
                </div>
                {m.attributed && (
                  <span className="metric__badge" aria-hidden>
                    <svg viewBox="0 0 22 22" width="22" height="22">
                      <circle cx="11" cy="11" r="10.5" fill="oklch(0.78 0.18 145 / 0.14)" stroke="oklch(0.78 0.18 145 / 0.5)" />
                      <path d="M7 11.5l2.6 2.6L15 8.6" fill="none" stroke="oklch(0.78 0.18 145)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

export function MetricMarquee({ groups }: { groups: MetricGroup[] }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const setRef = useRef<HTMLDivElement>(null);
  const [animate] = useState(() => !window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  useEffect(() => {
    if (!animate) return;
    let x = 0;
    let last = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      x += SPEED * dt;
      const loop = (setRef.current?.offsetWidth ?? 0) + 48;
      if (loop > 48 && x >= loop) x -= loop;
      if (trackRef.current) trackRef.current.style.transform = `translate3d(${-x}px,0,0)`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [animate]);

  return (
    <div className="mq" aria-label="Agent metrics">
      <div className="mq__track" ref={trackRef} style={animate ? { willChange: "transform" } : undefined}>
        <div className="mq__set" ref={setRef}>
          <Groups groups={groups} />
        </div>
        {animate && (
          <div className="mq__set" aria-hidden>
            <Groups groups={groups} />
          </div>
        )}
      </div>
    </div>
  );
}
