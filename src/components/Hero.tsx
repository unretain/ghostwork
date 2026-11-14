import { useLayoutEffect, useRef, type MouseEvent } from "react";
import { HERO, LINKS } from "../content";
import { TOGGLE_EVENT } from "./HeroBackground";
import { MintIcon } from "./icons";
import { Reveal, RevealGroup } from "./Reveal";

// ≥901px: binary-search the font size so the one-line headline exactly fills the width.
function useFitHeadline() {
  const h1Ref = useRef<HTMLHeadingElement>(null);
  const spanRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const h1 = h1Ref.current!;
    const span = spanRef.current!;
    const mq = window.matchMedia("(min-width: 901px)");
    let unmounted = false;

    const fit = () => {
      const avail = h1.clientWidth;
      if (avail <= 0) return;
      let lo = 16,
        hi = Math.min(200, avail);
      for (let i = 0; i < 24; i++) {
        const mid = (lo + hi) / 2;
        h1.style.fontSize = `${mid}px`;
        if (span.offsetWidth <= avail) lo = mid;
        else hi = mid;
      }
      h1.style.fontSize = `${lo}px`;
    };
    const run = () => (mq.matches ? fit() : (h1.style.fontSize = ""));

    run();
    const ro = new ResizeObserver(run);
    ro.observe(h1);
    mq.addEventListener("change", run);
    document.fonts.ready.then(() => {
      if (!unmounted) run();
    });
    return () => {
      unmounted = true;
      ro.disconnect();
      mq.removeEventListener("change", run);
      h1.style.fontSize = "";
    };
  }, []);

  return { h1Ref, spanRef };
}

// Clicking empty hero space pauses/resumes the background.
function onHeroClick(e: MouseEvent) {
  const target = e.target;
  if (!(target instanceof Element)) return;
  if (target.closest("a, button, input, textarea, select, [role='button'], h1, h2, h3, h4, h5, h6, p, span, label"))
    return;
  const sel = window.getSelection();
  if (sel && !sel.isCollapsed) return;
  window.dispatchEvent(new Event(TOGGLE_EVENT));
}

export function Hero() {
  const { h1Ref, spanRef } = useFitHeadline();

  return (
    <header id="hero" className="hero" onClick={onHeroClick}>
      <div className="container hero__container">
        <RevealGroup rootMargin="0px">
          <div className="hero__stack">
            <Reveal order={0} style={{ width: "100%" }}>
              <h1 ref={h1Ref} className="hero__title">
                <span ref={spanRef}>{HERO.headline.toUpperCase()}</span>
              </h1>
            </Reveal>
            <Reveal order={1} style={{ width: "100%" }}>
              <div className="hero__row">
                <p className="hero__body">
                  <span style={{ fontWeight: 600 }}>{HERO.bodyLead}</span> {HERO.body}
                </p>
                <div className="hero__ctas">
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
              </div>
            </Reveal>
          </div>
        </RevealGroup>
      </div>
    </header>
  );
}
