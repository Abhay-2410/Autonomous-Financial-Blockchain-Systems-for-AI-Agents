/**
 * Backfill custodial Stellar Testnet accounts onto wallets that still have demo 0x addresses.
 */

import { updateItem } from "./dynamo";
import { Keys, type AgentWallet, type ParentWallet } from "./schema";
import { provisionStellarAccount, STELLAR } from "./stellar";

export async function ensureParentStellar(
  parent: ParentWallet
): Promise<ParentWallet> {
  if (parent.stellarSecretEnc && parent.address?.startsWith("G")) {
    return parent;
  }
  const provisioned = await provisionStellarAccount(`parent:${parent.walletId}`);
  const updated = await updateItem<ParentWallet>({
    keys: Keys.parentWallet(parent.walletId),
    set: [
      "address = :addr",
      "stellarSecretEnc = :enc",
      "chainId = :cid",
      "tokenSymbol = :sym",
      "chainName = :name",
    ],
    expressionAttributeValues: {
      ":addr": provisioned.publicKey,
      ":enc": provisioned.sealedSecret,
      ":cid": STELLAR.chainId,
      ":sym": STELLAR.tokenSymbol,
      ":name": STELLAR.chainName,
    },
  });
  return (
    updated ?? {
      ...parent,
      address: provisioned.publicKey,
      stellarSecretEnc: provisioned.sealedSecret,
      chainId: STELLAR.chainId,
      tokenSymbol: STELLAR.tokenSymbol,
      chainName: STELLAR.chainName,
    }
  );
}

export async function ensureAgentStellar(
  agent: AgentWallet
): Promise<AgentWallet> {
  if (agent.stellarSecretEnc && agent.address?.startsWith("G")) {
    return agent;
  }
  const provisioned = await provisionStellarAccount(`agent:${agent.agentId}`);
  const updated = await updateItem<AgentWallet>({
    keys: Keys.agentWallet(agent.walletId, agent.agentId),
    set: [
      "address = :addr",
      "stellarSecretEnc = :enc",
      "chainId = :cid",
      "tokenSymbol = :sym",
      "chainName = :name",
    ],
    expressionAttributeValues: {
      ":addr": provisioned.publicKey,
      ":enc": provisioned.sealedSecret,
      ":cid": STELLAR.chainId,
      ":sym": STELLAR.tokenSymbol,
      ":name": STELLAR.chainName,
    },
  });
  return (
    updated ?? {
      ...agent,
      address: provisioned.publicKey,
      stellarSecretEnc: provisioned.sealedSecret,
      chainId: STELLAR.chainId,
      tokenSymbol: STELLAR.tokenSymbol,
      chainName: STELLAR.chainName,
    }
  );
}
