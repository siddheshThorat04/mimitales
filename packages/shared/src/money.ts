// All money is stored as integer paise (BIGINT in Postgres). Never use floats.
export type Paise = bigint;

/** Parse a rupee string like "100" or "100.50" into paise. Rejects anything else. */
export function rupeesToPaise(input: string): Paise {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(input.trim());
  if (!match) throw new Error("Invalid rupee amount");
  const rupees = BigInt(match[1]!);
  const fraction = (match[2] ?? "").padEnd(2, "0");
  return rupees * 100n + BigInt(fraction);
}

/** Format paise for display, e.g. 10000n -> "₹100.00". */
export function formatPaise(paise: Paise): string {
  const negative = paise < 0n;
  const abs = negative ? -paise : paise;
  const rupees = abs / 100n;
  const rem = (abs % 100n).toString().padStart(2, "0");
  return `${negative ? "-" : ""}₹${rupees}.${rem}`;
}