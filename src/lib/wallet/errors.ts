export class WalletDomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class InvalidAmount extends WalletDomainError {
  constructor() { super("Informe um valor positivo em centavos dentro do limite permitido."); }
}

export class InsufficientBalance extends WalletDomainError {
  constructor() { super("Saldo insuficiente para esta transferência."); }
}

export class WalletNotFound extends WalletDomainError {
  constructor() { super("Carteira indisponível."); }
}

export class UnauthorizedOperation extends WalletDomainError {
  constructor() { super("Operação indisponível para este usuário."); }
}

export class InvalidOperation extends WalletDomainError {
  constructor() { super("Operação financeira inválida."); }
}

export class OperationAlreadyReversed extends WalletDomainError {
  constructor() { super("Esta operação já foi revertida."); }
}

export class IdempotencyConflict extends WalletDomainError {
  constructor() { super("Esta chave já foi usada em outra solicitação."); }
}

export class InvalidIdempotencyKey extends WalletDomainError {
  constructor() { super("Chave idempotente inválida."); }
}

export class BalanceLimitExceeded extends WalletDomainError {
  constructor() { super("O saldo excederia o limite permitido."); }
}

export class FinancialPersistenceException extends WalletDomainError {
  constructor() { super("Não foi possível concluir a operação financeira."); }
}
