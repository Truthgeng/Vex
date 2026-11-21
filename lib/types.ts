export type CheckInput = {
  /** X handle without the @ */
  handle?: string;
  /** Token contract on Celo */
  contract?: `0x${string}`;
};

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
export type Watch = {
  id: string;
  handle?: string;
  contract?: string;
  addedAt: string;
  lastCheckedAt?: string;
  last?: { score: number; verdict: Verdict; reasons: string[] };
  /** Set when automatic checks stopped, with the reason in plain words */
  paused?: string;
};

export type LogEntry = {
  at: string;
  kind: "check" | "alert" | "paused" | "refund";
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
  charge?: TabCharge;
  paidCalls: PaidCall[];
  mode: "mock" | "tab" | "direct";
  at: string;
};
