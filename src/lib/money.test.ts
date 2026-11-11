import { describe, expect, it } from "vitest";
import { formatCents, parsePositiveReais, serializeCents } from "./money";

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

  it("converte reais brasileiros para bigint sem perda de precisão", () => {
    expect(parsePositiveReais("10")).toBe(1000n);
    expect(parsePositiveReais("10,5")).toBe(1050n);
    expect(parsePositiveReais("10,50")).toBe(1050n);
    expect(parsePositiveReais("0,01")).toBe(1n);
    expect(parsePositiveReais("92233720368547758,07")).toBe(9223372036854775807n);
  });

  it("rejeita valores ambíguos, inválidos e acima de BIGINT assinado", () => {
    for (const input of ["", "0", "0,00", "-1", "1,234", "1.000", "1e3", "abc", "00,01", "1,", " 10", "92233720368547758,08", "9".repeat(1000)]) {
      expect(parsePositiveReais(input)).toBeNull();
    }
  });
});
