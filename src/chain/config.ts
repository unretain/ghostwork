// Deployment settings. Override in .env.local to point at your own deployment.
// VITE_NETWORK picks the NEAR network: "testnet" (default) or "mainnet".
export const NETWORK: "testnet" | "mainnet" = import.meta.env.VITE_NETWORK === "mainnet" ? "mainnet" : "testnet";
const MAINNET = NETWORK === "mainnet";
export const CONTRACT_ID: string = import.meta.env.VITE_CONTRACT_ID ?? "ghostwork-1b3a.testnet";
/** The TEE agent that holds sealed skills and does the jobs. */
export const AGENT_URL: string = (import.meta.env.VITE_AGENT_URL ?? "http://localhost:3000").replace(/\/$/, "");
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
