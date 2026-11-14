import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

const RevealCtx = createContext(true);

// Reveals its children once it first intersects the viewport.
export function RevealGroup({
  children,
  rootMargin = "0px 0px -15% 0px",
  className,
  style,
}: {
  children: ReactNode;
  rootMargin?: string;
  className?: string;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setRevealed(true);
      return;
    }
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setRevealed(true);
          io.disconnect();
        }
      },
      { rootMargin, threshold: 0 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [rootMargin]);
  return (
    <RevealCtx.Provider value={revealed}>
      <div ref={ref} className={className} style={style}>
        {children}
      </div>
    </RevealCtx.Provider>
  );
}

// Staggered fade/unblur/rise: delay = min(order*100 + 50, 550)ms.
export function Reveal({
  order = 0,
  children,
  className = "",
  style,
  as: Tag = "div",
}: {
  order?: number;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  as?: "div" | "li" | "span";
}) {
  const revealed = useContext(RevealCtx);
  const [entered, setEntered] = useState(false);
  const delay = Math.min(order * 100 + 50, 550);

  useEffect(() => {
    if (!revealed) return;
    const t = setTimeout(() => setEntered(true), 1100);
    return () => clearTimeout(t);
  }, [revealed]);

  const state = !revealed
    ? "section-reveal-hidden"
    : entered
      ? "section-reveal-entered"
      : "section-reveal-enter";

  return (
    <Tag
      className={`${state} ${className}`.trim()}
      style={
        state === "section-reveal-enter"
          ? ({ ...style, "--reveal-delay": `${delay}ms` } as CSSProperties)
          : style
      }
      onAnimationEnd={(e) => {
        if (e.target === e.currentTarget && e.animationName === "section-reveal-enter")
          setEntered(true);
      }}
    >
      {children}
    </Tag>
  );
}
