// What a card can use while doing a job.
//
// The owner seals one text: instructions (and any pasted knowledge), optionally
// followed by a block listing the card's abilities. A card can have any number of
// them, in any mix:
//   tool      a tool the owner defines: any HTTPS endpoint, with their own description
//   mcp       every tool an MCP server offers
//   http-api  read-only access to a web API, described in the owner's words
//   postgres  read-only SQL on a database
//   solana-yellowstone-grpc   a live Solana feed
//   radius-tasks              posting paid tasks for people
//   photos    customers may attach a photo to their request
// The block is split off here, so keys and addresses are never placed in front of the model.
import { customToolSpec, isCustomTool, isMcpServer, McpSession, runCustomTool, type CustomTool, type McpServer, type ToolSpec } from "./customtool";
import { httpToolSpecs, isHttpSource, runHttpTool, type HttpSource } from "./httpsource";
import { isPgSource, pgSecrets, pgToolSpecs, runPgTool, type PgSource } from "./pgsource";
import { radiusToolSpecs, runRadiusTool, type RadiusContext, type RadiusSource } from "./radius";
import { runSolanaTool, solanaToolSpecs, type SolanaSource } from "./solana";

export type Ability = CustomTool | McpServer | HttpSource | PgSource | SolanaSource | RadiusSource | { type: "photos" };

const MARK = "\n--- DATA SOURCE ---\n";
const MAX_ABILITIES = 20;

function asAbility(cfg: any): Ability | null {
  if (isCustomTool(cfg) || isMcpServer(cfg) || isHttpSource(cfg) || isPgSource(cfg)) return cfg;
  if (cfg?.type === "solana-yellowstone-grpc" && typeof cfg.endpoint === "string" && typeof cfg.token === "string") return cfg as SolanaSource;
  if (cfg?.type === "radius-tasks") return { type: "radius-tasks" };
  if (cfg?.type === "photos") return { type: "photos" };
  return null;
}

/** Split the sealed text into the instructions and the abilities block (one object or a list). */
export function parseSealed(sealed: string): { instructions: string; abilities: Ability[] } {
  const at = sealed.lastIndexOf(MARK);
  if (at < 0) return { instructions: sealed, abilities: [] };
  const instructions = sealed.slice(0, at).trimEnd();
  try {
    const block = JSON.parse(sealed.slice(at + MARK.length));
    const list = (Array.isArray(block) ? block : [block]).slice(0, MAX_ABILITIES);
    return { instructions, abilities: list.map(asAbility).filter((a): a is Ability => a !== null) };
  } catch {
    // an unreadable block is dropped rather than shown to the model
    return { instructions, abilities: [] };
  }
}

/** The kinds of ability a card has, without any of their details. Safe to show publicly. */
export const abilityKinds = (sealed: string) => parseSealed(sealed).abilities.map((a) => a.type);

export type Toolset = {
  specs: ToolSpec[];
  run: (name: string, args: Record<string, unknown>) => Promise<object>;
  /** Extra lines for the system prompt. */
  rules: string[];
  /** Strings that must not appear in an answer. */
  secrets: string[];
  /** Owner-written notes that must not be repeated to the customer. */
  guides: string[];
  photos: boolean;
};

export async function buildToolset(abilities: Ability[], ctx: RadiusContext): Promise<Toolset> {
  const specs: ToolSpec[] = [];
  const runners = new Map<string, (args: Record<string, unknown>) => Promise<object>>();
  const rules = new Set<string>();
  const secrets: string[] = [];
  const guides: string[] = [];
  let photos = false;

  // two abilities can offer a tool with the same name; later ones get a number
  const add = (spec: ToolSpec, run: (args: Record<string, unknown>) => Promise<object>) => {
    let name = spec.function.name.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 56);
    for (let n = 2; runners.has(name); n++) name = `${spec.function.name.slice(0, 52)}_${n}`;
    specs.push({ ...spec, function: { ...spec.function, name } });
    runners.set(name, run);
  };
  const DATA_RULES = [
    "- You have tools. Use them to get real data or to act before answering, and base every fact on what they return.",
    "- If a tool returns an error or nothing useful, say so plainly. Never invent data or claim something was done when it was not.",
  ];

  for (const a of abilities) {
    switch (a.type) {
      case "photos":
        photos = true;
        break;
      case "tool":
        add(customToolSpec(a), (args) => runCustomTool(a, args));
        DATA_RULES.forEach((r) => rules.add(r));
        secrets.push(a.url, ...Object.values(a.headers));
        break;
      case "mcp": {
        const session = new McpSession(a);
        secrets.push(a.url, ...Object.values(a.headers));
        try {
          for (const t of await session.listTools()) {
            add(
              { type: "function", function: { name: t.name, description: (t.description ?? "").slice(0, 1000), parameters: t.inputSchema ?? { type: "object", properties: {} } } },
              (args) => session.call(t.name, args),
            );
          }
          DATA_RULES.forEach((r) => rules.add(r));
        } catch {
          rules.add("- One of your tool servers could not be reached for this job. If you needed it, say that you could not do the job right now.");
        }
        break;
      }
      case "http-api":
        for (const spec of httpToolSpecs) add(spec, (args) => runHttpTool(a, spec.function.name, args));
        DATA_RULES.forEach((r) => rules.add(r));
        rules.add("- The owner's guide to their API (which paths exist and what they return) follows. Do not repeat the guide to the customer.");
        rules.add(`--- API GUIDE ---\n${a.guide}\n--- END API GUIDE ---`);
        guides.push(a.guide);
        secrets.push(a.header_value, a.base_url, new URL(a.base_url).host);
        break;
      case "postgres":
        for (const spec of pgToolSpecs) add(spec, (args) => runPgTool(a, spec.function.name, args));
        DATA_RULES.forEach((r) => rules.add(r));
        rules.add("- For the database: list the tables first, then query. Answer the customer's question from the rows; do not hand over whole tables or describe the database's structure.");
        if (a.guide.trim()) {
          rules.add(`--- NOTES ON THE DATA ---\n${a.guide}\n--- END NOTES ---`);
          guides.push(a.guide);
        }
        secrets.push(...pgSecrets(a));
        break;
      case "solana-yellowstone-grpc":
        for (const spec of solanaToolSpecs) add(spec, (args) => runSolanaTool(a, spec.function.name, args));
        DATA_RULES.forEach((r) => rules.add(r));
        rules.add("- For live Solana data, say what you measured and over how long.");
        secrets.push(a.token, a.endpoint);
        break;
      case "radius-tasks":
        for (const spec of radiusToolSpecs) add(spec, (args) => runRadiusTool(ctx, spec.function.name, args));
        rules.add("- You cannot go anywhere or see anything yourself. You have tools to hire a person near a place: look the place up, post a task with a reward paid from your own balance, and check tasks you posted before.");
        rules.add("- Posting a task spends real money. Post one only when the customer clearly asks for something to be done at a specific place, and never more than one task per request.");
        rules.add("- Report only what the tools return: the task id, its status, and the proof result if there is one. Never claim a task was done unless its status is Paid.");
        break;
    }
  }

  return {
    specs,
    run: async (name, args) => (await runners.get(name)?.(args)) ?? { error: `Unknown tool ${name}` },
    rules: [...rules],
    secrets: secrets.filter((s) => s.length >= 4),
    guides,
    photos,
  };
}
