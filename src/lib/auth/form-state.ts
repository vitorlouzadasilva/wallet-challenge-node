import type { RegistrationErrors } from "./validation";

export type RegisterState = { errors: RegistrationErrors; name: string; email: string };
export type LoginState = { message: string; email: string };
