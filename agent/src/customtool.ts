// Tools the owner defines themselves, and tools from any MCP server.
//
// A custom tool is one HTTPS endpoint with a name and a description the owner writes.
// The model decides when to call it and with what; this code makes the request and
// adds the owner's secret headers. Whatever the endpoint does (look something up,
// send a message, run the owner's own code) is up to the owner, so the set of things
// a card can do is not limited to what this project ships.
//
// An MCP server is a standard way to publish a set of tools over HTTPS. Giving a card
// an MCP server's address gives it every tool that server offers.
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { isPrivateAddress } from "./httpsource";

const MAX_BODY = 12_000;
const MAX_MCP_TOOLS = 24;

export type ToolSpec = { type: "function"; function: { name: string; description: string; parameters: object } };

export type CustomTool = {
  type: "tool";
  name: string;
  /** Tells the model what the tool does and when to use it. */
  description: string;
  method: "GET" | "POST";
  /** https address; {name} in the path is replaced by the argument of that name. */
  url: string;
  /** Secret headers added to every request, e.g. { "Authorization": "Bearer ..." }. */
  headers: Record<string, string>;
  params: { name: string; description: string; required?: boolean }[];
};

export type McpServer = {
  type: "mcp";
  /** https address of a streamable-HTTP MCP endpoint. */
  url: string;
  headers: Record<string, string>;
};

const isHeaders = (h: unknown): h is Record<string, string> =>
  !!h && typeof h === "object" && Object.values(h as object).every((v) => typeof v === "string");

export function isCustomTool(cfg: unknown): cfg is CustomTool {
  const c = cfg as Partial<CustomTool> | null;
  return (
    c?.type === "tool" &&
    typeof c.name === "string" &&
    /^[a-z][a-z0-9_]{0,39}$/.test(c.name) &&
    typeof c.description === "string" &&
    (c.method === "GET" || c.method === "POST") &&
    typeof c.url === "string" &&
    /^https:\/\//i.test(c.url) &&
    isHeaders(c.headers) &&
    Array.isArray(c.params) &&
    c.params.every((p) => typeof p?.name === "string" && typeof p?.description === "string")
  );
}

export function isMcpServer(cfg: unknown): cfg is McpServer {
  const c = cfg as Partial<McpServer> | null;
  return c?.type === "mcp" && typeof c.url === "string" && /^https:\/\//i.test(c.url) && isHeaders(c.headers);
}

/** Refuse addresses on this machine or a private network. */
async function requirePublic(url: URL) {
  const ips = isIP(url.hostname) ? [url.hostname] : (await lookup(url.hostname, { all: true })).map((r) => r.address);
  if (!ips.length || ips.some(isPrivateAddress)) throw new Error("That address is not reachable from here");
}

const cut = (text: string) =>
  text.length <= MAX_BODY ? { data: text } : { cut_off: true, note: "The response was too long and is cut off here.", data: text.slice(0, MAX_BODY) };

export const customToolSpec = (t: CustomTool): ToolSpec => ({
  type: "function",
  function: {
    name: t.name,
    description: t.description.slice(0, 1000),
    parameters: {
      type: "object",
      properties: Object.fromEntries(t.params.map((p) => [p.name, { type: "string", description: p.description }])),
      required: t.params.filter((p) => p.required).map((p) => p.name),
    },
  },
});

export async function runCustomTool(t: CustomTool, args: Record<string, unknown>): Promise<object> {
  try {
    const rest = { ...args };
    // {name} in the address is filled from the arguments; what is left goes in the query or the body
    const filled = t.url.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key: string) => {
      const value = rest[key];
      delete rest[key];
      return encodeURIComponent(String(value ?? ""));
    });
    const url = new URL(filled);
    if (url.origin !== new URL(t.url.replace(/\{[a-zA-Z0-9_]+\}/g, "x")).origin) return { error: "That request would leave the tool's own address" };
    await requirePublic(url);
    if (t.method === "GET") for (const [k, v] of Object.entries(rest)) url.searchParams.set(k, String(v));
    const res = await fetch(url, {
      method: t.method,
      headers: { ...t.headers, Accept: "application/json, text/plain;q=0.8", ...(t.method === "POST" ? { "Content-Type": "application/json" } : {}) },
      body: t.method === "POST" ? JSON.stringify(rest) : undefined,
      redirect: "manual", // a redirect could carry the secret headers to another site
      signal: AbortSignal.timeout(30_000),
    });
    if (res.status >= 300 && res.status < 400) return { error: "The tool's address redirected the request, which is not allowed" };
    const body = await res.text();
    if (!res.ok) return { error: `The tool answered ${res.status}`, body: body.slice(0, 300) };
    return cut(body);
  } catch (e) {
    let detail = String((e as Error).message ?? e).slice(0, 120);
    for (const secret of Object.values(t.headers)) if (secret.length >= 4) detail = detail.split(secret).join("***");
    return { error: "The tool did not answer. Try again.", detail };
  }
}

// ---- MCP (streamable HTTP) ----

type McpTool = { name: string; description?: string; inputSchema?: object };

/** One open conversation with an MCP server, for the length of one job. */
export class McpSession {
  private sessionId: string | null = null;
  private nextId = 1;
  constructor(private server: McpServer) {}

  private async send(method: string, params: object | undefined, expectReply: boolean): Promise<any> {
    const url = new URL(this.server.url);
    await requirePublic(url);
    const res = await fetch(url, {
      method: "POST",
      headers: {
        ...this.server.headers,
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        ...(this.sessionId ? { "Mcp-Session-Id": this.sessionId } : {}),
      },
      body: JSON.stringify({ jsonrpc: "2.0", method, ...(params ? { params } : {}), ...(expectReply ? { id: this.nextId++ } : {}) }),
      redirect: "manual",
      signal: AbortSignal.timeout(45_000),
    });
    this.sessionId = res.headers.get("mcp-session-id") ?? this.sessionId;
    if (!expectReply) return null;
    if (!res.ok) throw new Error(`The MCP server answered ${res.status}`);
    const text = await res.text();
    // the reply is either plain JSON or a stream of "data:" lines; take the last message with a result
    const messages = (res.headers.get("content-type") ?? "").includes("text/event-stream")
      ? text
          .split(/\r?\n/)
          .filter((l) => l.startsWith("data:"))
          .map((l) => l.slice(5).trim())
      : [text];
    for (const raw of messages.reverse()) {
      try {
        const msg = JSON.parse(raw);
        if (msg.error) throw new Error(String(msg.error.message ?? "MCP error").slice(0, 200));
        if ("result" in msg) return msg.result;
      } catch (e) {
        if (e instanceof SyntaxError) continue;
        throw e;
      }
    }
    throw new Error("The MCP server sent no result");
  }

  async listTools(): Promise<McpTool[]> {
    await this.send("initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "ghostwork-agent", version: "1.0" } }, true);
    await this.send("notifications/initialized", undefined, false).catch(() => {});
    const result = await this.send("tools/list", {}, true);
    return ((result?.tools ?? []) as McpTool[]).slice(0, MAX_MCP_TOOLS);
  }

  async call(name: string, args: Record<string, unknown>): Promise<object> {
    try {
      const result = await this.send("tools/call", { name, arguments: args }, true);
      const text = ((result?.content ?? []) as { type: string; text?: string }[])
        .filter((c) => c.type === "text" && c.text)
        .map((c) => c.text)
        .join("\n");
      return { ...(result?.isError ? { error: "The tool reported an error" } : {}), ...cut(text || JSON.stringify(result ?? {})) };
    } catch (e) {
      let detail = String((e as Error).message ?? e).slice(0, 160);
      for (const secret of Object.values(this.server.headers)) if (secret.length >= 4) detail = detail.split(secret).join("***");
      return { error: "The tool did not answer. Try again.", detail };
    }
  }
}
