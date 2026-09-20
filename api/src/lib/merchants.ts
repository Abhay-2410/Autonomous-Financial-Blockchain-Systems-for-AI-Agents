/**
 * Merchant directory — maps friendly names to payout addresses (demo).
 * Agents may only pay merchants on their allow-list; this registry supplies addresses.
 */

import { demoAddressFromSeed, DEMO_CHAIN } from "./chain";

export interface Merchant {
  id: string;
  name: string;
  category: string;
  address: string;
  chainId: number;
  tokenSymbol: string;
}

const MERCHANT_SEEDS: Array<{ id: string; name: string; category: string }> = [
  { id: "Amazon", name: "Amazon", category: "Shopping" },
  { id: "Flipkart", name: "Flipkart", category: "Shopping" },
  { id: "VendorA", name: "Vendor A", category: "B2B" },
  { id: "VendorB", name: "Vendor B", category: "B2B" },
];

export function listMerchants(): Merchant[] {
  return MERCHANT_SEEDS.map((m) => ({
    ...m,
    address: demoAddressFromSeed(`merchant:${m.id}`),
    chainId: DEMO_CHAIN.chainId,
    tokenSymbol: DEMO_CHAIN.tokenSymbol,
  }));
}

export function getMerchantByName(name: string): Merchant | undefined {
  return listMerchants().find(
    (m) => m.id.toLowerCase() === name.toLowerCase() || m.name.toLowerCase() === name.toLowerCase()
  );
}
