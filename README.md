# Vex

Check if an early crypto project's traction is real or farmed, and pay for it from a capped Altana tab instead of handing anyone your keys.

Built for the Agents Open for Business hackathon (Loops House, Celo), Altana Agent Wallets track.

## The job it does

A KOL or community strategist puts their name behind projects. If a project's buzz turns out to be bots and farmed wallets, their reputation takes the hit. Vex watches the projects they promote or are about to take deals from, re-checks them every day, and messages them on Telegram when something changes.

Vex pays for its own checks, so it needs money it can spend while the user is away. It never gets their keys. The user opens a **tab**: an Altana session on their own wallet that lets Vex move USDC only, up to a daily cap, until an expiry date. Altana enforces all three onchain. The user can close the tab or withdraw at any time.

## How it works

1. The user creates an Altana wallet with a passkey (Face ID or Touch ID) and funds it with USDC on Celo.
2. They open a tab for Vex: for example 1 USDC a day for 7 days, `USDC.transfer` only. The site registers it and gives that browser an owner token, so knowing a wallet address is not enough to spend from its tab.
3. They add projects to their watchlist (an X handle, a Celo token, or both). The first check runs straight away and becomes the baseline.
4. Every day Vercel Cron calls `/api/cron`, and Vex decides how much to spend on each watch (see below). Each purchase is one USDC transfer from that user's tab, tagged by Altana. If a charge breaks the cap, the allowlist or the expiry, Altana refuses it and the watch pauses.
5. Vex buys the data through [buy](https://usebuy.ai): X post search and a Chainstack Celo RPC read. Every payment is listed with its Celo transaction.
6. If a verdict flips or a score moves 15 points or more, Vex sends a Telegram alert with the reasons.
7. Every charged check appears on [/proof](https://vex-black.vercel.app/proof) with its transaction, marked as run on schedule or by the user.

## How Vex decides what to spend

A deep check costs five times a scan, so Vex doesn't buy one every day. The rules are fixed in `lib/server/watcher.ts`, so the same numbers always lead to the same decision:

1. **Deep check straight away** when there is no baseline yet, the watch has no X handle, a scan asked for one yesterday, or a week has passed since the last one.
2. **Otherwise a scan** (one X search, 0.01 USDC), compared with the last deep check: post volume up 60%+, new or tiny accounts up 15 points, copy-paste posts up 15 points, or the top 3 accounts up 20 points.
3. **Nothing moved:** stop. **Something moved:** read today's remaining allowance from the user's account on Celo. If a deep check fits, buy it. If not, say so, alert the user, and go deep on the next run.

Each decision is written in plain words to the activity feed, the watch, and the Telegram alert, which reads like an incident report: what changed, what made Vex look closer, what it bought, what it cost, and the transactions.

## Proof the cap is real

"Test the cap" (on the site) or `npm run cli -- cap-test` asks Altana to move 0.01 USDC more than the tab has left today, with the same session key and call Vex uses for every check. The account should refuse it. Every live result, refused or not, is listed on `/proof` with the cap and amount spent read from the chain. If a test ever went through, the code refunds it at once and the proof page says so.

## Two payment modes

- **tab (default):** one capped charge per check from the user's wallet, then the agent pays the services from its own wallet. The cap is enforced onchain on every charge.
- **direct (`PAY_MODE=direct`, experimental):** the agent pays each service straight from the user's wallet with an ERC-1271 x402 signature (`fetchWithX402`). This needs one more setup call (USDC approved as signature checker). Since Altana SDK 1.2.0 the SDK checks the session's cap before signing, but that check runs in the SDK, not onchain, and its count of signed payments lives in memory. On serverless hosting it starts from zero on each new process, so tab mode stays the default: its charges go through `execute`, where the chain enforces the cap.

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
3. In Vercel: connect Upstash Redis (Storage), set the env vars from `.env.example` with `MOCK=0`, and set `PUBLIC_URL`.
3b. Telegram: make a bot with @BotFather, set the three `TELEGRAM_*` vars, then run `npm run telegram` once.
4. `npm run register` mints the ERC-8004 identity. Set `AGENT_ID` to the id it prints and redeploy.
5. Add the agent wallet to your hackathon entry.

## Test from the terminal first

```bash
npm run cli -- wallet            # shows your test Altana wallet, fund it
npm run cli -- open-tab 1 7      # up to 1 USDC a day, 7 days
npm run cli -- check celo 0x471EcE3750Da237f93B8E339c536989b8978a438
npm run cli -- decide celo       # the daily decision: scan, deep only if something moved
npm run cli -- cap-test          # should be refused
npm run cli -- close-tab
```

Tests: `npm test` (decision rules and alert rules).

## Onchain proof

| What | Where |
|---|---|
| Agent wallet | to fill in |
| ERC-8004 identity | to fill in |
| A tab being opened | to fill in |
| A check charged from a tab | to fill in |
| Paid data calls | listed on every report |

## Attribution

Altana SDK 1.2.0 tags every transaction it sends with ERC-8021. Vex passes `appCode: ["vex", ATTRIBUTION_CODE]`, so tab charges, tab opens, closes and withdrawals all end with `altana,vex,<hackathon code>`. The agent's own wallet (refunds, ERC-8004 registration) tags with `@celo/attribution-tags`.

## Still to confirm on mainnet

- `fetchWithX402` with Celo's facilitator and the buy gateway for Celo USDC (only matters for direct mode).
