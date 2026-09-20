/**
 * Merchant directory — maps friendly names to payout addresses (demo).
 * Agents may only pay merchants on their allow-list; this registry supplies addresses.
 */

import { demoAddressFromSeed, DEMO_CHAIN } from "./chain";
import { keypairFromSeed, STELLAR } from "./stellar";

export interface Merchant {
  id: string;
  name: string;
  category: string;
  address: string;
  /** Stellar Testnet public key (G…) for settlementRail=stellar */
  stellarAddress: string;
  chainId: number;
  tokenSymbol: string;
  /** HTTPS storefront URL — required by Prava purchase_context */
  url: string;
}

const MERCHANT_SEEDS: Array<{
  id: string;
  name: string;
  category: string;
  url: string;
}> = [
  {
    id: "Amazon",
    name: "Amazon",
    category: "Shopping",
    url: "https://www.amazon.com",
  },
  {
    id: "Flipkart",
    name: "Flipkart",
    category: "Shopping",
    url: "https://www.flipkart.com",
  },
  {
    id: "DemoStore",
    name: "DemoStore",
    category: "Shopping",
    url: "https://books.toscrape.com",
  },
  {
    id: "VendorA",
    name: "Vendor A",
    category: "B2B",
    url: "https://vendor-a.example.com",
  },
  {
    id: "VendorB",
    name: "Vendor B",
    category: "B2B",
    url: "https://vendor-b.example.com",
  },
];

export async function listMerchants(): Promise<Merchant[]> {
  return Promise.all(
    MERCHANT_SEEDS.map(async (m) => {
      const stellar = await keypairFromSeed(`merchant-stellar:${m.id}`);
      return {
        ...m,
        address: demoAddressFromSeed(`merchant:${m.id}`),
        stellarAddress: stellar.publicKey(),
        chainId: DEMO_CHAIN.chainId,
        tokenSymbol: DEMO_CHAIN.tokenSymbol,
      };
    })
  );
}

export async function getMerchantByName(
  name: string
): Promise<Merchant | undefined> {
  const all = await listMerchants();
  return all.find(
    (m) =>
      m.id.toLowerCase() === name.toLowerCase() ||
      m.name.toLowerCase() === name.toLowerCase()
  );
}

/** Destination for a payment — Stellar G… when on stellar rail. */
export async function merchantPayoutAddress(
  merchantName: string,
  rail: "chain" | "prava" | "stellar"
): Promise<string | undefined> {
  const m = await getMerchantByName(merchantName);
  if (!m) return undefined;
  return rail === "stellar" ? m.stellarAddress : m.address;
}

export { STELLAR };
