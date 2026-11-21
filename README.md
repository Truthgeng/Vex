# Vex

Check if an early crypto project's traction is real or farmed, and pay for it from a capped Altana tab instead of handing anyone your keys.

Built for the Agents Open for Business hackathon (Loops House, Celo), Altana Agent Wallets track.

## The job it does

Before a KOL takes a paid post, or a community strategist pitches a project, they need to know if the buzz is real. Vex reads who is posting about the project on X and how its token moves on Celo, then scores it with fixed rules.

The person paying never gives the agent their keys. They open a **tab**: an Altana session on their own wallet that lets the agent move USDC only, up to a daily cap, until an expiry date. Altana enforces all three onchain. The user can close the tab at any time.

## How a check works

1. The user creates an Altana wallet with a passkey (Face ID or Touch ID) and funds it with USDC on Celo.
2. They open a tab for Vex: for example 1 USDC a day for 7 days, `USDC.transfer` only.
3. For each check, the agent charges the check price from the tab in one tagged USDC transfer. If that charge breaks the cap, the allowlist or the expiry, Altana reverts it and the check never runs.
4. The agent buys the data it needs through [buy](https://usebuy.ai): X post search and a Chainstack Celo RPC read. Every payment is listed on the report with its Celo transaction.
5. If no data comes back at all, the charge is refunded in a tagged transfer.

## Two payment modes

- **tab (default):** one capped charge per check from the user's wallet, then the agent pays the services from its own wallet. The cap is enforced onchain on every charge.
- **direct (`PAY_MODE=direct`, experimental):** the agent pays each service straight from the user's wallet with an ERC-1271 x402 signature (`fetchWithX402`). This needs one more setup call (USDC approved as signature checker). We have not confirmed that the session's spend cap applies to signed payments, since the cap governs executed calls, so in this mode the code checks the price before signing and refuses anything over the per-call maximum. Ask Altana before turning it on for anyone else.

## Setup

```bash
npm install
cp .env.example .env.local
npm run keys          # paste the two keys into .env.local
npm run dev           # demo mode, sample data
```

Going live on Celo mainnet:

1. Create the GitHub repo, then enroll on Loops House. Put the code you get in `ATTRIBUTION_CODE` **before any transaction**.
2. Send about 1 USDC on Celo to the agent wallet that `npm run keys` printed. It pays the services and its own gas in USDC.
3. Deploy (Vercel), set the same env vars there with `MOCK=0`, and set `PUBLIC_URL`.
4. `npm run register` mints the ERC-8004 identity. Set `AGENT_ID` to the id it prints and redeploy.
5. Add the agent wallet to your hackathon entry.

## Test from the terminal first

```bash
npm run cli -- wallet            # shows your test Altana wallet, fund it
npm run cli -- open-tab 1 7      # up to 1 USDC a day, 7 days
npm run cli -- check celo 0x471EcE3750Da237f93B8E339c536989b8978a438
npm run cli -- close-tab
```

## Onchain proof

| What | Where |
|---|---|
| Agent wallet | to fill in |
| ERC-8004 identity | to fill in |
| A tab being opened | to fill in |
| A check charged from a tab | to fill in |
| Paid data calls | listed on every report |

## Open questions for Altana

- Does `execute` with a session keep our ERC-8021 suffix in the final transaction so it is credited?
- Does the session's spend cap bound ERC-1271 x402 signatures, or only executed calls?
- Does `fetchWithX402` work with Celo's facilitator and the buy gateway for Celo USDC?
