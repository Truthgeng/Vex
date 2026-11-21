import { toDataSuffix } from "@celo/attribution-tags";
import { concat, type Hex } from "viem";

/**
 * The ERC-8021 code the hackathon assigns at enrollment (celo_xxxxxxxxxxxx).
 * Only that assigned code is credited, so there is no fallback: a missing code
 * stops the agent before it sends an untagged transaction.
 */
export function attributionCode(): string {
  const code = process.env.ATTRIBUTION_CODE?.trim();
  if (!code) throw new Error("ATTRIBUTION_CODE is not set. Enroll on Loops House first and paste the code you get.");
  return code;
}

/** Appends the attribution suffix to calldata. Contracts ignore trailing bytes. */
export function tag(data: Hex): Hex {
  return concat([data, toDataSuffix(attributionCode())]);
}
