import { describe, expect, it } from "vitest";
import { normalizeEmail, validateRegistration } from "./validation";

const validInput = { name: "Ana", email: "ana@example.com", password: "senha-segura-123", confirmation: "senha-segura-123" };

describe("validação de cadastro", () => {
  it("exige os campos e confirmação correta", () => {
    const result = validateRegistration({ name: "", email: "", password: "", confirmation: "outra" });
    expect(result.data).toBeUndefined();
    expect(Object.keys(result.errors)).toEqual(expect.arrayContaining(["name", "email", "password", "confirmation"]));
  });

  it("normaliza e-mail e nome", () => {
    expect(normalizeEmail("  ANA@EXAMPLE.COM ")).toBe("ana@example.com");
    const result = validateRegistration({ ...validInput, name: " Ana   Maria ", email: " ANA@EXAMPLE.COM " });
    expect(result.data).toMatchObject({ name: "Ana Maria", email: "ana@example.com" });
  });

  it("rejeita senha que excede 72 bytes mesmo com menos de 72 caracteres", () => {
    const password = "á".repeat(40);
    expect(validateRegistration({ ...validInput, password, confirmation: password }).errors.password).toBeDefined();
  });
});
