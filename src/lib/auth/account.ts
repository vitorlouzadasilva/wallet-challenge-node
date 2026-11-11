import "server-only";

import bcrypt from "bcrypt";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import type { RegistrationData } from "./validation";

const BCRYPT_COST = 12;

export class DuplicateEmailError extends Error {}

export async function createAccount(data: RegistrationData): Promise<bigint> {
  const passwordHash = await bcrypt.hash(data.password, BCRYPT_COST);

  try {
    // Usuário e carteira são uma unidade: uma falha na carteira desfaz o cadastro.
    return await prisma.$transaction(async (transaction) => {
      const user = await transaction.user.create({
        data: { name: data.name, email: data.email, passwordHash },
        select: { id: true },
      });

      await transaction.wallet.create({
        data: { userId: user.id, balanceCents: 0n },
      });

      return user.id;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new DuplicateEmailError("E-mail já cadastrado.");
    }
    throw error;
  }
}
