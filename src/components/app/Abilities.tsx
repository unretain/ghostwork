// The "what can it use?" part of making an agent. A card can have any number of
// abilities in any mix. Two of them are open-ended: a custom tool is any HTTPS
// endpoint the owner describes, and an MCP server brings whatever tools it offers.
// The format written here is read by agent/src/abilities.ts.

export type Draft =
  | { kind: "tool"; name: string; description: string; method: "GET" | "POST"; url: string; headerName: string; headerValue: string; params: string }
  | { kind: "mcp"; url: string; headerName: string; headerValue: string }
  | { kind: "api"; url: string; headerName: string; headerValue: string; guide: string }
  | { kind: "db"; url: string; guide: string }
  | { kind: "solana"; endpoint: string; token: string }
  | { kind: "radius"; budget: string }
  | { kind: "photos" };

type Kind = Draft["kind"];

const KINDS: { kind: Kind; add: string; title: string; once?: boolean; help: string }[] = [
  {
    kind: "tool",
    add: "Custom tool",
    title: "Custom tool",
    help: "Any HTTPS endpoint, yours or someone else's. You name it and say what it does; the agent decides when to call it. It can look something up, send something, or run your own code. Add as many as you like.",
  },
  {
    kind: "mcp",
    add: "MCP server",
    title: "MCP server",
    help: "The address of an MCP server (streamable HTTP). The agent gets every tool that server offers.",
  },
  { kind: "api", add: "Web API", title: "Web API (read-only)", help: "Read from an API by describing its paths in your own words. Simpler than defining each tool." },
  {
    kind: "db",
    add: "Database",
    title: "Postgres database (read-only)",
    help: "The agent lists your tables and runs SELECT queries. Use a database user that can only read what you want answers from.",
  },
  { kind: "solana", add: "Solana feed", title: "Live Solana feed (Yellowstone gRPC)", help: "The agent can watch the live Solana chain through your feed." },
  {
    kind: "radius",
    add: "Hire people",
    title: "Hire people (Radius)",
    once: true,
    help: "The agent can post a paid task for a person near a place. The reward comes out of this card's own balance, up to this limit per task. Add NEAR to the card from its page after minting.",
  },
  {
    kind: "photos",
    add: "Take photos",
    title: "Customers can attach a photo",
    once: true,
    help: "Customers can send a photo with their request and the agent can see it. Use it for anything that checks, reads or describes a picture.",
  },
];

const blank = (kind: Kind): Draft => {
  switch (kind) {
    case "tool":
      return { kind, name: "", description: "", method: "GET", url: "", headerName: "", headerValue: "", params: "" };
    case "mcp":
      return { kind, url: "", headerName: "", headerValue: "" };
    case "api":
      return { kind, url: "", headerName: "Authorization", headerValue: "", guide: "" };
    case "db":
      return { kind, url: "", guide: "" };
    case "solana":
      return { kind, endpoint: "", token: "" };
    case "radius":
      return { kind, budget: "0.2" };
    case "photos":
      return { kind };
  }
};

export const newDraft = blank;

const https = (s: string) => /^https:\/\/.+\..+/i.test(s.trim());
const header = (name: string, value: string): Record<string, string> => (name.trim() && value.trim() ? { [name.trim()]: value.trim() } : {});

/** "city: the city name" per line. A line ending in "(optional)" is not required. */
const parseParams = (text: string) =>
  text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [name, ...rest] = l.split(":");
      const description = rest.join(":").trim();
      return { name: name.trim(), description: description.replace(/\(optional\)\s*$/i, "").trim() || name.trim(), required: !/\(optional\)\s*$/i.test(description) };
    });

/** What is wrong with the list, or null if it can be minted. */
export function abilityProblem(list: Draft[]): string | null {
  const names = new Set<string>();
  for (const d of list) {
    if (d.kind === "tool") {
      if (!/^[a-z][a-z0-9_]{0,39}$/.test(d.name)) return "Give each custom tool a name in lowercase letters, digits and underscores (like check_stock)";
      if (names.has(d.name)) return `Two custom tools are both called ${d.name}`;
      names.add(d.name);
      if (d.description.trim().length < 10) return `Say what the tool ${d.name} does, so the agent knows when to use it`;
      if (!https(d.url)) return `Tool ${d.name} needs an https address`;
      if (parseParams(d.params).some((p) => !/^[a-zA-Z0-9_]+$/.test(p.name))) return `Tool ${d.name}: write each input as "name: what it is"`;
    }
    if (d.kind === "mcp" && !https(d.url)) return "Enter the MCP server's https address";
    if (d.kind === "api" && (!https(d.url) || d.guide.trim().length < 10)) return "The web API needs an https address and a short guide to its paths";
    if (d.kind === "db" && !/^postgres(ql)?:\/\/.+@.+/i.test(d.url.trim())) return "Enter the database's connection string (postgres://user:password@host/database)";
    if (d.kind === "solana" && (!d.endpoint.trim() || !d.token.trim())) return "Enter the Solana feed's endpoint and token";
    if (d.kind === "radius" && !(Number(d.budget) > 0)) return "Set the most the card may pay per task";
  }
  return null;
}

/** The block appended to the sealed text, or "" when the card has no abilities. */
export function abilitiesBlock(list: Draft[]): string {
  if (!list.length) return "";
  const out = list.map((d) => {
    switch (d.kind) {
      case "tool":
        return { type: "tool", name: d.name, description: d.description.trim(), method: d.method, url: d.url.trim(), headers: header(d.headerName, d.headerValue), params: parseParams(d.params) };
      case "mcp":
        return { type: "mcp", url: d.url.trim(), headers: header(d.headerName, d.headerValue) };
      case "api":
        return { type: "http-api", base_url: d.url.trim(), header_name: d.headerName.trim() || "Accept", header_value: d.headerValue.trim() || "application/json", guide: d.guide.trim() };
      case "db":
        return { type: "postgres", url: d.url.trim(), guide: d.guide.trim() };
      case "solana":
        return { type: "solana-yellowstone-grpc", endpoint: d.endpoint.trim(), token: d.token.trim() };
      case "radius":
        return { type: "radius-tasks" };
      case "photos":
        return { type: "photos" };
    }
  });
  return `\n--- DATA SOURCE ---\n${JSON.stringify(out)}`;
}

/** The per-task spending limit, if the card can hire people. */
export const taskBudgetOf = (list: Draft[]) => list.find((d): d is Extract<Draft, { kind: "radius" }> => d.kind === "radius")?.budget ?? null;

export function AbilitiesEditor({ value, onChange }: { value: Draft[]; onChange: (next: Draft[]) => void }) {
  const set = (i: number, patch: Partial<Draft>) => onChange(value.map((d, j) => (j === i ? ({ ...d, ...patch } as Draft) : d)));
  const text = (i: number, key: string, placeholder: string, secret = false) => (
    <input
      className="field"
      type={secret ? "password" : "text"}
      autoComplete="off"
      placeholder={placeholder}
      aria-label={placeholder}
      value={(value[i] as unknown as Record<string, string>)[key] ?? ""}
      onChange={(e) => set(i, { [key]: e.target.value } as Partial<Draft>)}
    />
  );
  const area = (i: number, key: string, placeholder: string, rows = 3) => (
    <textarea
      className="field field--area"
      rows={rows}
      maxLength={3000}
      placeholder={placeholder}
      aria-label={placeholder.split("\n")[0]}
      value={(value[i] as unknown as Record<string, string>)[key] ?? ""}
      onChange={(e) => set(i, { [key]: e.target.value } as Partial<Draft>)}
    />
  );

  return (
    <div className="lbl">
      What can it use? <span className="muted">(optional: add any number, in any mix)</span>
      {value.map((d, i) => {
        const meta = KINDS.find((k) => k.kind === d.kind)!;
        return (
          <div className="source" key={i}>
            <div className="source__head">
              <b>{meta.title}</b>
              <button type="button" className="mini-btn" onClick={() => onChange(value.filter((_, j) => j !== i))}>
                Remove
              </button>
            </div>
            <span className="muted">{meta.help}</span>
            {d.kind === "tool" && (
              <>
                {text(i, "name", "Tool name, e.g. check_stock")}
                {area(i, "description", "What it does and when the agent should use it, e.g. Looks up how many of a product are in stock.", 2)}
                <span className="inline-form">
                  <select className="field field--select" value={d.method} onChange={(e) => set(i, { method: e.target.value as "GET" | "POST" })} aria-label="Request method">
                    <option value="GET">GET</option>
                    <option value="POST">POST</option>
                  </select>
                  {text(i, "url", "https://your-server.com/stock/{product}")}
                </span>
                {area(i, "params", "Inputs the agent fills in, one per line:\nproduct: the product code\nwarehouse: which warehouse (optional)", 3)}
                <span className="inline-form">
                  {text(i, "headerName", "Secret header name (optional)")}
                  {text(i, "headerValue", "Secret header value", true)}
                </span>
              </>
            )}
            {d.kind === "mcp" && (
              <>
                {text(i, "url", "https://mcp.example.com/mcp")}
                <span className="inline-form">
                  {text(i, "headerName", "Secret header name (optional)")}
                  {text(i, "headerValue", "Secret header value", true)}
                </span>
              </>
            )}
            {d.kind === "api" && (
              <>
                {text(i, "url", "API address, e.g. https://api.example.com/v1")}
                <span className="inline-form">
                  {text(i, "headerName", "Header name, e.g. Authorization")}
                  {text(i, "headerValue", "Header value, e.g. Bearer your-key", true)}
                </span>
                {area(i, "guide", "What the API offers, in your own words:\nGET /prices/latest returns today's price for every product\nGET /orders?status=open returns the open orders")}
              </>
            )}
            {d.kind === "db" && (
              <>
                {text(i, "url", "postgres://user:password@host:5432/database", true)}
                {area(i, "guide", "Optional notes on what the tables and columns mean.", 2)}
              </>
            )}
            {d.kind === "solana" && (
              <>
                {text(i, "endpoint", "Endpoint, e.g. solana-yellowstone-grpc.publicnode.com:443")}
                {text(i, "token", "Access token", true)}
              </>
            )}
            {d.kind === "radius" && (
              <span className="price-input">
                <input className="field field--sm" inputMode="decimal" value={d.budget} onChange={(e) => set(i, { budget: e.target.value })} aria-label="Most it may pay per task" />
                NEAR at most per task
              </span>
            )}
          </div>
        );
      })}
      <div className="examples">
        <span className="muted">Add:</span>
        {KINDS.filter((k) => !k.once || !value.some((d) => d.kind === k.kind)).map((k) => (
          <button key={k.kind} type="button" className="mini-btn" onClick={() => onChange([...value, blank(k.kind)])}>
            + {k.add}
          </button>
        ))}
      </div>
    </div>
  );
}
