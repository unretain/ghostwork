import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { FOOTER, HERO, LINKS } from "../../content";
import { MintIcon } from "../icons";
import { Reveal, RevealGroup } from "../Reveal";

const FRAMES = 48;
const JITTER = [
  1.7, -2.3, 0.6, -1.4, 2.5, -0.8, 1.9, -2.1, 0.4, -1.7, 2.2, -0.5, 1.3, -2.5, 0.9, -1.9, 2.4, -0.7, 1.5, -2.2,
  0.3, -1.6, 2.1, -0.4, 1.8, -2.4, 0.7, -1.2, 2.3, -0.9, 1.1, -2, 0.5, -1.8, 2.5, -1, 1.6, -2.3, 0.8, -1.5, 2,
  -1.3, 1.4, -2.1, 0.9, -2.4, 1.8, -0.6,
];
const GHOST = "M4 22V10a8 8 0 0 1 16 0v12l-2.67-2.3L14.67 22 12 19.7 9.33 22l-2.66-2.3L4 22Z";

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current!;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

// Progress 0→1 over 1.75s when the footer appears, then tied to scroll distance
// so scrolling away rewinds the sequence and scrolling back replays it.
function useLoopFrame(footerRef: RefObject<HTMLElement>) {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const footer = footerRef.current!;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setFrame(FRAMES - 1);
      return;
    }
    let bag: number[] = [];
    let lastPick = -1;
    let holding = false;
    const pickEnd = () => {
      if (!bag.length) {
        bag = Array.from({ length: 8 }, (_, i) => FRAMES - 8 + i);
        for (let i = bag.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [bag[i], bag[j]] = [bag[j], bag[i]];
        }
        if (bag[bag.length - 1] === lastPick) bag.unshift(bag.pop()!);
      }
      lastPick = bag.pop()!;
      return lastPick;
    };
    const show = (p: number) => {
      if (p >= 0.999) {
        if (!holding) {
          holding = true;
          setFrame(pickEnd());
        }
      } else {
        holding = false;
        setFrame(Math.round(p * (FRAMES - 1)));
      }
    };

    let raf = 0;
    let anchor = 0;
    let onScroll: (() => void) | null = null;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      const start = performance.now();
      const ramp = (now: number) => {
        const p = Math.min(1, (now - start) / 1750);
        show(p);
        if (p < 1) raf = requestAnimationFrame(ramp);
        else {
          anchor = window.scrollY;
          let pending = 0;
          onScroll = () => {
            if (pending) return;
            pending = requestAnimationFrame(() => {
              pending = 0;
              const span = Math.max(1, Math.min(window.innerHeight, footer.offsetHeight));
              show(Math.max(0, Math.min(1, 1 - Math.abs(window.scrollY - anchor) / span)));
            });
          };
          window.addEventListener("scroll", onScroll, { passive: true });
          window.addEventListener("resize", onScroll);
        }
      };
      raf = requestAnimationFrame(ramp);
    });
    io.observe(footer);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
      if (onScroll) {
        window.removeEventListener("scroll", onScroll);
        window.removeEventListener("resize", onScroll);
      }
    };
  }, [footerRef]);
  return frame;
}

function Emblem({ footerRef }: { footerRef: RefObject<HTMLElement> }) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const frame = useLoopFrame(footerRef);
  const mobile = typeof window !== "undefined" && window.matchMedia("(max-width: 630px)").matches;
  const shortVp = typeof window !== "undefined" && window.innerHeight <= 901;

  const VW = mobile ? 770 : 772;
  const R = mobile ? 270 : 370;
  const CY = mobile ? 280 : 390;
  const fontMax = mobile ? 40 : shortVp ? 58 : 66;
  const fontPx = 17 + (fontMax - 17) * Math.min(1, W / (mobile ? 770 : 730));
  const markPx = mobile ? 90 + 40 * Math.min(1, W / 770) : 120 + (shortVp ? 30 : 60) * Math.min(1, W / 1160);
  const markGap = mobile ? 22 : 70;
  const markAlign = mobile || !shortVp ? 0.4 : 1;

  const scale = W > 0 ? W / VW : 1;
  const fontU = fontPx / scale;
  const markU = W > 0 ? markPx / scale : markPx;
  const markH = markU * 1.25;
  const markX = (VW - markU) / 2;
  const f = CY - markGap - markH;
  const markY = f + (CY - 0.76 * markH - f) * markAlign;
  const minY = Math.max(0, CY - R - fontU * 0.85);
  const vbH = markY + markH + markGap - minY;

  // frame → reveal the mark bottom-up in 48 stop-motion steps with jitter
  // fully drawn by frame 40; the last 8 frames are resting poses that only differ in jitter
  const reveal = Math.min(1, (frame + 1) / (FRAMES - 8));
  const cx = markX + markU / 2;
  const cy = markY + markH / 2;

  return (
    <div className="emblem" ref={ref}>
      <svg viewBox={`0 ${minY} ${VW} ${vbH}`} width="100%" preserveAspectRatio="xMidYMid meet" style={{ overflow: "visible", height: "auto" }} aria-hidden>
        <defs>
          <path id="footer-arc" d={`M ${VW / 2 - R} ${CY} A ${R} ${R} 0 0 1 ${VW / 2 + R} ${CY}`} />
          <clipPath id="mark-reveal">
            <rect x={markX - markU} y={markY + markH * (1 - reveal)} width={markU * 3} height={markH * reveal + 1} />
          </clipPath>
        </defs>
        <text
          fill="var(--warm-display)"
          style={{ fontFamily: '"Cossette Titre"', fontWeight: 700, letterSpacing: "-0.785px", fontSize: fontU }}
        >
          <textPath href="#footer-arc" startOffset="0" textAnchor="start" textLength={Math.PI * R} lengthAdjust="spacing">
            {FOOTER.tagline}
          </textPath>
        </text>
        <g transform={`rotate(${JITTER[frame]} ${cx} ${cy})`} clipPath="url(#mark-reveal)">
          <g transform={`translate(${markX} ${markY}) scale(${markU / 16} ${markH / 20}) translate(-4 -2)`}>
            <path d={GHOST} fill="var(--warm-display)" />
            <circle cx="9.3" cy="11" r="1.5" fill="var(--page-bg)" />
            <circle cx="14.7" cy="11" r="1.5" fill="var(--page-bg)" />
          </g>
        </g>
      </svg>
      <span className="sr-only">{FOOTER.tagline}</span>
    </div>
  );
}

export function Footer() {
  const footerRef = useRef<HTMLElement>(null);
  const year = new Date().getFullYear();

  return (
    <footer id="mint" className="footer" ref={footerRef}>
      <div className="footer__inner">
        <div className="footer__main">
          <div className="container" style={{ position: "relative", zIndex: 1 }}>
            <RevealGroup rootMargin="0px">
              <div className="footer__stack">
                <Reveal order={0} className="footer__emblem">
                  <Emblem footerRef={footerRef} />
                </Reveal>
                <div className="footer__text">
                  <Reveal order={1}>
                    <h2 className="footer__headline">{FOOTER.headline}</h2>
                  </Reveal>
                  <Reveal order={2}>
                    <p className="footer__body">{FOOTER.body}</p>
                  </Reveal>
                  <Reveal order={3}>
                    <div className="hero__ctas footer__ctas">
                      <a className="kyd-button kyd-button--hero kyd-button--cool" href={LINKS.mint}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 24 }}>
                          {HERO.primaryCta}
                          <MintIcon />
                        </span>
                      </a>
                      <a className="kyd-button kyd-button--hero kyd-button--line" href={LINKS.myAgents}>
                        {HERO.secondaryCta}
                      </a>
                    </div>
                  </Reveal>
                </div>
              </div>
            </RevealGroup>
          </div>
        </div>
        <RevealGroup rootMargin="0px" className="footer__legal-wrap">
          <Reveal order={4}>
            <div className="legal">
              <p className="legal__copy">© {year} GHOSTWORK. Built for NEAR HACKATHON.</p>
              <div className="legal__links">
                {[FOOTER.links, FOOTER.legal].map((group, gi) => (
                  <nav key={gi} aria-label={gi === 0 ? "Project" : "Hackathon"}>
                    {group.map((l) => (
                      <a key={l.label} className="chip" href={l.href} target="_blank" rel="noopener noreferrer">
                        {l.label}
                      </a>
                    ))}
                  </nav>
                ))}
              </div>
            </div>
          </Reveal>
        </RevealGroup>
      </div>
    </footer>
  );
}
