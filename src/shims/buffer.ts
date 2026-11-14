// chainsig.js (bitcoinjs) expects Node's global Buffer. Must be imported before chainsig.js.
import { Buffer } from "buffer";

const g = globalThis as unknown as { Buffer?: typeof Buffer };
if (!g.Buffer) g.Buffer = Buffer;
