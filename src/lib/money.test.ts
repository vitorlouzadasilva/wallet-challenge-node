import { describe, expect, it } from "vitest";
import { formatCents, serializeCents } from "./money";

describe("representação monetária", () => {
  it("preserva o inteiro de 64 bits ao serializar", () => {
    expect(serializeCents(9223372036854775807n)).toBe("9223372036854775807");
    expect(serializeCents(-9223372036854775808n)).toBe("-9223372036854775808");
  });

  it("apresenta centavos positivos, negativos e extremos sem ponto flutuante", () => {
    expect(formatCents(1050n)).toBe("R$ 10,50");
    expect(formatCents(-1n)).toBe("-R$ 0,01");
    expect(formatCents(-9223372036854775808n)).toBe("-R$ 92.233.720.368.547.758,08");
  });
});
