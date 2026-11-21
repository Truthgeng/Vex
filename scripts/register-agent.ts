import { parseAbi, parseEventLogs } from "viem";
import { USDC_FEE_CURRENCY } from "../lib/config";
import { agentAccount, agentWalletClient, publicClient } from "../lib/server/agent";

// Mints the agent's ERC-8004 identity on Celo mainnet, from the agent wallet,
// with the attribution tag on the transaction. Run once, after ATTRIBUTION_CODE
// and PUBLIC_URL are set. Usage: npm run register

const REGISTRY = "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432";
const abi = parseAbi([
  "function register(string agentURI) returns (uint256)",
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
]);

async function main() {
  const url = process.env.PUBLIC_URL;
  if (!url) throw new Error("Set PUBLIC_URL to your live site first, e.g. https://vex.vercel.app");
  const agentURI = `${url.replace(/\/$/, "")}/agent.json`;
  const account = agentAccount();
  console.log(`Registering ${agentURI} from ${account.address}`);

  const hash = await agentWalletClient().writeContract({
    address: REGISTRY,
    abi,
    functionName: "register",
    args: [agentURI],
    feeCurrency: USDC_FEE_CURRENCY,
  });
  const receipt = await publicClient().waitForTransactionReceipt({ hash });
  // The identity is an ERC-721: read the id from the mint, not from a simulated return value
  const minted = parseEventLogs({ abi, eventName: "Transfer", logs: receipt.logs }).find(
    (l) => l.address.toLowerCase() === REGISTRY.toLowerCase() && BigInt(l.args.from) === 0n,
  );
  console.log(`tx: https://celoscan.io/tx/${hash}`);
  if (!minted) throw new Error("Registered, but couldn't read the agent id. Look it up on 8004scan.io");
  console.log(`Agent id: ${minted.args.tokenId}. Set AGENT_ID=${minted.args.tokenId} and redeploy.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
