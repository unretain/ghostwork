// Deployment settings. Override in .env.local to point at your own deployment.
// VITE_NETWORK picks the NEAR network: "testnet" (default) or "mainnet".
export const NETWORK: "testnet" | "mainnet" = import.meta.env.VITE_NETWORK === "mainnet" ? "mainnet" : "testnet";
const MAINNET = NETWORK === "mainnet";
// The two public deployments. VITE_CONTRACT_ID and VITE_AGENT_URL point the site at your own.
export const CONTRACT_ID: string = import.meta.env.VITE_CONTRACT_ID ?? (MAINNET ? "ghostwork.unretain.near" : "ghostwork-1b3a.testnet");
/** The agent service that keeps the cards' instructions and does the jobs (hosted on Phala Cloud). */
export const AGENT_URL: string = (
  import.meta.env.VITE_AGENT_URL ?? (MAINNET ? "https://f7aa9451688b950f07d2d5a2de5981252d32cd92-3001.dstack-pha1-prod5.phala.network" : "https://f7aa9451688b950f07d2d5a2de5981252d32cd92-3000.dstack-pha1-prod5.phala.network")
).replace(/\/$/, "");
/** The same site on the other network, if it is hosted next to this one. */
export const OTHER_NETWORK_URL: string = import.meta.env.VITE_OTHER_NETWORK_URL ?? "";
/** Where this site is hosted, for the QR codes. Defaults to wherever it is being served from. */
const PUBLIC_URL: string = import.meta.env.VITE_PUBLIC_URL ?? "";

export const MPC_CONTRACT_ID = MAINNET ? "v1.signer" : "v1.signer-prod.testnet";
export const NEAR_RPC: string = import.meta.env.VITE_NEAR_RPC ?? (MAINNET ? "https://free.rpc.fastnear.com" : "https://test.rpc.fastnear.com");
/** Guest accounts come from the testnet faucet, so they only exist on testnet. */
export const GUESTS_AVAILABLE = !MAINNET;
export const FAUCET_URL = "https://helper.testnet.near.org/account";
export const SEPOLIA_RPC = import.meta.env.VITE_SEPOLIA_RPC ?? "https://ethereum-sepolia-rpc.publicnode.com";
export const SEPOLIA_EXPLORER = "https://sepolia.etherscan.io";
export const NEAR_EXPLORER = MAINNET ? "https://nearblocks.io" : "https://testnet.nearblocks.io";

export const MINT_DEPOSIT_YOCTO = "100000000000000000000000"; // 0.1 NEAR, unused part is refunded
export const SIGN_GAS = "300000000000000"; // 300 Tgas for anything that reaches the MPC signer
export const CALL_GAS = "30000000000000";
export const MINT_GAS = "50000000000000";

export const tokenPath = (tokenId: string) => `ghostwork/card/${tokenId}`;

export const cardUrl = (tokenId: string) => {
  const base = PUBLIC_URL || window.location.origin + window.location.pathname;
  return `${base.replace(/#.*$/, "")}#/card/${tokenId}`;
};
