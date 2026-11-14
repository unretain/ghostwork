import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { agentStatus, deliverSkill, type AgentStatus } from "../../chain/agent";
import { CONTRACT_ID, MINT_DEPOSIT_YOCTO, MINT_GAS, NEAR_EXPLORER } from "../../chain/config";
import { getCards, getStats, near, PALETTE, previewArt, rating, toYocto, type Card, type Stats } from "../../chain/near";
import { call, useSession } from "../../chain/wallet";
import { commitment, loadSkill, randomHex, saveSkill } from "../../lib/vault";
import { MintIcon } from "../icons";
import { AgentCard, faceOf, type CardFace } from "./AgentCard";
import { ConnectButtons, SessionBar, toast, useBusy } from "./shared";

const EXAMPLES = [
  {
    title: "Wraith",
    skill: "Reviews smart contracts",
    about: "Paste a function. Get the bug before your auditor does.",
    prompt:
      "You are a senior smart contract auditor. Review the code the customer pastes. List concrete vulnerabilities first (reentrancy, access control, unchecked math, oracle and signature issues), each with the exact line and a one-line fix. Then give a severity for each. No general advice, no praise.",
  },
  {
    title: "Mercer",
    skill: "Writes cold emails that get replies",
    about: "Tell it who you're emailing and why. Get three short drafts.",
    prompt:
      "You write cold outreach emails. From the customer's description, write three different emails under 90 words each: one direct, one curious, one with a specific compliment. Plain language, one clear ask, no buzzwords, no exclamation marks. Add a subject line under 6 words for each.",
  },
  {
    title: "Halcyon",
    skill: "Explains legal text in plain English",
    about: "Paste a clause or a contract section. Get what it means for you.",
    prompt:
      "You explain legal text to non-lawyers. For the pasted text: say in two sentences what it means, list what the reader is agreeing to, flag anything unusual or risky, and suggest one question to ask before signing. Say clearly that this is not legal advice.",
  },
];

const NAMES = ["Wraith", "Mercer", "Halcyon", "Vesper", "Orrin", "Kestrel", "Sable", "Mote", "Quill", "Ember", "Lark", "Onyx"];

function MintForm({ minPrice, onMinted }: { minPrice: string; onMinted: () => void }) {
  const [title, setTitle] = useState("");
  const [skill, setSkill] = useState("");
  const [about, setAbout] = useState("");
  const [prompt, setPrompt] = useState("");
  const [knowledge, setKnowledge] = useState("");
  const [price, setPrice] = useState("0.1");
  const [color, setColor] = useState<string>("Tide");
  const [art, setArt] = useState<string | null>(null);
  const { busy, run } = useBusy();

  // the preview is the contract's own rendering of the chosen colour
  useEffect(() => {
    let live = true;
    previewArt(color)
      .then(([media]) => live && setArt(media))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [color]);

  const priceYocto = toYocto(price);
  const problem = !title.trim()
    ? "Give it a name"
    : !skill.trim()
      ? "Say what it does"
      : prompt.trim().length < 20
        ? "Write its private instructions (at least 20 characters)"
        : !priceYocto || BigInt(priceYocto) < BigInt(minPrice)
          ? `Price must be at least ${near(minPrice)} NEAR`
          : null;

  const face: CardFace = {
    title: title.trim(),
    skill: skill.trim(),
    about: about.trim(),
    price: priceYocto ?? "0",
    jobs: 0,
    stars: null,
    ratings: 0,
    media: art,
    color,
  };

  const mint = () =>
    run("mint", async () => {
      // instructions and private knowledge are sealed together as one text
      const text = knowledge.trim() ? `${prompt.trim()}\n\n--- PRIVATE KNOWLEDGE ---\n${knowledge.trim()}` : prompt.trim();
      const salt = randomHex();
      const hash = await commitment(salt, text);
      // kept in this browser until the agent has it, in case the wallet redirects away
      saveSkill(hash, { salt, prompt: text });
      const { result, txHash } = await call<{ token_id: string }>(
        "mint_card",
        { title: title.trim(), skill: skill.trim(), about: about.trim(), price: priceYocto, prompt_hash: hash, color },
        { deposit: MINT_DEPOSIT_YOCTO, gas: MINT_GAS },
      );
      if (result?.token_id) {
        await deliverSkill(result.token_id, salt, text).catch(() => {});
        toast("ok", `${title.trim()} is minted and its skill is sealed`, txHash && `${NEAR_EXPLORER}/txns/${txHash}`);
        onMinted();
        window.location.hash = `#/card/${result.token_id}`;
      } else {
        toast("ok", "Card minted");
        onMinted();
      }
    });

  return (
    <section className="mint" id="mint">
      <div className="mint__form">
        <h2 className="panel-title">Mint an agent card</h2>
        <p className="muted mint__lead">Give it a skill and a price. Anyone can open it and pay it to work. The card keeps 85% of every accepted job.</p>
        <div className="examples">
          <span className="muted">Start from an example:</span>
          {EXAMPLES.map((e) => (
            <button
              key={e.title}
              className="mini-btn"
              onClick={() => {
                setTitle(e.title);
                setSkill(e.skill);
                setAbout(e.about);
                setPrompt(e.prompt);
              }}
            >
              {e.skill}
            </button>
          ))}
        </div>
        <label className="lbl">
          Name
          <span className="inline-form">
            <input className="field" maxLength={32} placeholder="Wraith" value={title} onChange={(e) => setTitle(e.target.value)} />
            <button type="button" className="mini-btn" onClick={() => setTitle(NAMES[(NAMES.indexOf(title) + 1) % NAMES.length])}>
              Suggest a name
            </button>
          </span>
        </label>
        <label className="lbl">
          What it does <span className="muted">(public, one line)</span>
          <input className="field" maxLength={60} placeholder="Reviews smart contracts" value={skill} onChange={(e) => setSkill(e.target.value)} />
        </label>
        <label className="lbl">
          What customers should send <span className="muted">(public)</span>
          <input className="field" maxLength={240} placeholder="Paste a function. Get the bug before your auditor does." value={about} onChange={(e) => setAbout(e.target.value)} />
        </label>
        <label className="lbl">
          Private instructions <span className="muted">(sealed: customers and future owners never see this)</span>
          <textarea
            className="field field--area"
            maxLength={8000}
            rows={5}
            placeholder="How should it do the job? Your method, your checklist, your tone."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
        </label>
        <label className="lbl">
          Private knowledge <span className="muted">(optional, sealed: what it knows that customers can't get elsewhere)</span>
          <textarea
            className="field field--area"
            maxLength={50000}
            rows={3}
            placeholder="Paste your own material: a price list, policies, product docs, research notes."
            value={knowledge}
            onChange={(e) => setKnowledge(e.target.value)}
          />
        </label>
        <div className="lbl">
          Card colour
          <div className="swatches" role="radiogroup" aria-label="Card colour">
            {Object.entries(PALETTE).map(([name, hex]) => (
              <button
                key={name}
                type="button"
                role="radio"
                aria-checked={color === name}
                aria-label={name}
                title={name}
                className="swatch"
                data-active={color === name}
                style={{ background: hex }}
                onClick={() => setColor(name)}
              />
            ))}
          </div>
        </div>
        <label className="lbl lbl--inline">
          Price per job
          <span className="price-input">
            <input className="field field--sm" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} aria-label="Price per job in NEAR" />
            NEAR
          </span>
        </label>
        <div className="mint__submit">
          <button className="kyd-button kyd-button--hero kyd-button--cool" disabled={!!busy || !!problem} onClick={mint}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 24 }}>
              {busy ? "Minting…" : "Mint card"}
              <MintIcon />
            </span>
          </button>
          <span className="muted">{problem ?? "Costs about 0.03 NEAR of storage. Testnet only."}</span>
        </div>
      </div>
      <div className="mint__preview">
        <AgentCard face={face} />
      </div>
    </section>
  );
}

type Tab = "all" | "sale" | "mine" | "used";
type Sort = "hired" | "rated" | "cheap" | "new";

const SORTS: Record<Sort, { label: string; cmp: (a: Card, b: Card) => number }> = {
  hired: { label: "Most hired", cmp: (a, b) => Number(b.jobs_done) - Number(a.jobs_done) },
  rated: { label: "Top rated", cmp: (a, b) => (rating(b) ?? -1) - (rating(a) ?? -1) || Number(b.rating_count) - Number(a.rating_count) },
  cheap: { label: "Cheapest", cmp: (a, b) => (BigInt(a.price) < BigInt(b.price) ? -1 : BigInt(a.price) > BigInt(b.price) ? 1 : 0) },
  new: { label: "Newest", cmp: (a, b) => Number(b.minted_at_ms) - Number(a.minted_at_ms) },
};

export function Deck() {
  const session = useSession();
  const me = session?.accountId ?? null;
  const [cards, setCards] = useState<Card[] | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [agent, setAgent] = useState<AgentStatus | null | undefined>(undefined);
  const [tick, setTick] = useState(0);
  const [tab, setTab] = useState<Tab>("all");
  const [sort, setSort] = useState<Sort>("hired");
  const [query, setQuery] = useState("");
  const [minting, setMinting] = useState(false);
  const delivered = useRef(new Set<string>());

  const refresh = useCallback(() => {
    getCards()
      .then(setCards)
      .catch((e) => toast("err", e.message));
    getStats().then(setStats).catch(() => {});
    agentStatus().then(setAgent);
    setTick((t) => t + 1);
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 12_000);
    return () => clearInterval(t);
  }, [refresh]);

  // If a card of mine was sealed but the agent doesn't hold its instructions yet
  // (wallet redirect, agent restart), deliver them from this browser.
  useEffect(() => {
    if (!me || !cards || !agent) return;
    for (const c of cards) {
      if (c.owner_id !== me || !c.prompt_hash || agent.skills[c.token_id] === c.prompt_hash) continue;
      const key = `${c.token_id}:${c.prompt_hash}`;
      const secret = loadSkill(c.prompt_hash);
      if (!secret || delivered.current.has(key)) continue;
      delivered.current.add(key);
      deliverSkill(c.token_id, secret.salt, secret.prompt).then(refresh).catch(() => {});
    }
  }, [me, cards, agent, refresh]);

  const counts = useMemo(() => {
    const all = cards ?? [];
    return {
      all: all.length,
      sale: all.filter((c) => c.listed_price).length,
      mine: me ? all.filter((c) => c.owner_id === me).length : 0,
      used: me ? all.filter((c) => c.recent_jobs.some((j) => j.customer === me)).length : 0,
    };
  }, [cards, me]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/^#/, "");
    return (cards ?? [])
      .filter((c) =>
        tab === "sale" ? !!c.listed_price : tab === "mine" ? c.owner_id === me : tab === "used" ? c.recent_jobs.some((j) => j.customer === me) : true,
      )
      .filter(
        (c) =>
          !q ||
          [c.title ?? "", c.skill, c.about, c.owner_id].some((t) => t.toLowerCase().includes(q)) ||
          c.token_id === q ||
          c.token_id.padStart(4, "0") === q,
      )
      .sort(SORTS[sort].cmp);
  }, [cards, tab, me, query, sort]);

  const TABS: { id: Tab; label: string; needsSession?: boolean }[] = [
    { id: "all", label: "All cards" },
    { id: "sale", label: "For sale" },
    { id: "mine", label: "My cards", needsSession: true },
    { id: "used", label: "Used before", needsSession: true },
  ];
  const empty =
    cards === null
      ? "Reading cards from testnet…"
      : query.trim()
        ? `No cards match "${query.trim()}".`
        : tab === "sale"
          ? "No cards are for sale right now. Owners can list one from its page."
          : tab === "mine"
            ? "You don't own any cards yet. Mint one, or buy one that's for sale."
            : tab === "used"
              ? "Cards you hire show up here so you can find them again."
              : "No cards minted yet. Be the first.";

  return (
    <main className="app">
      <div className="container">
        <header className="app__head">
          <div>
            <p className="eyebrow-prominent">
              NEAR testnet ·{" "}
              <a href={`${NEAR_EXPLORER}/address/${CONTRACT_ID}`} target="_blank" rel="noopener noreferrer">
                {CONTRACT_ID}
              </a>
            </p>
            <h1 className="display-heading" style={{ marginTop: 12 }}>
              Agent Cards
            </h1>
          </div>
          <SessionBar tick={tick} />
        </header>

        <div className="statline">
          <div>
            <b>{stats?.cards ?? "…"}</b>
            <span>Cards minted</span>
          </div>
          <div>
            <b>{stats?.jobs_completed ?? "…"}</b>
            <span>Jobs accepted</span>
          </div>
          <div>
            <b>{stats ? near(stats.volume, 2) : "…"}</b>
            <span>NEAR paid to agents</span>
          </div>
          <div>
            <b className="statline__agent">
              <span className={`dot ${agent ? (agent.llm.mode === "live" ? "dot--ok" : "dot--warn") : "dot--off"}`} />
              {agent === undefined ? "…" : agent ? (agent.llm.mode === "live" ? "Online" : agent.llm.mode === "mock" ? "Test mode" : "No model") : "Offline"}
            </b>
            <span>{agent?.llm.mode === "live" ? agent.llm.model : agent?.llm.mode === "mock" ? "Agent answers with a placeholder" : "Agent"}</span>
          </div>
        </div>

        {!session && (
          <section className="welcome">
            <h2 className="panel-title">Mint an agent. Put it to work.</h2>
            <p className="muted">
              Every card is an AI agent with a sealed skill and its own earnings. Start as a guest to get a free testnet account in one click, no wallet
              needed.
            </p>
            <ConnectButtons />
          </section>
        )}
        {session && minting && (
          <MintForm
            minPrice={stats?.min_price ?? "50000000000000000000000"}
            onMinted={() => {
              setMinting(false);
              refresh();
            }}
          />
        )}

        <div className="toolbar">
          <div className="tabs" role="tablist">
            {TABS.filter((t) => !t.needsSession || session).map((t) => (
              <button key={t.id} role="tab" aria-selected={tab === t.id} data-active={tab === t.id} onClick={() => setTab(t.id)}>
                {t.label} <span>{counts[t.id]}</span>
              </button>
            ))}
          </div>
          <div className="toolbar__right">
            <input
              className="field field--search"
              type="search"
              placeholder="Search name, skill, owner or #number"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search cards"
            />
            <select className="field field--select" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort cards">
              {(Object.keys(SORTS) as Sort[]).map((s) => (
                <option key={s} value={s}>
                  {SORTS[s].label}
                </option>
              ))}
            </select>
            {session && (
              <button className="kyd-button kyd-button--compact kyd-button--cool" onClick={() => setMinting((m) => !m)}>
                {minting ? "Close" : "Mint a card"}
              </button>
            )}
          </div>
        </div>

        {shown.length === 0 ? (
          <p className="muted deck-empty">{empty}</p>
        ) : (
          <div className="deck">
            {shown.map((c) => (
              <AgentCard key={c.token_id} face={faceOf(c)} href={`#/card/${c.token_id}`} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
