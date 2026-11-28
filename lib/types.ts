export type Chain = "celo" | "ethereum";

export type CheckInput = {
  /** X handle without the @ */
  handle?: string;
  /** Token contract */
  contract?: `0x${string}`;
  /** Chain the token lives on. Transfer analysis is Celo only; holder tracking covers both */
  chain?: Chain;
};

/** One account posting about a project, with what makes it worth a look. */
export type Pusher = {
  author: string;
  posts: number;
  followers?: number;
  ageDays?: number;
  avgLikes?: number;
  /** Other watched projects this account posted about in the last 30 days */
  alsoPushed: string[];
  flags: string[];
};

export type Holder = { address: string; share: number; isContract: boolean; label?: string };

export type InsiderSnapshot = {
  chain: Chain;
  contract: string;
  symbol: string;
  holdersCount: number;
  deployer?: Holder;
  /** The 10 biggest wallets that are not contracts */
  top: Holder[];
  /** The biggest pooled holders: contracts (pools, lockers, bridges) and labelled exchange wallets */
  contracts: Holder[];
  topTenShare: number;
  at: string;
};

export type InsiderSignals = { snapshot: InsiderSnapshot; moves: string[]; sold: boolean };

/** One payment the agent made for data, with the Celo transaction that proves it. */
export type PaidCall = {
  service: string;
  /** USDC, 6-decimal units as a string */
  amount: string;
  txHash?: string;
  /** "agent" = paid from the agent's own wallet, "tab" = paid straight from the user's Altana wallet */
  paidFrom: "agent" | "tab";
  at: string;
};

/** The charge taken from the user's Altana wallet for this check. */
export type TabCharge = {
  wallet: string;
  amount: string;
  txHash?: string;
  refundTx?: string;
};

export type Post = {
  id: string;
  text: string;
  author: string;
  followers?: number;
  joined?: string;
  likes?: number;
};

export type SocialSignals = {
  posts: number;
  accounts: number;
  /** Share of posts written by the 3 loudest accounts, 0 to 1 */
  topThreeShare: number;
  /** Share of posts whose text repeats another post almost word for word */
  copyPasteShare: number;
  /** Share of posting accounts under 100 followers */
  tinyAccountShare: number;
  /** Share of posting accounts younger than 90 days */
  newAccountShare: number;
  sample: { author: string; text: string; url: string }[];
};

export type ChainSignals = {
  hours: number;
  transfers: number;
  wallets: number;
  /** Share of transfers touching the 10 busiest wallets */
  topTenShare: number;
  /** Share of transfers between wallet pairs that send both ways */
  backAndForthShare: number;
};

/** A project Vex keeps an eye on for one tab. */
export type Depth = "scan" | "deep";

export type Watch = {
  id: string;
  handle?: string;
  contract?: string;
  chain?: Chain;
  /** Holder snapshot from the last run: what the next one is compared to */
  insiders?: InsiderSnapshot | null;
  /** The full last deep report, for the detail view */
  lastReport?: Report;
  addedAt: string;
  lastCheckedAt?: string;
  /** Result of the last deep check, the one the verdict comes from */
  last?: { score: number; verdict: Verdict; reasons: string[] };
  lastDeepAt?: string;
  /** X signals from the last deep check: what each daily scan is compared to */
  baseline?: SocialSignals | null;
  /** Why Vex did what it did on its last run, in plain words */
  lastDecision?: string;
  /** A scan saw a change but the tab had no room left today: go deep next run */
  deepPending?: string;
  /** Set when automatic checks stopped, with the reason in plain words */
  paused?: string;
};

export type LogEntry = {
  at: string;
  kind: "check" | "alert" | "paused" | "refund" | "deferred";
  depth?: Depth;
  subject: string;
  score?: number;
  verdict?: Verdict;
  amount?: string;
  tx?: string;
  /** true when Vex ran it on its own schedule */
  auto: boolean;
  note?: string;
};

export type TabState = {
  wallet: string;
  session: import("@altananetwork/sdk").SerializedSession;
  watches: Watch[];
  log: LogEntry[];
  telegram: { linked: boolean; link?: string };
};

export type Verdict ="looks real" | "mixed" | "looks farmed" | "not enough data";

export type Report = {
  subject: string;
  score: number;
  verdict: Verdict;
  reasons: string[];
  social?: SocialSignals | null;
  chain?: ChainSignals | null;
  pushers?: Pusher[];
  insiders?: InsiderSignals | null;
  charge?: TabCharge;
  paidCalls: PaidCall[];
  mode: "mock" | "tab" | "direct";
  depth: Depth;
  at: string;
};

/** Read from the chain: what the tab's cap allows and what it has used this period. */
export type Allowance = { limit: string; spent: string; remaining: string; periodStart: number; source: "chain" | "demo" };

/** One attempt to charge past the cap, kept as proof that Altana refuses it. */
export type CapTest = {
  at: string;
  wallet: string;
  attempted: string;
  limit: string;
  spentBefore: string;
  refused: boolean;
  reason: string;
  tx?: string;
  demo: boolean;
};
