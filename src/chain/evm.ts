// Each agent's foreign-chain wallets. Addresses are derived from (contract, token path),
// so they belong to the token, not to whoever holds it today.
import "../shims/buffer";
import { chainAdapters, contracts, utils, type MPCSignature } from "chainsig.js";
import { createPublicClient, http, keccak256, parseEther, serializeTransaction, type Hex } from "viem";
import { sepolia } from "viem/chains";
import { CONTRACT_ID, MPC_CONTRACT_ID, SEPOLIA_RPC, SIGN_GAS, tokenPath } from "./config";
import { call } from "./wallet";

const { toRSV, uint8ArrayToHex } = utils.cryptography;

const mpc = new contracts.ChainSignatureContract({ networkId: "testnet", contractId: MPC_CONTRACT_ID });
export const publicClient = createPublicClient({ chain: sepolia, transport: http(SEPOLIA_RPC) });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Evm = new chainAdapters.evm.EVM({ publicClient: publicClient as any, contract: mpc });
const Btc = new chainAdapters.btc.Bitcoin({
  network: "testnet",
  contract: mpc,
  btcRpcAdapter: new chainAdapters.btc.BTCRpcAdapters.Mempool("https://mempool.space/testnet4/api"),
});

const cache = new Map<string, Promise<string>>();
const memo = (key: string, fn: () => Promise<string>) => {
  if (!cache.has(key)) cache.set(key, fn().catch((e) => (cache.delete(key), Promise.reject(e))));
  return cache.get(key)!;
};

export const ethAddress = (tokenId: string) =>
  memo(`eth/${tokenId}`, async () => (await Evm.deriveAddressAndPublicKey(CONTRACT_ID, tokenPath(tokenId))).address) as Promise<Hex>;

export const btcAddress = (tokenId: string) =>
  memo(`btc/${tokenId}`, async () => (await Btc.deriveAddressAndPublicKey(CONTRACT_ID, tokenPath(tokenId))).address);

export const ethBalance = (address: Hex) => publicClient.getBalance({ address });

// Owner withdrawal: the contract rebuilds and hashes the same fields, the MPC network
// signs, and we broadcast the result to Sepolia. Returns the Sepolia tx hash.
export async function ownerSend(tokenId: string, to: Hex, amountEth: string): Promise<Hex> {
  const from = await ethAddress(tokenId);
  const { transaction, hashesToSign } = await Evm.prepareTransactionForSigning({
    from,
    to,
    value: parseEther(amountEth),
  });
  const tx = transaction as typeof transaction & {
    nonce: number;
    gas: bigint;
    maxFeePerGas: bigint;
    maxPriorityFeePerGas: bigint;
    value: bigint;
  };
  const expected = keccak256(serializeTransaction({ ...tx, type: "eip1559", accessList: [] }));
  if (expected.slice(2) !== uint8ArrayToHex(hashesToSign[0])) throw new Error("Prepared transaction hash mismatch");

  const { result } = await call<MPCSignature>(
    "owner_sign_evm",
    {
      token_id: tokenId,
      tx: {
        chain_id: String(tx.chainId),
        nonce: String(tx.nonce),
        max_priority_fee_per_gas: tx.maxPriorityFeePerGas.toString(),
        max_fee_per_gas: tx.maxFeePerGas.toString(),
        gas_limit: tx.gas.toString(),
        to,
        value: tx.value.toString(),
        data: null,
      },
    },
    { gas: SIGN_GAS },
  );
  if (!result) throw new Error("No signature returned (the wallet may not report results)");
  const signed = Evm.finalizeTransactionSigning({ transaction, rsvSignatures: [toRSV(result)] });
  const { hash } = await Evm.broadcastTx(signed);
  return hash as Hex;
}
