"use client";

import { useActionState } from "react";
import { depositAction, reverseAction, transferAction, type WalletFormState } from "@/app/actions/wallet";

export function DepositForm({ idempotencyKey }: { idempotencyKey: string }) {
  const [state, action, pending] = useActionState(depositAction, { key: idempotencyKey, message: "" } as WalletFormState);
  return (
    <form action={action} className="wallet-form">
      <input type="hidden" name="idempotencyKey" value={state.key} />
      <div className="form-field">
        <label htmlFor="deposit-amount">Valor do depósito</label>
        <input id="deposit-amount" name="amount" type="text" inputMode="decimal" autoComplete="off" placeholder="10,50" maxLength={20} required defaultValue={state.amount} />
        <p className="field-hint">Exemplo: 10,50</p>
      </div>
      {state.message && <p className="form-error" role="alert">{state.message}</p>}
      <button className="button button-primary" type="submit" disabled={pending}>{pending ? "Processando..." : "Depositar"}</button>
    </form>
  );
}

export function TransferForm({ idempotencyKey }: { idempotencyKey: string }) {
  const [state, action, pending] = useActionState(transferAction, { key: idempotencyKey, message: "" } as WalletFormState);
  return (
    <form action={action} className="wallet-form">
      <input type="hidden" name="idempotencyKey" value={state.key} />
      <div className="form-field">
        <label htmlFor="recipient-email">E-mail do destinatário</label>
        <input id="recipient-email" name="recipientEmail" type="email" autoComplete="email" maxLength={255} required defaultValue={state.recipientEmail} />
      </div>
      <div className="form-field">
        <label htmlFor="transfer-amount">Valor da transferência</label>
        <input id="transfer-amount" name="amount" type="text" inputMode="decimal" autoComplete="off" placeholder="10,50" maxLength={20} required defaultValue={state.amount} />
        <p className="field-hint">Exemplo: 10,50</p>
      </div>
      {state.message && <p className="form-error" role="alert">{state.message}</p>}
      <button className="button button-primary" type="submit" disabled={pending}>{pending ? "Processando..." : "Transferir"}</button>
    </form>
  );
}

export function ReverseForm({ idempotencyKey, operationId }: { idempotencyKey: string; operationId: string }) {
  const [state, action, pending] = useActionState(reverseAction, {
    key: idempotencyKey, operationId, message: "",
  } as WalletFormState);
  return (
    <form action={action} onSubmit={(event) => {
      if (!window.confirm("Confirmar a reversão desta operação? O saldo poderá ficar negativo.")) event.preventDefault();
    }}>
      <input type="hidden" name="idempotencyKey" value={state.key} />
      <input type="hidden" name="operationId" value={operationId} />
      <button className="reverse-button" type="submit" disabled={pending}>{pending ? "Revertendo..." : "Reverter"}</button>
      {state.message && <p className="field-error" role="alert">{state.message}</p>}
    </form>
  );
}
