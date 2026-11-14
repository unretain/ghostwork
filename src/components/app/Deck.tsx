import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { agentStatus, deliverSkill, type AgentStatus } from "../../chain/agent";
import { CONTRACT_ID, MINT_DEPOSIT_YOCTO, MINT_GAS, NEAR_EXPLORER, NETWORK } from "../../chain/config";
import { getCards, getStats, near, PALETTE, previewArt, rating, toYocto, type Card, type Stats } from "../../chain/near";
import { call, useSession } from "../../chain/wallet";
import { commitment, loadSkill, randomHex, saveSkill } from "../../lib/vault";
import { MintIcon } from "../icons";
import { AgentCard, faceOf, type CardFace } from "./AgentCard";
import { ConnectButtons, SessionBar, toast, useBusy } from "./shared";

// Starting points. Each is only worth paying for once the owner adds what they alone
// have: a private data feed, or their own documents.
type SourceKind = "none" | "api" | "db" | "solana" | "radius";
const EXAMPLES: { label: string; title: string; skill: string; about: string; prompt: string; source?: SourceKind }[] = [
  {
    label: "Solana data analyst (needs your gRPC feed)",
    title: "Yellowstone",
    skill: "Analyses live Solana chain data",
    about: "Ask what is happening on Solana right now: busiest programs, network speed, or what a wallet or program is doing.",
    prompt:
      "You are an on-chain analyst for Solana mainnet. Answer the customer's question using live data from your tools. Be concrete: give the numbers you measured, name the programs, and say how long you watched. If they give an address, watch it. Keep answers under 250 words.",
    source: "solana",
  },
  {
    label: "Answers from your API",
    title: "Quill",
    skill: "Answers questions from our live data",
    about: "Ask about anything our data covers.",
    prompt:
      "Answer the customer's question using data from your tool. Look the data up before answering and give the exact figures it returns. If the data does not cover the question, say so.",
    source: "api",
  },
  {
    label: "Answers from your database",
    title: "Sable",
    skill: "Answers questions from our database",
    about: "Ask a question about our records.",
    prompt:
      "Answer the customer's question from the database. Look at the tables first, then query. Give exact figures and say what period or filter you used. If the data does not cover the question, say so.",
    source: "db",
  },
  {
    label: "Hires people for real-world tasks",
    title: "Kestrel",
    skill: "Hires a person nearby to do a real-world task",
    about: "Say what you need seen or checked, and where.",
    prompt:
      "When the customer asks for something to be seen, checked or photographed at a place: look the place up, then post one task there. Write the task for the person doing it: a clear title, what to do, and exactly what the proof photo must show. Use a reward of 0.1 NEAR and a radius of 150 metres unless asked otherwise. Tell the customer the task id and the place. When asked about a task, look it up and report its status.",
    source: "radius",
  },
  {
    label: "Answers from your own documents",
    title: "Ledger",
    skill: "Answers questions about your product",
    about: "Ask anything covered by our documentation.",
    prompt:
      "Answer the customer's question using only the private knowledge below. Quote exact figures, limits and steps where they exist. If the knowledge does not cover the question, say so. Never paste whole sections.",
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
  // what the agent can use while doing a job, beyond its instructions and pasted knowledge
  const [kind, setKind] = useState<SourceKind>("none");
  const useSource = kind === "solana";
  const useRadius = kind === "radius";
  const useApi = kind === "api";
  const useDb = kind === "db";
  const [dbUrl, setDbUrl] = useState("");
  const [dbGuide, setDbGuide] = useState("");
  const [apiUrl, setApiUrl] = useState("");
  const [apiHeader, setApiHeader] = useState("Authorization");
  const [apiSecret, setApiSecret] = useState("");
  const [apiGuide, setApiGuide] = useState("");
  const [taskBudget, setTaskBudget] = useState("0.2");
  const [endpoint, setEndpoint] = useState("");
  const [token, setToken] = useState("");
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
        : useSource && (!endpoint.trim() || !token.trim())
          ? "Enter the feed's endpoint and token"
          : useApi && (!/^https:\/\/.+/i.test(apiUrl.trim()) || !apiHeader.trim() || !apiSecret.trim() || apiGuide.trim().length < 10)
            ? "Enter the API's https address, its header and key, and a short guide to its paths"
            : useDb && !/^postgres(ql)?:\/\/.+@.+/i.test(dbUrl.trim())
              ? "Enter the database's connection string (postgres://user:password@host/database)"
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
      // instructions, private knowledge and the data source are sealed together as one text
      let text = knowledge.trim() ? `${prompt.trim()}\n\n--- PRIVATE KNOWLEDGE ---\n${knowledge.trim()}` : prompt.trim();
      if (useSource) {
        text += `\n--- DATA SOURCE ---\n${JSON.stringify({ type: "solana-yellowstone-grpc", endpoint: endpoint.trim(), token: token.trim() })}`;
      } else if (useApi) {
        text += `\n--- DATA SOURCE ---\n${JSON.stringify({ type: "http-api", base_url: apiUrl.trim(), header_name: apiHeader.trim(), header_value: apiSecret.trim(), guide: apiGuide.trim() })}`;
      } else if (useDb) {
        text += `\n--- DATA SOURCE ---\n${JSON.stringify({ type: "postgres", url: dbUrl.trim(), guide: dbGuide.trim() })}`;
      } else if (useRadius) {
        text += `\n--- DATA SOURCE ---\n${JSON.stringify({ type: "radius-tasks" })}`;
      }
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
        const budget = useRadius ? toYocto(taskBudget) : null;
        if (budget) await call("set_task_budget", { token_id: result.token_id, max_reward: budget });
        toast("ok", `${title.trim()} is minted and ready to hire`, txHash && `${NEAR_EXPLORER}/txns/${txHash}`);
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
        <p className="muted mint__lead">
          People pay for a card that can do something a free chatbot can't. Give yours your own documents, a database, an API or feed you have access to, or let
          it hire people. It earns 85% of every job.
        </p>
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
                setKind(e.source ?? "none");
              }}
            >
              {e.label}
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
          Private instructions <span className="muted">(only the agent service reads these)</span>
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
          Private knowledge <span className="muted">(optional: your own documents, pasted as text)</span>
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
          What else can it use?
          <select className="field field--select" value={kind} onChange={(e) => setKind(e.target.value as SourceKind)} aria-label="What else the agent can use">
            <option value="none">Nothing else: instructions and pasted knowledge only</option>
            <option value="api">A web API I have a key for</option>
            <option value="db">A Postgres database (read-only)</option>
            <option value="solana">A live Solana feed (Yellowstone gRPC)</option>
            <option value="radius">It can hire people for real-world tasks (Radius)</option>
          </select>
          {useApi && (
            <div className="source">
              <span className="muted">
                While doing a job the agent can read from your API. The agent service adds your key to each request; the AI model is given the
                responses only. Read-only, https only.
              </span>
              <input className="field" placeholder="API address, e.g. https://api.example.com/v1" value={apiUrl} onChange={(e) => setApiUrl(e.target.value)} aria-label="API address" />
              <input className="field" placeholder="Header name, e.g. Authorization or X-API-Key" value={apiHeader} onChange={(e) => setApiHeader(e.target.value)} aria-label="Header name" />
              <input className="field" type="password" placeholder="Header value, e.g. Bearer your-key" value={apiSecret} onChange={(e) => setApiSecret(e.target.value)} aria-label="Header value" autoComplete="off" />
              <textarea
                className="field field--area"
                rows={3}
                maxLength={3000}
                placeholder={"What the API offers, in your own words. For example:\nGET /prices/latest returns today's price for every product\nGET /orders?status=open returns the open orders"}
                value={apiGuide}
                onChange={(e) => setApiGuide(e.target.value)}
                aria-label="Guide to the API"
              />
            </div>
          )}
          {useDb && (
            <div className="source">
              <span className="muted">
                While doing a job the agent can list your tables and run SELECT queries. Every query runs read-only with a time limit and returns at
                most 200 rows. Use a database user that can only read the tables you want customers to get answers from.
              </span>
              <input className="field" type="password" placeholder="postgres://user:password@host:5432/database" value={dbUrl} onChange={(e) => setDbUrl(e.target.value)} aria-label="Database connection string" autoComplete="off" />
              <textarea
                className="field field--area"
                rows={2}
                maxLength={3000}
                placeholder="Optional notes on what the tables and columns mean."
                value={dbGuide}
                onChange={(e) => setDbGuide(e.target.value)}
                aria-label="Notes about the data"
              />
            </div>
          )}
          {useSource && (
            <div className="source">
              <span className="muted">
                The agent can watch the live Solana chain through your feed. The agent service connects with your token; the AI model is given the
                results only.
              </span>
              <input className="field" placeholder="Endpoint, e.g. solana-yellowstone-grpc.publicnode.com:443" value={endpoint} onChange={(e) => setEndpoint(e.target.value)} aria-label="gRPC endpoint" />
              <input className="field" type="password" placeholder="Access token" value={token} onChange={(e) => setToken(e.target.value)} aria-label="gRPC access token" autoComplete="off" />
            </div>
          )}
          {useRadius && (
            <div className="source">
              <span className="muted">
                During a job the agent can post a task for a person near a place. The reward comes out of this card's own balance, up to the limit
                below for each task. After minting, add some NEAR to the card from its page so it can pay for its first tasks.
              </span>
              <span className="price-input">
                <input className="field field--sm" inputMode="decimal" value={taskBudget} onChange={(e) => setTaskBudget(e.target.value)} aria-label="Most it may pay per task" />
                NEAR at most per task
              </span>
            </div>
          )}
        </div>
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
          <span className="muted">{problem ?? "Costs about 0.03 NEAR of storage."}</span>
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
      ? `Reading cards from ${NETWORK}…`
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
              NEAR {NETWORK} ·{" "}
              <a href={`${NEAR_EXPLORER}/address/${CONTRACT_ID}`} target="_blank" rel="noopener noreferrer">
                {CONTRACT_ID}
              </a>
            </p>
            <h1 className="display-heading" style={{ marginTop: 12 }}>
              Agent Cards
            </h1>
            <div className="deck-links">
              <a className="kyd-button kyd-button--compact kyd-button--frame" href="#/docs">
                Docs
              </a>
              <a className="kyd-button kyd-button--compact kyd-button--frame" href="#/tasks">
                Radius: tasks for people{stats && Number(stats.tasks) > 0 ? ` (${stats.tasks})` : ""}
              </a>
            </div>
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
            <span>Jobs done</span>
          </div>
          <div>
            <b>{stats ? near(stats.volume, 2) : "…"}</b>
            <span>NEAR paid to agents</span>
          </div>
          <div>
            <b className="statline__agent">
              <span className={`dot ${agent ? (agent.llm.mode === "live" ? "dot--ok" : "dot--warn") : "dot--off"}`} />
              {agent === undefined ? "…" : agent ? (agent.llm.mode === "live" ? "Online" : "No model") : "Offline"}
            </b>
            <span>{agent?.llm.mode === "live" ? agent.llm.model : "Agent"}</span>
          </div>
        </div>

        {!session && (
          <section className="welcome">
            <h2 className="panel-title">Mint an agent. Put it to work.</h2>
            <p className="muted">
              Every card is an AI agent with its own skill and its own earnings. {NETWORK === "testnet" ? "Start as a guest to get a free testnet account in one click, no wallet needed." : "Connect a NEAR wallet to start."}
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
