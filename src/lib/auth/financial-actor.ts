import "server-only";

import { currentUser } from "./session";

const financialActorBrand: unique symbol = Symbol("wallet-financial-actor");

export type FinancialActor = Readonly<{
  userId: bigint;
  [financialActorBrand]: true;
}>;

/** Entrega ao serviço um ator criado somente após validação da sessão no servidor. */
export async function currentFinancialActor(): Promise<FinancialActor | null> {
  const user = await currentUser();
  return user ? Object.freeze({ userId: user.id, [financialActorBrand]: true as const }) : null;
}

/** Impede que um objeto recebido do navegador seja usado como identidade financeira. */
export function verifiedActorId(actor: FinancialActor): bigint | null {
  if (!actor || actor[financialActorBrand] !== true || typeof actor.userId !== "bigint" || actor.userId <= 0n) {
    return null;
  }

  return actor.userId;
}
