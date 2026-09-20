/**
 * Demo chain identity for LimitX Pay.
 * Settlement is still stubbed, but every wallet has a Base Sepolia–style address
 * and explorer URLs so the product reads as a blockchain payments app.
 */

export const DEMO_CHAIN = {
  chainId: 84532,
  name: "Base Sepolia",
  tokenSymbol: "USDC",
  explorerTx: "https://sepolia.basescan.org/tx/",
  explorerAddress: "https://sepolia.basescan.org/address/",
  /** Demo-only: not a live RPC settlement yet */
  settlementMode: "stub" as const,
};

/** Deterministic 0x address from a seed string (demo identity, not a real key). */
export function demoAddressFromSeed(seed: string): string {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let hex = (h >>> 0).toString(16).padStart(8, "0");
  while (hex.length < 40) {
    h = Math.imul(h ^ hex.length, 16777619);
    hex += (h >>> 0).toString(16).padStart(8, "0");
  }
  return `0x${hex.slice(0, 40)}`;
}

export function explorerTxUrl(txHash: string): string {
  const hash = txHash.startsWith("0x") ? txHash : `0x${txHash.replace(/-/g, "")}`;
  return `${DEMO_CHAIN.explorerTx}${hash}`;
}

export function explorerAddressUrl(address: string): string {
  return `${DEMO_CHAIN.explorerAddress}${address}`;
}

/** Stub tx hash that looks like an EVM hash. */
export function stubTxHash(seed?: string): string {
  const base = demoAddressFromSeed(seed ?? `${Date.now()}-${Math.random()}`).slice(2);
  const extra = demoAddressFromSeed(`tx:${base}`).slice(2, 26);
  return `0x${base}${extra}`;
}
