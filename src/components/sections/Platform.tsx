import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type Ref } from "react";
import { getCards, near, type Card } from "../../chain/near";
import { LINKS, PLATFORM } from "../../content";
import { CardTexture } from "../CardTexture";
import { MetricMarquee } from "../MetricMarquee";
import { Reveal, RevealGroup } from "../Reveal";

const { cards, spotlight } = PLATFORM;

function GhostMark({ size = 20, className = "" }: { size?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M4 22V10a8 8 0 0 1 16 0v12l-2.67-2.3L14.67 22 12 19.7 9.33 22l-2.66-2.3L4 22Z" />
    </svg>
  );
}

function NearMark({ size = 20, className = "" }: { size?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" aria-hidden>
      <path d="M5 19V5l14 14V5" />
    </svg>
  );
}

function IconCard({
  title,
  body,
  glyph,
  hue,
  seed,
  corner,
}: {
  title: string;
  body: string;
  glyph: ReactNode;
  hue: number;
  seed: number;
  corner: string;
}) {
  return (
    <article className={`bento-card bento-card--icon ${corner}`}>
      <CardTexture hue={hue} seed={seed} className="bento-card__bg bento-card__bg--faint" />
      <div className="bento-card__overlay bento-card__overlay--down" />
      <div className="bento-card__content">
        <span className="bento-card__glyph">{glyph}</span>
        <div className="bento-card__text">
          <h4 className="card-title">{title}</h4>
          <p className="card-body">{body}</p>
        </div>
      </div>
    </article>
  );
}

function VisualCard({
  title,
  body,
  groups,
  hue,
  seed,
  corner,
}: {
  title: string;
  body: string;
  groups: (typeof cards.wallet)["groups"];
  hue: number;
  seed: number;
  corner: string;
}) {
  return (
    <article className={`bento-card bento-card--visual ${corner}`}>
      <CardTexture hue={hue} seed={seed} className="bento-card__bg" />
      <div className="bento-card__overlay bento-card__overlay--up" />
      <div className="bento-card__visual">
        <div className="bento-card__marquee">
          <MetricMarquee groups={groups} />
        </div>
        <div className="bento-card__foot">
          <h4 className="card-title">{title}</h4>
          <p className="card-body" style={{ paddingTop: 8 }}>
            {body}
          </p>
        </div>
      </div>
    </article>
  );
}

// Decorative QR-style code: three finder squares plus seeded modules.
function PseudoQR() {
  const N = 25;
  let s = 20261107;
  const rnd = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
  const cells: string[] = [];
  const inFinder = (x: number, y: number) =>
    (x < 8 && y < 8) || (x >= N - 8 && y < 8) || (x < 8 && y >= N - 8);
  const inCenter = (x: number, y: number) => x >= 9 && x <= 15 && y >= 9 && y <= 15;
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++)
      if (!inFinder(x, y) && !inCenter(x, y) && rnd() > 0.52) cells.push(`M${x} ${y}h1v1h-1z`);
  const finder = (x: number, y: number) =>
    `M${x} ${y}h7v7h-7zM${x + 1} ${y + 1}v5h5v-5zM${x + 2} ${y + 2}h3v3h-3z`;
  return (
    <svg viewBox={`0 0 ${N} ${N}`} width="100%" height="100%" shapeRendering="crispEdges" aria-hidden>
      <path d={cells.join("")} fill="#ccc5be" />
      <path d={finder(0, 0) + finder(N - 7, 0) + finder(0, N - 7)} fill="#ccc5be" fillRule="evenodd" />
      <g transform="translate(9.6 9.6) scale(0.24)" fill="#ccc5be">
        <path d="M4 22V10a8 8 0 0 1 16 0v12l-2.67-2.3L14.67 22 12 19.7 9.33 22l-2.66-2.3L4 22Z" />
      </g>
    </svg>
  );
}

type Cert = { name: string; sub: string; rows: { label: string; value: string; mono?: boolean }[] };

// The diagram shows a real card: whichever one on the contract has done the most jobs.
function useFeaturedCard() {
  const [card, setCard] = useState<Card | null>(null);
  useEffect(() => {
    getCards()
      .then((cards) => setCard([...cards].sort((a, b) => Number(b.jobs_done) - Number(a.jobs_done))[0] ?? null))
      .catch(() => {});
  }, []);
  return card;
}

function certFor(card: Card | null): Cert {
  if (!card) {
    return { name: "No cards yet", sub: "Mint the first one", rows: ["CARD", "PRICE", "RECORD", "SKILL"].map((label) => ({ label, value: "—" })) };
  }
  return {
    name: card.title ?? `Agent #${card.token_id}`,
    sub: card.skill,
    rows: [
      { label: "CARD", value: `#${card.token_id.padStart(4, "0")} · ${card.traits.color}` },
      { label: "PRICE", value: `${near(card.price)} NEAR per job` },
      { label: "RECORD", value: `${card.jobs_done} jobs · ${near(card.earned, 2)} NEAR` },
      { label: "SKILL", value: card.prompt_hash ? `${card.prompt_hash.slice(0, 10)}…${card.prompt_hash.slice(-10)}` : "not sealed", mono: true },
    ],
  };
}

function Certificate({ innerRef, cert: c }: { innerRef: Ref<HTMLDivElement>; cert: Cert }) {
  return (
    <div className="cert" ref={innerRef}>
      <div className="cert__main">
        <div className="cert__head">
          <div className="cert__title">{c.name}</div>
          <div className="cert__sub">{c.sub}</div>
        </div>
        <div className="cert__rows">
          {c.rows.map((r) => (
            <div className="cert__row" key={r.label}>
              <span className="cert__label">{r.label}</span>
              <span className={r.mono ? "cert__value cert__value--mono" : "cert__value"}>{r.value}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="cert__stub">
        <div className="cert__stub-mark">
          <GhostMark size={20} className="glow-mark" />
        </div>
        <div className="cert__qr">
          <PseudoQR />
        </div>
      </div>
    </div>
  );
}

function connectorPath(sx: number, sy: number, ex: number, ey: number) {
  const dx = Math.max(ex - sx, 24);
  const dy = ey - sy;
  const mx = sx + dx * 0.5;
  if (Math.abs(dy) < 2) return `M ${sx} ${sy} L ${ex} ${ey}`;
  const r = Math.min(20, Math.abs(dy) / 2, dx / 2);
  const s = Math.sign(dy);
  return `M ${sx} ${sy} L ${mx - r} ${sy} Q ${mx} ${sy} ${mx} ${sy + s * r} L ${mx} ${ey - s * r} Q ${mx} ${ey} ${mx + r} ${ey} L ${ex} ${ey}`;
}

function Spotlight() {
  const diagramRef = useRef<HTMLDivElement>(null);
  const certRef = useRef<HTMLDivElement>(null);
  const ruleRefs = useRef<(HTMLElement | null)[]>([]);
  const [paths, setPaths] = useState<string[]>([]);
  const featured = useFeaturedCard();
  const rules = spotlight.rules.map((r, i) =>
    i === 0
      ? {
          ...r,
          value: featured ? `${featured.title ?? "Agent"} • #${featured.token_id.padStart(4, "0")}` : "No cards yet",
          secondary: featured?.path ?? "",
        }
      : r,
  );

  useLayoutEffect(() => {
    const measure = () => {
      const box = diagramRef.current;
      const cert = certRef.current;
      if (!box || !cert || window.innerWidth < 700) {
        setPaths([]);
        return;
      }
      const b = box.getBoundingClientRect();
      const t = cert.getBoundingClientRect();
      const n = ruleRefs.current.length;
      setPaths(
        ruleRefs.current.map((el, i) => {
          if (!el) return "";
          const r = el.getBoundingClientRect();
          return connectorPath(
            r.right - b.left,
            r.top + r.height / 2 - b.top,
            t.left - b.left,
            t.top + t.height / 2 - b.top + (i - (n - 1) / 2) * 28
          );
        })
      );
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (diagramRef.current) ro.observe(diagramRef.current);
    if (certRef.current) ro.observe(certRef.current);
    ruleRefs.current.forEach((el) => el && ro.observe(el));
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  return (
    <article className="spotlight" aria-labelledby="spotlight-heading">
      <div className="spotlight__intro">
        <h3 id="spotlight-heading" className="eyebrow-prominent" style={{ paddingBottom: 12 }}>
          {spotlight.eyebrow}
        </h3>
        <NearMark size={40} className="spotlight__logo glow-mark" />
        <p className="display-heading spotlight__title">
          {spotlight.title}
          <br />
          {spotlight.title2}
        </p>
        <p className="section-lead" style={{ textWrap: "balance" }}>
          {spotlight.body}
        </p>
        <a className="spotlight__link" href={LINKS.docs}>
          {spotlight.link}
        </a>
      </div>

      <div className="diagram" ref={diagramRef}>
        <div className="diagram__grid">
          <div className="diagram-card diagram-card--left">
            <CardTexture hue={190} seed={3} className="diagram-card__bg" />
            <div className="bento-card__overlay bento-card__overlay--up" />
            <div className="rules">
              {rules.map((r, i) => (
                <article
                  className="rule"
                  key={r.label}
                  ref={(el) => {
                    ruleRefs.current[i] = el;
                  }}
                >
                  {r.mark === "ghost" ? (
                    <GhostMark size={20} className="rule__mark" />
                  ) : (
                    <NearMark size={20} className="rule__mark glow-mark" />
                  )}
                  <div className="rule__text">
                    <p className="rule__label">{r.label}</p>
                    <div className="rule__row">
                      <p className="rule__value">
                        {r.value}
                        {r.suffix && <span style={{ opacity: 0.65 }}> {r.suffix}</span>}
                      </p>
                      {r.secondary && <p className="rule__secondary">{r.secondary}</p>}
                    </div>
                  </div>
                </article>
              ))}
            </div>
            <div className="diagram-card__foot">
              <h4 className="card-title">{spotlight.leftTitle}</h4>
              <p className="card-body">{spotlight.leftBody}</p>
            </div>
          </div>

          <span className="diagram__mobile-connector" aria-hidden />

          <div className="diagram-card diagram-card--right">
            <CardTexture hue={260} seed={5} className="diagram-card__bg" />
            <div className="bento-card__overlay bento-card__overlay--up" />
            <div className="cert-holder">
              <Certificate innerRef={certRef} cert={certFor(featured)} />
            </div>
            <div className="diagram-card__foot">
              <h4 className="card-title">{spotlight.rightTitle}</h4>
              <p className="card-body">{spotlight.rightBody}</p>
            </div>
          </div>
        </div>

        {paths.length > 0 && (
          <svg className="diagram__connectors" aria-hidden>
            <defs>
              <linearGradient id="connector-gradient" x1="0%" x2="100%" y1="0%" y2="0%">
                <stop offset="0%" stopColor="oklch(0.72 0.14 195)" stopOpacity="0.15" />
                <stop offset="45%" stopColor="oklch(0.78 0.16 195)" stopOpacity="0.95" />
                <stop offset="100%" stopColor="oklch(0.82 0.14 200)" stopOpacity="0.35" />
              </linearGradient>
              <filter id="connector-glow" x="-40%" y="-40%" width="180%" height="180%">
                <feGaussianBlur stdDeviation="4" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            {paths.map((d, i) => (
              <path
                key={i}
                d={d}
                fill="none"
                stroke="url(#connector-gradient)"
                strokeWidth="2"
                strokeLinecap="square"
                strokeLinejoin="miter"
                filter="url(#connector-glow)"
              />
            ))}
          </svg>
        )}
      </div>
    </article>
  );
}

export function Platform() {
  return (
    <section id="platform" className="platform">
      <RevealGroup>
        <div className="container platform__col">
          <Reveal order={0} className="platform__head">
            <h2 className="display-heading">{PLATFORM.title}</h2>
            <p className="platform__sub">{PLATFORM.sub}</p>
          </Reveal>

          <div className="bento">
            <div className="bento__row bento__row--a">
              <Reveal order={0} style={{ height: "100%" }}>
                <VisualCard {...cards.wallet} hue={200} seed={11} corner="corner-tl" />
              </Reveal>
              <Reveal order={1} style={{ height: "100%" }}>
                <IconCard {...cards.brain} glyph={<GhostMark size={28} />} hue={30} seed={4} corner="corner-tr" />
              </Reveal>
            </div>
            <div className="bento__row bento__row--b">
              <Reveal order={2} style={{ height: "100%" }}>
                <IconCard {...cards.proof} glyph="◎" hue={140} seed={8} corner="corner-bl" />
              </Reveal>
              <Reveal order={3} style={{ height: "100%" }}>
                <VisualCard {...cards.market} hue={300} seed={15} corner="corner-br" />
              </Reveal>
            </div>
          </div>
        </div>
      </RevealGroup>

      <RevealGroup>
        <div className="container">
          <Reveal order={0}>
            <Spotlight />
          </Reveal>
        </div>
      </RevealGroup>
    </section>
  );
}
