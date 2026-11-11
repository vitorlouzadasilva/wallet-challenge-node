export type RegistrationData = { name: string; email: string; password: string };
export type RegistrationErrors = Partial<Record<"name" | "email" | "password" | "confirmation", string>>;

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function validateRegistration(input: {
  name: string;
  email: string;
  password: string;
  confirmation: string;
}): { data?: RegistrationData; errors: RegistrationErrors } {
  const name = input.name.trim().replace(/\s+/g, " ");
  const email = normalizeEmail(input.email);
  const errors: RegistrationErrors = {};

  if (!name || name.length > 120) {
    errors.name = "Informe um nome com até 120 caracteres.";
  }
  if (!email || email.length > 255 || !emailPattern.test(email)) {
    errors.email = "Informe um e-mail válido.";
  }

  // O bcrypt ignora bytes após o 72º; rejeitar entradas maiores evita senhas equivalentes.
  if (Array.from(input.password).length < 12 || Buffer.byteLength(input.password, "utf8") > 72 || input.password.includes("\0")) {
    errors.password = "Use uma senha de pelo menos 12 caracteres e no máximo 72 bytes.";
  }
  if (input.confirmation !== input.password) {
    errors.confirmation = "A confirmação não corresponde à senha.";
  }

  return Object.keys(errors).length === 0
    ? { data: { name, email, password: input.password }, errors }
    : { errors };
}

export function validLoginInput(email: string, password: string): boolean {
  return email.length <= 255 && emailPattern.test(email) && password.length > 0
    && Buffer.byteLength(password, "utf8") <= 72 && !password.includes("\0");
}
