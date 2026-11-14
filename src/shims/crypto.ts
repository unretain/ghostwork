// Browser stand-in for Node's `crypto.createHash`, which chainsig.js imports for
// chains this app doesn't use (sha256 / sha512 / ripemd160 only).
import { ripemd160 } from "@noble/hashes/legacy";
import { sha256, sha512 } from "@noble/hashes/sha2";

const algorithms = { sha256, sha512, ripemd160 } as const;

export function createHash(name: string) {
  const fn = algorithms[name.toLowerCase() as keyof typeof algorithms];
  if (!fn) throw new Error(`createHash: unsupported algorithm ${name}`);
  const h = fn.create();
  const api = {
    update(data: Uint8Array | string) {
      h.update(typeof data === "string" ? new TextEncoder().encode(data) : data);
      return api;
    },
    digest() {
      return h.digest();
    },
  };
  return api;
}

export default { createHash };
