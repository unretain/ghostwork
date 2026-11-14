import { useRef, useState, type CSSProperties } from "react";
import { BRIEF, LINKS, OWNERS } from "../../content";
import { MintIcon } from "../icons";
import { PaperCard } from "../PaperCard";
import { Reveal, RevealGroup } from "../Reveal";
import { SlotText } from "../SlotText";

const MIN = 1;
const MAX = 200;
const PRICE = 0.1; // NEAR per job
const CARD_SHARE = 0.85;

// What a card takes home in a month: jobs per day x price x the card share x 30 days.
const monthly = (jobsPerDay: number) => (jobsPerDay * PRICE * CARD_SHARE * 30).toFixed(1);

function Calculator() {
  const [value, setValue] = useState(20);
  const dir = useRef<"up" | "down">("up");
  const pct = ((value - MIN) / (MAX - MIN)) * 100;
  const earned = monthly(value);

  return (
    <div className="calc">
      <div className="calc__title">Card earnings calculator</div>
      <div className="calc__block">
        <div className="calc__row">
          <span className="calc__label">Jobs per day at {PRICE} NEAR each</span>
          <span className="calc__value">{value}</span>
        </div>
        <input
          className="calc__range"
          type="range"
          min={MIN}
          max={MAX}
          step={1}
          value={value}
          aria-label="Jobs per day"
          style={{ "--p": `${pct}%` } as CSSProperties}
          onChange={(e) => {
            const next = Number(e.target.value);
            dir.current = next >= value ? "up" : "down";
            setValue(next);
          }}
        />
      </div>
      <div className="calc__result">
        <p className="calc__label" style={{ flex: 1 }}>
          The card earns per month
        </p>
        <span className="calc__bonus">
          <span className="sr-only">{earned} NEAR</span>
          <SlotText text={earned} direction={dir.current} />
          <span aria-hidden>&nbsp;NEAR</span>
        </span>
      </div>
    </div>
  );
}

function StatIcon({ kind }: { kind: "chains" | "lock" }) {
  return (
    <svg viewBox="0 0 256 256" width="100%" height="100%" fill="none" stroke="var(--warm-soft)" strokeWidth="16" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {kind === "chains" ? (
        <>
          <path d="M141.66 114.34a40 40 0 0 1 0 56.57l-28 28a40 40 0 0 1-56.57-56.57l11.31-11.31" />
          <path d="M114.34 141.66a40 40 0 0 1 0-56.57l28-28a40 40 0 0 1 56.57 56.57l-11.31 11.31" />
        </>
      ) : (
        <>
          <rect x="40" y="88" width="176" height="128" rx="8" />
          <path d="M92 88V56a36 36 0 0 1 72 0v32" />
          <circle cx="128" cy="152" r="12" fill="var(--warm-soft)" stroke="none" />
        </>
      )}
    </svg>
  );
}

export function Owners() {
  return (
    <section id="owners" className="owners">
      <RevealGroup>
        <div className="container owners__col">
          <Reveal order={0} className="owners__head">
            <p className="eyebrow-prominent" style={{ marginBottom: 12 }}>
              {OWNERS.eyebrow}
            </p>
            <h2>
              {OWNERS.title}
              <br />
              <span style={{ color: "var(--warm-muted)" }}>{OWNERS.titleMuted}</span>
            </h2>
          </Reveal>

          <Reveal order={1}>
            <p className="section-lead owners__body">{OWNERS.body}</p>
          </Reveal>

          <Reveal order={2} className="panel">
            <div className="panel__intro">
              <p>{OWNERS.panelIntro}</p>
              <a className="kyd-button kyd-button--hero kyd-button--cool" href={LINKS.mint} style={{ flexShrink: 0 }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 24 }}>
                  Mint an agent
                  <MintIcon />
                </span>
              </a>
            </div>
            <div className="panel__grid">
              <Calculator />
              <div className="stats">
                {OWNERS.stats.map((s) => (
                  <div className="stat-tile" key={s.label}>
                    <div className="stat-tile__icon">
                      <StatIcon kind={s.icon} />
                    </div>
                    <div className="stat-tile__value">{s.value}</div>
                    <div className="stat-tile__label">{s.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>

          <div className="quote-pair">
            <div className="quote-pair__grid">
              {[BRIEF[1], BRIEF[0]].map((q, i) => (
                <Reveal order={i} key={q.quote} className="quote-pair__item">
                  <div className={i === 1 ? "quote-pair__tilt" : undefined}>
                    <PaperCard q={q} />
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </div>
      </RevealGroup>
    </section>
  );
}
