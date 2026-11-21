import { createClient, CELO, signerFromPrivateKey, deserializeSession, type Session, type SerializedSession } from "@altananetwork/sdk";
import { createPublicClient, createWalletClient, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { celo } from "viem/chains";
import { withAttribution } from "@celo/attribution-tags";
import { attributionCode } from "./attribution";

/**
 * The agent has two keys, kept apart on purpose:
 *
 * - AGENT_PRIVATE_KEY: the agent's own wallet. Receives each check's fee from
 *   a user's tab, pays the data services, owns the ERC-8004 identity.
 * - AGENT_SESSION_KEY: the key users grant their Altana tab to. It can never
 *   hold money. It can only move USDC out of a user's wallet within the cap,
 *   allowlist and expiry the user set onchain.
 */

function key(name: string): Hex {
  const raw = process.env[name]?.trim();
  if (!raw) throw new Error(`${name} is not set. Run \`npm run keys\` to make one.`);
  return (raw.startsWith("0x") ? raw : `0x${raw}`) as Hex;
}

export const agentAccount = () => privateKeyToAccount(key("AGENT_PRIVATE_KEY"));
export const sessionSigner = () => signerFromPrivateKey(key("AGENT_SESSION_KEY"));

/** Altana client for Celo. Users are people, not agents, so no ERC-8004 identity is minted for their wallets. */
export const altana = () => createClient({ chains: [CELO], agentIdentity: false });

export const publicClient = () => createPublicClient({ chain: celo, transport: http(process.env.CELO_RPC_URL) });

/** A wallet client for the agent's own wallet that tags every transaction it sends. */
export const agentWalletClient = () =>
  createWalletClient({ account: agentAccount(), chain: celo, transport: http(process.env.CELO_RPC_URL) }).extend(
    withAttribution(attributionCode()),
  );

/**
 * Rebuilds a user's tab from the half the browser keeps. Refuses a session
 * that was granted to some other key, or that has run out.
 */
export function openTab(stored: SerializedSession): Session {
  const signer = sessionSigner();
  if (stored.publicKey.toLowerCase() !== signer.publicKey.toLowerCase()) {
    throw new TabError("This tab was opened for a different agent key. Open a new tab.");
  }
  if (stored.expiry * 1000 <= Date.now()) throw new TabError("Your tab has expired. Open a new one.");
  return deserializeSession(stored, signer);
}

/** An error the user should see as it is. */
export class TabError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}
