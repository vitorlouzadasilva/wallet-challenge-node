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
