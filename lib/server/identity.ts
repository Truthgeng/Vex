import { erc20Abi, formatUnits, parseAbi, parseEventLogs } from "viem";
import { CELO_USDC, USDC_FEE_CURRENCY } from "../config";
import { agentAccount, agentWalletClient, publicClient } from "./agent";
import { getIdentity, saveIdentity, type Identity } from "./store";

/** ERC-8004 Identity Registry on Celo mainnet. */
export const REGISTRY = "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432" as const;

const abi = parseAbi([
  "function register(string agentURI) returns (uint256)",
  "function balanceOf(address owner) view returns (uint256)",
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
]);

export const agentURI = (origin: string) => `${origin.replace(/\/$/, "")}/agent.json`;

/** What the agent wallet holds and whether it already has an identity. */
export async function identityStatus() {
  const address = agentAccount().address;
  const pc = publicClient();
  const [usdcUnits, celoWei, owned, saved] = await Promise.all([
    pc.readContract({ address: CELO_USDC, abi: erc20Abi, functionName: "balanceOf", args: [address] }),
    pc.getBalance({ address }),
    pc.readContract({ address: REGISTRY, abi, functionName: "balanceOf", args: [address] }),
    getIdentity(),
  ]);
  return {
    agent: address,
    registry: REGISTRY,
    usdc: formatUnits(usdcUnits, 6),
    celo: formatUnits(celoWei, 18),
    registered: owned > 0n,
    identity: saved,
    canPayGas: usdcUnits >= 20_000n || celoWei >= 10n ** 16n,
  };
}

/**
 * Mints the identity from the agent wallet, tagged with the attribution code.
 * Does nothing if the wallet already owns one, so running it twice is safe.
 */
export async function registerIdentity(origin: string): Promise<Identity | { skipped: string }> {
  const status = await identityStatus();
  if (status.registered) return { skipped: "This wallet already has an ERC-8004 identity." };
  if (!status.canPayGas) throw new Error(`Agent wallet ${status.agent} has no gas. Send it about 1 USDC on Celo first.`);

  const uri = agentURI(process.env.PUBLIC_URL || origin);
  // Pay gas in CELO if the wallet has it, otherwise in USDC through the fee adapter
  const useUsdc = BigInt(Math.round(Number(status.celo) * 1e18)) < 10n ** 16n;
  const hash = await agentWalletClient().writeContract({
    address: REGISTRY,
    abi,
    functionName: "register",
    args: [uri],
    ...(useUsdc ? { feeCurrency: USDC_FEE_CURRENCY } : {}),
  });
  const receipt = await publicClient().waitForTransactionReceipt({ hash, timeout: 50_000 });
  if (receipt.status !== "success") throw new Error(`Registration reverted: https://celoscan.io/tx/${hash}`);
  const minted = parseEventLogs({ abi, eventName: "Transfer", logs: receipt.logs }).find(
    (l) => l.address.toLowerCase() === REGISTRY.toLowerCase() && BigInt(l.args.from) === 0n,
  );
  const identity: Identity = {
    agentId: minted ? minted.args.tokenId.toString() : "",
    tx: hash,
    at: new Date().toISOString(),
    uri,
  };
  await saveIdentity(identity);
  return identity;
}
