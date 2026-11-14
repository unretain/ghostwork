import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { LINKS, NAV_LINKS, SPY_IDS } from "../content";
import { Logo } from "./Logo";
import { MintIcon } from "./icons";

const DESKTOP_MQ = "(min-width: 901px)";

function useMedia(query: string) {
  const [match, setMatch] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatch(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return match;
}

// Active section = last one whose top is at or above 89px.
function useScrollSpy(ids: string[]) {
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    let raf = 0;
    const run = () => {
      raf = 0;
      let current: string | null = null;
      for (const id of ids) {
        const el = document.getElementById(id);
        if (!el) continue;
        if (el.getBoundingClientRect().top > 89) break;
        current = id;
      }
      setActive(current);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(run);
    };
    run();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [ids]);
  return active;
}

// Hero variant while > 50% of #hero is visible, compact pill after.
export function useHeroVisible() {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const hero = document.getElementById("hero");
    if (!hero) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.intersectionRatio > 0.5), {
      threshold: 0.5,
    });
    io.observe(hero);
    return () => io.disconnect();
  }, []);
  return visible;
}

export function Nav({ variant }: { variant: "hero" | "compact" }) {
  const isDesktop = useMedia(DESKTOP_MQ);
  const active = useScrollSpy(SPY_IDS);
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState<number | null>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (isDesktop) setOpen(false);
  }, [isDesktop]);
  useEffect(() => setOpen(false), [variant]);

  // Escape, body scroll lock, focus management.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    menuRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    const toggle = toggleRef.current;
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
      toggle?.focus();
    };
  }, [open]);

  // Menu panel tracks the bar's rect.
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const measure = () => setRect(el.getBoundingClientRect());
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [variant]);

  const items = [...NAV_LINKS];
  const total = items.length + 1;
  const itemStyle = (i: number) => ({ "--d": `${i * 80}ms` }) as CSSProperties;
  const mmStyle = (i: number) =>
    ({ "--din": `${i * 80}ms`, "--dout": `${(total - i - 1) * 30}ms` }) as CSSProperties;

  const menu = (
    <>
      <nav
        id="alternate-nav-menu"
        className="mobile-menu"
        aria-label="Mobile page sections"
        aria-hidden={!open}
        tabIndex={-1}
        ref={menuRef}
        data-open={open}
        style={
          rect
            ? { top: rect.bottom + 8, left: rect.left, width: rect.width }
            : undefined
        }
      >
        <div
          className="mm-links"
          data-hovering={hovered !== null}
          onMouseLeave={() => setHovered(null)}
        >
          {items.map((l, i) => (
            <div className="mm-item" style={mmStyle(i)} key={l.label}>
              <a
                className="mm-link"
                href={l.href}
                aria-current={l.id && active === l.id ? "location" : undefined}
                tabIndex={open ? 0 : -1}
                onMouseEnter={() => setHovered(i)}
                onClick={() => setOpen(false)}
              >
                {l.label}
              </a>
            </div>
          ))}
        </div>
        <div className="mm-item mm-cta" style={mmStyle(items.length)}>
          <div>
            <p>Own an agent</p>
            <a
              className="kyd-button kyd-button--hero kyd-button--cool"
              href={LINKS.mint}
              tabIndex={open ? 0 : -1}
              onClick={() => setOpen(false)}
            >
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                Mint
                <span className="cta-icon">
                  <MintIcon />
                </span>
              </span>
            </a>
          </div>
          <span className="mm-sep" />
          <div>
            <p>Already own one</p>
            <a
              className="kyd-button kyd-button--hero kyd-button--line"
              href={LINKS.myAgents}
              tabIndex={open ? 0 : -1}
              onClick={() => setOpen(false)}
            >
              My agents
            </a>
          </div>
        </div>
      </nav>
    </>
  );

  return (
    <div className="nav-root" data-variant={variant} ref={rootRef}>
      <div className="nav-scrim" data-open={open} onClick={() => setOpen(false)} />
      {createPortal(menu, document.getElementById("root")!)}
      <div className="nav-bar">
        <div className="nav-row">
          <div className="nav-spacer" aria-hidden />
          <a className="nav-logo" href="#" aria-label="GHOSTWORK home">
            <Logo />
          </a>
          <nav className="nav-links" aria-label="Page sections" aria-hidden={!isDesktop}>
            {items.map((l, i) => (
              <div className="nav-item" style={itemStyle(i)} key={l.label}>
                <a
                  className="nav-link"
                  href={l.href}
                  tabIndex={isDesktop ? 0 : -1}
                  aria-current={l.id && active === l.id ? "location" : undefined}
                >
                  {l.label}
                </a>
              </div>
            ))}
            <div className="nav-item" style={itemStyle(items.length)}>
              <a
                className="kyd-button kyd-button--compact kyd-button--frame"
                href={LINKS.myAgents}
                tabIndex={isDesktop ? 0 : -1}
              >
                My Agents
              </a>
            </div>
          </nav>
          <button
            ref={toggleRef}
            className="nav-toggle"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls="alternate-nav-menu"
            aria-hidden={isDesktop}
            tabIndex={isDesktop ? -1 : 0}
            onClick={() => setOpen((o) => !o)}
          >
            <span className="nav-icon">
              <span className="nav-icon__layer" data-shown={!open}>
                <span className="burger">
                  <i />
                  <i />
                  <i />
                </span>
              </span>
              <span className="nav-icon__layer" data-shown={open}>
                <span className="close-x">
                  <i />
                  <i />
                </span>
              </span>
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
