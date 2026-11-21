// Values both the browser and the server use. Nothing secret lives here.

/** Circle USDC on Celo mainnet (6 decimals, EIP-712 domain "USDC" / "2"). */
export const CELO_USDC = "0xcebA9300f2b948710d2653dD7B07f33A8B32118C" as const;
export const USDC_DECIMALS = 6;
export const CELO_CHAIN_ID = 42220;

/** Celo fee adapter for USDC, so the agent can pay gas in USDC and never needs CELO. */
export const USDC_FEE_CURRENCY = "0x2F25deB3848C207fc8E0c34035B3Ba7fC157602B" as const;

/** Whole USD like "0.05" to 6-decimal USDC units. */
export function usdc(amount: string): bigint {
  const [whole, frac = ""] = amount.trim().split(".");
  return BigInt(whole || "0") * 1_000_000n + BigInt((frac + "000000").slice(0, 6));
}

/** 6-decimal USDC units to a short display string like "0.05". */
export function showUsdc(units: bigint | string): string {
  const n = BigInt(units);
  const whole = n / 1_000_000n;
  const frac = (n % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : `${whole}`;
}

/** The only call a tab allows: USDC transfer. Used for the session allowlist. */
export const TAB_CALLS = [{ to: CELO_USDC, signature: "transfer(address,uint256)" }] as const;
