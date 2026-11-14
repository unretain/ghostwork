import { useEffect, useRef, useState } from "react";
import { BRIEF } from "../../content";
import { PaperCard } from "../PaperCard";
import { Reveal, RevealGroup } from "../Reveal";

const COPIES = 3;
const N = BRIEF.length;
const ITEMS = Array.from({ length: N * COPIES }, (_, i) => BRIEF[i % N]);
const REST_TILT = [-1.8, 1.2, -0.6, 0.9, -2, 1.5, -1.1, 0.4];
const AUTOPLAY_MS = 5000;

const lift = (rel: number) => (rel <= 0 ? 0 : rel < 1 ? 0.5 * rel : rel < 2 ? 0.5 + 0.5 * (rel - 1) : 1);
const tilt = (rel: number, rest: number) => (Math.abs(rel) >= 1 ? rest : rest * Math.abs(rel));

function Carousel() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const ulRef = useRef<HTMLUListElement>(null);
  const [active, setActive] = useState(N);
  const activeRef = useRef(N);
  const paused = useRef({ hover: false, focus: false, pointer: false, offscreen: true });

  useEffect(() => {
    const ul = ulRef.current!;
    const wrap = wrapRef.current!;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const lis = () => Array.from(ul.children) as HTMLLIElement[];
    const pad = () => parseFloat(getComputedStyle(ul).scrollPaddingInlineStart) || 0;
    const stride = () => {
      const l = lis();
      return l.length > 1 ? l[1].offsetLeft - l[0].offsetLeft : 472;
    };
    const pos = () => (ul.scrollLeft + pad() - lis()[0].offsetLeft) / stride();

    const apply = () => {
      const p = pos();
      const big = window.matchMedia("(min-width: 901px)").matches ? 144 : 120;
      lis().forEach((li, i) => {
        const rel = i - p;
        const t = reduce ? 0 : tilt(rel, REST_TILT[(i % N) % REST_TILT.length]);
        const y = reduce ? 0 : big * lift(rel);
        li.style.transform = `translateY(${-y}px) rotate(${t}deg)`;
      });
      const a = Math.round(p);
      if (a !== activeRef.current) {
        activeRef.current = a;
        setActive(a);
      }
    };

    // Jump by one full copy when we drift out of the middle copy (seamless).
    const rebase = () => {
      const a = Math.round(pos());
      let shift = 0;
      if (a < N) shift = N;
      else if (a >= 2 * N) shift = -N;
      if (!shift) return;
      ul.style.scrollSnapType = "none";
      ul.style.scrollBehavior = "auto";
      ul.scrollLeft += shift * stride();
      apply();
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          ul.style.scrollSnapType = "";
          ul.style.scrollBehavior = "";
        })
      );
    };

    const goTo = (i: number) => {
      const li = lis()[i];
      if (li) ul.scrollTo({ left: li.offsetLeft - pad(), behavior: reduce ? "auto" : "smooth" });
    };

    // start on the middle copy
    ul.style.scrollBehavior = "auto";
    ul.scrollLeft = lis()[N].offsetLeft - pad();
    ul.style.scrollBehavior = "";
    apply();

    let raf = 0;
    let settleTimer = 0;
    const onScroll = () => {
      if (!raf)
        raf = requestAnimationFrame(() => {
          raf = 0;
          apply();
        });
      clearTimeout(settleTimer);
      settleTimer = window.setTimeout(rebase, 320);
    };
    ul.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", apply);

    const io = new IntersectionObserver(([e]) => (paused.current.offscreen = !e.isIntersecting), {
      threshold: 0.15,
    });
    io.observe(wrap);

    const timer = window.setInterval(() => {
      const p = paused.current;
      if (reduce || p.hover || p.focus || p.pointer || p.offscreen) return;
      goTo(activeRef.current + 1);
    }, AUTOPLAY_MS);

    return () => {
      ul.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", apply);
      io.disconnect();
      clearInterval(timer);
      clearTimeout(settleTimer);
      cancelAnimationFrame(raf);
    };
  }, []);

  const set = (k: keyof typeof paused.current, v: boolean) => () => (paused.current[k] = v);

  return (
    <div
      className="carousel"
      ref={wrapRef}
      onMouseEnter={set("hover", true)}
      onMouseLeave={set("hover", false)}
      onFocusCapture={set("focus", true)}
      onBlurCapture={set("focus", false)}
      onPointerDown={set("pointer", true)}
      onPointerUp={set("pointer", false)}
      onPointerCancel={set("pointer", false)}
    >
      <ul ref={ulRef} aria-label="Lines from the hackathon brief">
        {ITEMS.map((q, i) => (
          <li key={i} aria-hidden={i !== active || undefined}>
            <PaperCard q={q} linked active={i === active} />
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Brief() {
  return (
    <section id="brief" className="brief">
      <RevealGroup>
        <div className="container brief__head">
          <Reveal order={0}>
            <h2 className="display-heading">The Brief</h2>
          </Reveal>
        </div>
        <Reveal order={1}>
          <Carousel />
        </Reveal>
      </RevealGroup>
    </section>
  );
}
