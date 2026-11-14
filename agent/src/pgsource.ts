// A Postgres database as a card's data source, read-only.
//
// The owner seals a connection string. During a job the model can list the tables
// and run SELECT queries. This code holds the connection; the model sees rows.
// Every query runs in a read-only transaction with a time limit and a row limit.
// Give the card a database user that can only read the tables you want it to see.
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import pg from "pg";
import { isPrivateAddress } from "./httpsource";

export type PgSource = {
  type: "postgres";
  /** postgres://user:password@host:5432/database */
  url: string;
  /** Optional notes from the owner about what the tables mean. */
  guide: string;
};

const MAX_ROWS = 200;
const MAX_TEXT = 12_000;
// Local databases are refused unless this is set (used for development only).
const ALLOW_PRIVATE = process.env.ALLOW_PRIVATE_SOURCES === "1";

export function isPgSource(cfg: unknown): cfg is PgSource {
  const c = cfg as Partial<PgSource> | null;
  return c?.type === "postgres" && typeof c.url === "string" && /^postgres(ql)?:\/\//i.test(c.url) && typeof c.guide === "string";
}

/** Strings from the connection that must not appear in an answer. */
export function pgSecrets(source: PgSource): string[] {
  try {
    const u = new URL(source.url);
    return [source.url, decodeURIComponent(u.password), u.host].filter((s) => s.length >= 4);
  } catch {
    return [source.url];
  }
}

export const pgToolSpecs = [
  {
    type: "function" as const,
    function: {
      name: "list_tables",
      description: "List the tables in the owner's database with their columns and types. Call this first.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "run_query",
      description: `Run one read-only SQL query (SELECT or WITH) on the owner's Postgres database. At most ${MAX_ROWS} rows come back, so aggregate in SQL.`,
      parameters: { type: "object", properties: { sql: { type: "string", description: "A single SELECT statement" } }, required: ["sql"] },
    },
  },
];

async function withClient<T>(source: PgSource, fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const host = new URL(source.url).hostname;
  if (!ALLOW_PRIVATE) {
    const ips = isIP(host) ? [host] : (await lookup(host, { all: true })).map((r) => r.address);
    if (!ips.length || ips.some(isPrivateAddress)) throw new Error("That database address is not reachable from here");
  }
  const client = new pg.Client({ connectionString: source.url, connectionTimeoutMillis: 10_000, statement_timeout: 8_000, query_timeout: 10_000 });
  await client.connect();
  try {
    // nothing in this transaction can write, whatever the query says
    await client.query("BEGIN TRANSACTION READ ONLY");
    return await fn(client);
  } finally {
    await client.query("ROLLBACK").catch(() => {});
    await client.end().catch(() => {});
  }
}

export async function runPgTool(source: PgSource, name: string, args: Record<string, unknown>): Promise<object> {
  try {
    if (name === "list_tables") {
      return await withClient(source, async (client) => {
        const res = await client.query(
          `SELECT table_schema, table_name, column_name, data_type FROM information_schema.columns
           WHERE table_schema NOT IN ('pg_catalog', 'information_schema') ORDER BY table_schema, table_name, ordinal_position LIMIT 600`,
        );
        const tables: Record<string, string[]> = {};
        for (const r of res.rows) {
          const key = r.table_schema === "public" ? r.table_name : `${r.table_schema}.${r.table_name}`;
          (tables[key] ??= []).push(`${r.column_name} ${r.data_type}`);
        }
        return { tables };
      });
    }
    if (name === "run_query") {
      const sql = String(args.sql ?? "").trim().replace(/;\s*$/, "");
      if (!/^(select|with)\b/i.test(sql)) return { error: "Only SELECT queries are allowed" };
      if (sql.includes(";")) return { error: "Send one statement, without semicolons" };
      return await withClient(source, async (client) => {
        const res = await client.query(`SELECT * FROM (${sql}) AS q LIMIT ${MAX_ROWS + 1}`);
        const rows = res.rows.slice(0, MAX_ROWS);
        const text = JSON.stringify(rows);
        return {
          row_count: rows.length,
          more_rows_exist: res.rows.length > MAX_ROWS,
          ...(text.length > MAX_TEXT ? { cut_off: true, rows: text.slice(0, MAX_TEXT) } : { rows }),
        };
      });
    }
    return { error: `Unknown tool ${name}` };
  } catch (e) {
    // Postgres error messages help the model fix its SQL; strip anything from the connection
    let detail = String((e as Error).message ?? e).slice(0, 200);
    for (const secret of pgSecrets(source)) detail = detail.split(secret).join("***");
    return { error: "The query failed", detail };
  }
}
