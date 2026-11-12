import assert from "node:assert/strict";
import { it } from "vitest";
import { formatReaisInput, pastedReais, maskReaisInput } from "./money-input";
import { parsePositiveReais } from "./money";

it("o teclado decimal não duplica a vírgula automática e preserva a edição no meio", () => {
  const input = {
    value: "0,10,", selectionStart: 5,
    setCustomValidity() {},
    setSelectionRange(start: number) { this.selectionStart = start; },
  };
  maskReaisInput(input);
  assert.equal(input.value, "0,10");
  input.value = "10,250";
  input.selectionStart = 4;
  maskReaisInput(input);
  assert.equal(input.value, "102,50");
  assert.equal(input.selectionStart, 4);
  input.value = "";
  input.selectionStart = 0;
  maskReaisInput(input);
  assert.equal(input.value, "");
});

it("formata a digitação incremental como centavos sem usar ponto flutuante", () => {
    let value = "";
    for (const digit of "1050") value = formatReaisInput(value + digit);
    assert.equal(value, "10,50");
    assert.equal(formatReaisInput("1"), "0,01");
    assert.equal(formatReaisInput("0,000"), "0,00");
});

it("permite limpar o campo e mantém valores inválidos para a validação", () => {
    assert.equal(formatReaisInput(""), "");
    for (const value of ["-100", "1e3", "abc", "1.000", "10,,50"]) {
        assert.equal(formatReaisInput(value), value);
    }
});

it("preserva todos os dígitos do limite BIGINT", () => {
    assert.equal(formatReaisInput("9223372036854775807"), "92233720368547758,07");
    assert.equal(formatReaisInput("9223372036854775808"), "92233720368547758,08");
});

it("interpreta a colagem em reais e completa as casas decimais", () => {
    assert.equal(pastedReais("10"), "10,00");
    assert.equal(pastedReais("10,5"), "10,50");
    assert.equal(pastedReais("10,50"), "10,50");
    assert.equal(pastedReais("0,01"), "0,01");
    assert.equal(pastedReais("92233720368547758,07"), "92233720368547758,07");
});

it("rejeita colagem ambígua sem transformar sinal negativo ou expoente em crédito", () => {
    for (const value of ["", "-10", "1e3", "1.000", "10.50", "1,234", "R$ 10,50", "9".repeat(21)]) {
        assert.equal(pastedReais(value), null);
    }
});

it("entrega ao conversor existente os centavos exatos e preserva a rejeição de overflow", () => {
  assert.equal(parsePositiveReais(formatReaisInput("1050")), 1050n);
  assert.equal(parsePositiveReais(formatReaisInput("9223372036854775807")), 9223372036854775807n);
  assert.equal(parsePositiveReais(formatReaisInput("9223372036854775808")), null);
});
