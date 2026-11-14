// A private web API as a card's data source.
//
// The owner seals the API's address, the secret header that unlocks it, and a short
// guide to what it offers. During a job the model can ask for a path under that
// address. This code makes the request and adds the secret header itself, so the
// model sees the data that comes back and nothing else.
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export type HttpSource = {
  type: "http-api";
  /** e.g. https://api.example.com/v1 . Requests can only go to paths under it. */
  base_url: string;
  /** e.g. "Authorization" */
  header_name: string;
  /** e.g. "Bearer abc123" */
  header_value: string;
  /** The owner's notes for the model: which paths exist and what they return. */
  guide: string;
};

const MAX_BODY = 12_000;

export function isHttpSource(cfg: unknown): cfg is HttpSource {
  const c = cfg as Partial<HttpSource> | null;
  return (
    c?.type === "http-api" &&
    typeof c.base_url === "string" &&
    /^https:\/\//i.test(c.base_url) &&
    typeof c.header_name === "string" &&
    typeof c.header_value === "string" &&
    typeof c.guide === "string"
  );
}

/** Addresses on this machine or a private network, which a card must not be able to reach. */
export function isPrivateAddress(ip: string) {
  if (ip.includes(":")) {
    const v6 = ip.toLowerCase();
    return v6 === "::1" || v6 === "::" || v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe80") || v6.startsWith("::ffff:");
  }
  const [a, b] = ip.split(".").map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254) || a >= 224;
}

export const httpToolSpecs = [
  {
    type: "function" as const,
    function: {
      name: "get_data",
      description:
        "Read from the owner's private API. Give a path from the owner's guide and any query parameters. Returns the response body. Read-only.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Path under the API's address, e.g. /prices/latest" },
          query: { type: "object", description: "Query parameters as key/value pairs. Only use ones the guide mentions.", additionalProperties: { type: "string" } },
          find: { type: "string", description: "Optional. Keep only the list items (or lines) that contain this text. Use it when a response is long." },
        },
        required: ["path"],
      },
    },
  },
];

/** Inside any list in the response, keep only the items that mention the text. */
function keepMatching(value: unknown, find: string): unknown {
  if (Array.isArray(value)) return value.filter((item) => JSON.stringify(item).toLowerCase().includes(find));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, keepMatching(v, find)]));
  return value;
}

export async function runHttpTool(source: HttpSource, name: string, args: Record<string, unknown>): Promise<object> {
  if (name !== "get_data") return { error: `Unknown tool ${name}` };
  try {
    const base = new URL(source.base_url.replace(/\/+$/, "") + "/");
    const path = String(args.path ?? "").replace(/^\/+/, "");
    if (/^[a-z][a-z0-9+.-]*:|^\/\//i.test(path) || path.split(/[/\\]/).includes("..")) return { error: "Give a plain path under the API's address" };
    const url = new URL(path, base);
    if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) return { error: "That path is outside the API's address" };
    if (args.query && typeof args.query === "object") {
      for (const [k, v] of Object.entries(args.query as Record<string, unknown>)) url.searchParams.set(k, String(v));
    }
    const ips = isIP(url.hostname) ? [url.hostname] : (await lookup(url.hostname, { all: true })).map((r) => r.address);
    if (!ips.length || ips.some(isPrivateAddress)) return { error: "That address is not reachable from here" };

    const res = await fetch(url, {
      headers: { [source.header_name]: source.header_value, Accept: "application/json, text/plain;q=0.8" },
      redirect: "manual", // a redirect could carry the secret header to another site
      signal: AbortSignal.timeout(15_000),
    });
    if (res.status >= 300 && res.status < 400) return { error: "The API redirected the request, which is not allowed" };
    const body = await res.text();
    if (!res.ok) return { error: `The API answered ${res.status}`, body: body.slice(0, 300) };
    const find = typeof args.find === "string" && args.find.trim() ? args.find.trim().toLowerCase() : null;
    let data: unknown;
    try {
      data = JSON.parse(body);
      if (find) data = keepMatching(data, find);
    } catch {
      data = find
        ? body
            .split("\n")
            .filter((line) => line.toLowerCase().includes(find))
            .join("\n")
        : body;
    }
    // say so when the response is cut, so the model does not mistake a part for the whole
    const text = typeof data === "string" ? data : JSON.stringify(data);
    if (text.length <= MAX_BODY) return { data };
    return { cut_off: true, note: "The response was too long and is cut off here. Ask again with \"find\" to narrow it.", data: text.slice(0, MAX_BODY) };
  } catch (e) {
    return { error: "The API did not answer. Try again.", detail: String((e as Error).message ?? e).split(source.header_value).join("***").slice(0, 120) };
  }
}
