import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

// Makes the agent's two keys. Paste the lines into .env.local and into Vercel.
// Never commit them, never send them to anyone.
const wallet = generatePrivateKey();
const session = generatePrivateKey();

console.log(`AGENT_PRIVATE_KEY=${wallet}`);
console.log(`AGENT_SESSION_KEY=${session}`);
console.log("");
console.log(`Agent wallet: ${privateKeyToAccount(wallet).address}`);
console.log("  Put about 1 USDC on Celo here. It pays the data services and gas (in USDC).");
console.log(`Session key address: ${privateKeyToAccount(session).address}`);
console.log("  Never fund this one. Users grant their tabs to it.");
