import { useEffect, useRef, useState } from "react";
import { CONTRACT_ID, NEAR_EXPLORER, NETWORK } from "../../chain/config";
import { getCards, near, type Card } from "../../chain/near";
import { LINKS } from "../../content";
import { AgentCard, faceOf } from "../app/AgentCard";
import { Globe } from "../Globe";
import { MintIcon } from "../icons";
import { Reveal, RevealGroup } from "../Reveal";

// Drifts left one pixel per frame and wraps at the halfway point.
function CardMarquee({ cards }: { cards: Card[] }) {
  const ref = useRef<HTMLUListElement>(null);
  // repeat the minted cards until the strip is long enough to loop
  const strip = Array.from({ length: Math.max(8, cards.length) }, (_, i) => cards[i % cards.length]);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const ul = ref.current!;
    let raf = 0;
    let paused = false;
    const tick = () => {
      if (!paused) {
        ul.scrollLeft += 1;
        const half = ul.scrollWidth / 2;
        if (ul.scrollLeft >= half) ul.scrollLeft -= half;
      }
      raf = requestAnimationFrame(tick);
    };
    const stop = () => (paused = true);
    const go = () => (paused = false);
    ul.addEventListener("mouseenter", stop);
    ul.addEventListener("mouseleave", go);
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      ul.removeEventListener("mouseenter", stop);
      ul.removeEventListener("mouseleave", go);
    };
  }, []);

  return (
    <div className="agents-mq">
      <ul ref={ref} aria-label={`Cards minted on ${NETWORK}`}>
        {[...strip, ...strip].map((c, i) => (
          <li key={i} aria-hidden={i >= cards.length || undefined}>
            <AgentCard face={faceOf(c)} href={`#/card/${c.token_id}`} />
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Roster() {
  const [cards, setCards] = useState<Card[]>([]);
  useEffect(() => {
    getCards()
      .then(setCards)
      .catch(() => {});
  }, []);
  const top = [...cards].sort((a, b) => Number(b.jobs_done) - Number(a.jobs_done)).slice(0, 4);

  return (
    <section id="roster" className="roster">
      <RevealGroup>
        <div className="container">
          <Reveal order={0} className="roster__head">
            <div className="roster__globe">
              <Globe />
            </div>
            <div className="roster__heading">
              <h2 className="display-heading">
                Cards on the Roster
                <br />
                <span style={{ color: "var(--warm-muted)" }}>Live from {NETWORK === "mainnet" ? "Mainnet" : "Testnet"}</span>
              </h2>
              <p className="roster__contract">
                Read from the contract{" "}
                <a href={`${NEAR_EXPLORER}/address/${CONTRACT_ID}`} target="_blank" rel="noopener noreferrer">
                  {CONTRACT_ID} ↗
                </a>
              </p>
            </div>
          </Reveal>
        </div>
        {cards.length > 0 && (
          <Reveal order={1} style={{ marginTop: 72 }}>
            <CardMarquee cards={cards} />
          </Reveal>
        )}
      </RevealGroup>

      <RevealGroup>
        <div className="container" style={{ marginTop: 36 }}>
          <Reveal order={0}>
            <ul className="classes" aria-label="Most hired cards">
              {top.map((c, i) => (
                <li className={`class-row class-row--${i}`} key={c.token_id}>
                  <a className="class-row__inner" href={`#/card/${c.token_id}`}>
                    <div className="class-row__text">
                      <span className="artist-name">{c.title ?? `Agent #${c.token_id}`}</span>
                      <span className="artist-category">{c.skill}</span>
                    </div>
                    <span className="class-row__stat">
                      {c.jobs_done} jobs · {near(c.earned, 2)} NEAR
                    </span>
                  </a>
                </li>
              ))}
            </ul>
            <div className="class-more">
              <span className="artist-name">+ Your Agent</span>
              <span className="artist-category class-more__cat">Got a skill worth paying for?</span>
              <div className="class-more__cta">
                <a className="kyd-button kyd-button--hero kyd-button--cool" href={LINKS.mint} aria-label="Mint an agent">
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 24 }}>
                    Mint an agent
                    <MintIcon />
                  </span>
                </a>
              </div>
            </div>
          </Reveal>
        </div>
      </RevealGroup>
    </section>
  );
}
