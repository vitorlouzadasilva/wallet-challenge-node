/** Serializa valores de banco sem convertê-los para Number. */
export function serializeCents(cents: bigint): string {
  return cents.toString();
}

/** Formata centavos inteiros para apresentação, inclusive valores negativos extremos. */
export function formatCents(cents: bigint): string {
  const negative = cents < 0n;
  const digits = (negative ? -cents : cents).toString().padStart(3, "0");
  const whole = digits.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

  return `${negative ? "-" : ""}R$ ${whole},${digits.slice(-2)}`;
}

/** Aceita reais sem separador de milhar e devolve centavos positivos exatos. */
export function parsePositiveReais(input: string): bigint | null {
  if (typeof input !== "string" || input.length > 20) return null;
  const value = input;
  if (!/^(?:0|[1-9]\d{0,16})(?:,\d{1,2})?$/.test(value)) return null;

  const [reais, fraction = ""] = value.split(",");
  const cents = BigInt(reais) * 100n + BigInt(fraction.padEnd(2, "0") || "0");
  return cents > 0n && cents <= (1n << 63n) - 1n ? cents : null;
}
