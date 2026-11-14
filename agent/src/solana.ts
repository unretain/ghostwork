// Data source: a Solana Yellowstone gRPC endpoint (a paid, token-gated live feed).
//
// The card owner's endpoint and token are sealed with the card. The model never
// sees them: it can only ask for one of the tools below, this code makes the call
// with the owner's token, and only the result goes back to the model.
import grpc from "@grpc/grpc-js";
import loader from "@grpc/proto-loader";
import { fileURLToPath } from "node:url";

export type SolanaSource = { type: "solana-yellowstone-grpc"; endpoint: string; token: string };

const PROTO_DIR = fileURLToPath(new URL("../proto", import.meta.url));
const definition = loader.loadSync("geyser.proto", { keepCase: true, longs: String, enums: String, defaults: true, includeDirs: [PROTO_DIR] });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Geyser = (grpc.loadPackageDefinition(definition) as any).geyser.Geyser;

const KNOWN_PROGRAMS: Record<string, string> = {
  "11111111111111111111111111111111": "System Program",
  TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA: "SPL Token",
  TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb: "Token-2022",
  ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL: "Associated Token Account",
  ComputeBudget111111111111111111111111111111: "Compute Budget",
  Vote111111111111111111111111111111111111111: "Vote Program",
  JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4: "Jupiter v6",
  "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8": "Raydium AMM v4",
  CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK: "Raydium CLMM",
  whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc: "Orca Whirlpools",
  "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P": "Pump.fun",
  pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA: "PumpSwap AMM",
  MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr: "Memo",
  metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s: "Metaplex Token Metadata",
  LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo: "Meteora DLMM",
  dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH: "Drift",
};

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function base58(bytes: Uint8Array): string {
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  let out = "";
  while (n > 0n) {
    out = B58[Number(n % 58n)] + out;
    n /= 58n;
  }
  for (const b of bytes) {
    if (b !== 0) break;
    out = "1" + out;
  }
  return out;
}
const isAddress = (s: unknown): s is string => typeof s === "string" && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s);
const clamp = (v: unknown, lo: number, hi: number, dflt: number) => Math.min(hi, Math.max(lo, Number.isFinite(Number(v)) ? Number(v) : dflt));
const label = (id: string) => (KNOWN_PROGRAMS[id] ? `${KNOWN_PROGRAMS[id]} (${id})` : id);

function connect(source: SolanaSource) {
  const client = new Geyser(source.endpoint, grpc.credentials.createSsl(), { "grpc.max_receive_message_length": 64 * 1024 * 1024 });
  const meta = new grpc.Metadata();
  meta.add("x-token", source.token);
  return { client, meta };
}

function unary<T>(source: SolanaSource, method: string, request: object): Promise<T> {
  const { client, meta } = connect(source);
  return new Promise<T>((resolve, reject) =>
    client[method](request, meta, { deadline: Date.now() + 15_000 }, (err: Error | null, res: T) => {
      client.close();
      err ? reject(err) : resolve(res);
    }),
  );
}

// Open the live stream with a filter, collect updates for `seconds`, then close it.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function sample(source: SolanaSource, filter: object, seconds: number, onUpdate: (u: any) => boolean | void): Promise<void> {
  const { client, meta } = connect(source);
  return new Promise((resolve, reject) => {
    const stream = client.Subscribe(meta);
    let done = false;
    const finish = (err?: Error) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      stream.cancel();
      client.close();
      err ? reject(err) : resolve();
    };
    const timer = setTimeout(() => finish(), seconds * 1000);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    stream.on("data", (u: any) => {
      if (!done && onUpdate(u) === true) finish();
    });
    stream.on("error", (e: Error & { code?: number }) => (e.code === grpc.status.CANCELLED ? finish() : finish(e)));
    stream.write({
      accounts: {},
      slots: {},
      transactions: {},
      transactions_status: {},
      blocks: {},
      blocks_meta: {},
      entry: {},
      accounts_data_slice: [],
      commitment: "CONFIRMED",
      ...filter,
    });
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function programsOf(tx: any): string[] {
  const message = tx.transaction?.message;
  if (!message) return [];
  const keys: string[] = [
    ...message.account_keys.map((k: Uint8Array) => base58(k)),
    ...(tx.meta?.loaded_writable_addresses ?? []).map((k: Uint8Array) => base58(k)),
    ...(tx.meta?.loaded_readonly_addresses ?? []).map((k: Uint8Array) => base58(k)),
  ];
  const ids = new Set<string>();
  for (const ix of message.instructions ?? []) if (keys[ix.program_id_index]) ids.add(keys[ix.program_id_index]);
  return [...ids];
}

type Args = Record<string, unknown>;

const TOOLS = {
  chain_status: {
    description: "Current Solana mainnet slot, block height and the node's version.",
    parameters: { type: "object", properties: {} },
    run: async (source: SolanaSource) => {
      const [slot, height, version] = await Promise.all([
        unary<{ slot: string }>(source, "GetSlot", { commitment: "CONFIRMED" }),
        unary<{ block_height: string }>(source, "GetBlockHeight", { commitment: "CONFIRMED" }),
        unary<{ version: string }>(source, "GetVersion", {}),
      ]);
      let node: unknown = version.version;
      try {
        node = JSON.parse(version.version).version;
      } catch {
        /* keep the raw string */
      }
      return { slot: Number(slot.slot), block_height: Number(height.block_height), node };
    },
  },
  network_activity: {
    description:
      "Measure live network throughput: watches confirmed blocks for a few seconds and reports blocks seen, transactions per block and transactions per second (vote transactions included).",
    parameters: { type: "object", properties: { seconds: { type: "number", description: "How long to watch, 3 to 10. Default 5." } } },
    run: async (source: SolanaSource, args: Args) => {
      const seconds = clamp(args.seconds, 3, 10, 5);
      const blocks: { slot: number; txs: number }[] = [];
      await sample(source, { blocks_meta: { all: {} } }, seconds, (u) => {
        if (u.block_meta) blocks.push({ slot: Number(u.block_meta.slot), txs: Number(u.block_meta.executed_transaction_count) });
      });
      const total = blocks.reduce((a, b) => a + b.txs, 0);
      return {
        watched_seconds: seconds,
        blocks_seen: blocks.length,
        first_slot: blocks[0]?.slot ?? null,
        last_slot: blocks[blocks.length - 1]?.slot ?? null,
        transactions: total,
        transactions_per_second: Math.round(total / seconds),
        average_transactions_per_block: blocks.length ? Math.round(total / blocks.length) : 0,
        seconds_per_block: blocks.length ? Number((seconds / blocks.length).toFixed(2)) : null,
      };
    },
  },
  top_programs: {
    description:
      "Which programs are being used right now: watches all non-vote transactions for a few seconds and ranks programs by how many transactions called them. Also reports how many transactions failed and the average fee.",
    parameters: { type: "object", properties: { seconds: { type: "number", description: "How long to watch, 2 to 6. Default 3." } } },
    run: async (source: SolanaSource, args: Args) => {
      const seconds = clamp(args.seconds, 2, 6, 3);
      const counts = new Map<string, number>();
      let total = 0,
        failed = 0,
        fees = 0n;
      await sample(source, { transactions: { all: { vote: false } } }, seconds, (u) => {
        const tx = u.transaction?.transaction;
        if (!tx) return;
        total++;
        if (tx.meta?.err) failed++;
        fees += BigInt(tx.meta?.fee ?? 0);
        for (const id of programsOf(tx)) counts.set(id, (counts.get(id) ?? 0) + 1);
      });
      const ranked = [...counts.entries()]
        .filter(([id]) => id !== "ComputeBudget111111111111111111111111111111")
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12)
        .map(([id, n]) => ({ program: label(id), transactions: n, share_percent: Number(((n / Math.max(1, total)) * 100).toFixed(1)) }));
      return {
        watched_seconds: seconds,
        non_vote_transactions: total,
        per_second: Math.round(total / seconds),
        failed_percent: Number(((failed / Math.max(1, total)) * 100).toFixed(1)),
        average_fee_lamports: total ? Number(fees / BigInt(total)) : 0,
        top_programs: ranked,
      };
    },
  },
  watch_address: {
    description:
      "Watch one wallet, token mint or program live: collects the transactions that touch the given address over a few seconds and returns each one's signature, slot, success, fee, the programs it called, and the SOL balance change of the address. Busy programs return many; quiet wallets may return none.",
    parameters: {
      type: "object",
      properties: {
        address: { type: "string", description: "Base58 Solana address (wallet, mint or program id)." },
        seconds: { type: "number", description: "How long to watch, 3 to 15. Default 8." },
        limit: { type: "number", description: "Stop after this many transactions, 1 to 25. Default 10." },
      },
      required: ["address"],
    },
    run: async (source: SolanaSource, args: Args) => {
      if (!isAddress(args.address)) return { error: "address must be a base58 Solana address" };
      const address = args.address;
      const seconds = clamp(args.seconds, 3, 15, 8);
      const limit = clamp(args.limit, 1, 25, 10);
      const seen: object[] = [];
      await sample(source, { transactions: { watch: { vote: false, account_include: [address] } } }, seconds, (u) => {
        const tx = u.transaction?.transaction;
        if (!tx) return;
        const keys: string[] = (tx.transaction?.message?.account_keys ?? []).map((k: Uint8Array) => base58(k));
        const i = keys.indexOf(address);
        const change = i >= 0 && tx.meta ? (Number(tx.meta.post_balances[i]) - Number(tx.meta.pre_balances[i])) / 1e9 : null;
        seen.push({
          signature: base58(tx.signature),
          slot: Number(u.transaction.slot),
          ok: !tx.meta?.err,
          fee_sol: Number(tx.meta?.fee ?? 0) / 1e9,
          payer: keys[0],
          // names where known, otherwise the first characters of the program id
          programs: programsOf(tx)
            .filter((id) => id !== address && id !== "ComputeBudget111111111111111111111111111111")
            .map((id) => KNOWN_PROGRAMS[id] ?? `${id.slice(0, 8)}…`),
          sol_change: change,
        });
        return seen.length >= limit;
      });
      const all = seen as { ok: boolean; fee_sol: number }[];
      return {
        address: label(address),
        watched_seconds: seconds,
        transactions_seen: all.length,
        succeeded: all.filter((t) => t.ok).length,
        failed: all.filter((t) => !t.ok).length,
        average_fee_sol: all.length ? Number((all.reduce((a, t) => a + t.fee_sol, 0) / all.length).toFixed(9)) : 0,
        transactions: seen,
      };
    },
  },
} satisfies Record<string, { description: string; parameters: object; run: (s: SolanaSource, a: Args) => Promise<object> }>;

/** Tool definitions in the shape chat-completion APIs expect. */
export const solanaToolSpecs = Object.entries(TOOLS).map(([name, t]) => ({
  type: "function" as const,
  function: { name, description: t.description, parameters: t.parameters },
}));

export async function runSolanaTool(source: SolanaSource, name: string, args: Args): Promise<object> {
  const tool = (TOOLS as Record<string, (typeof TOOLS)[keyof typeof TOOLS]>)[name];
  if (!tool) return { error: `Unknown tool ${name}` };
  try {
    return await tool.run(source, args);
  } catch (e) {
    // never echo the endpoint or token back to the model
    return { error: "The data source did not answer. Try again." , detail: String((e as Error).message ?? e).split(source.token).join("***").slice(0, 160) };
  }
}
