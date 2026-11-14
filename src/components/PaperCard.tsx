import { useLayoutEffect, useRef } from "react";
import type { Quote } from "../content";

// ≥901px: largest integer size in [18, 26] where the quote fits its box. Below: 20px.
function useFitQuote() {
  const boxRef = useRef<HTMLDivElement>(null);
  const pRef = useRef<HTMLParagraphElement>(null);

  useLayoutEffect(() => {
    const box = boxRef.current!;
    const p = pRef.current!;
    const mq = window.matchMedia("(min-width: 901px)");
    let alive = true;
    const run = () => {
      if (!mq.matches) {
        p.style.fontSize = "20px";
        return;
      }
      const cs = getComputedStyle(box);
      const inner = box.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      let best = 18;
      let lo = 18,
        hi = 26;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        p.style.fontSize = `${mid}px`;
        if (p.scrollHeight <= inner + 1) {
          best = mid;
          lo = mid + 1;
        } else hi = mid - 1;
      }
      p.style.fontSize = `${best}px`;
    };
    run();
    const ro = new ResizeObserver(run);
    ro.observe(box);
    mq.addEventListener("change", run);
    document.fonts.ready.then(() => alive && run());
    return () => {
      alive = false;
      ro.disconnect();
      mq.removeEventListener("change", run);
    };
  }, []);

  return { boxRef, pRef };
}

export function PaperCard({
  q,
  linked = false,
  active = true,
}: {
  q: Quote;
  linked?: boolean;
  active?: boolean;
}) {
  const { boxRef, pRef } = useFitQuote();
  return (
    <article className="paper">
      <span className="paper__logo">NEAR HACKATHON</span>
      <div className="paper__quote" ref={boxRef}>
        <p ref={pRef}>
          <span aria-hidden className="paper__marks">
            “ ”
          </span>
          <span style={{ display: "block" }}>{q.quote}</span>
        </p>
      </div>
      <div className="paper__foot">
        <p className="paper__attr">{q.attribution}</p>
        {linked && q.href ? (
          <a
            className="paper__role"
            href={q.href}
            target="_blank"
            rel="noopener noreferrer"
            tabIndex={active ? 0 : -1}
            aria-label={`Read “${q.role}” on ${q.attribution} (opens in a new tab)`}
          >
            {q.role}
            <svg viewBox="0 0 16 16" width="0.85em" height="0.85em" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M6.5 3.5H3.5v9h9v-3" />
              <path d="M9.5 2.5h4v4" />
              <path d="M13.5 2.5 8 8" />
            </svg>
          </a>
        ) : (
          <p className="paper__role">{q.role}</p>
        )}
      </div>
    </article>
  );
}
