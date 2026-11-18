"use client";

import { useState, type FormEvent } from "react";
import { signTransaction } from "@stellar/freighter-api";
import {
  NETWORK_PASSPHRASE,
  buildPaymentXdr,
  describeTxError,
  submitSignedXdr,
  txExplorerUrl,
  validatePayment,
} from "@/lib/stellar";
import styles from "./ConnectWallet.module.css";

type Props = {
  address: string;
  network: string;
  onSent: () => void;
};

export default function SendXlm({ address, network, onSent }: Props) {
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [hash, setHash] = useState("");

  const wrongNetwork = network !== "TESTNET";

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setHash("");

    const recipient = to.trim();
    const value = amount.trim();
    const invalid = validatePayment(address, recipient, value, memo);
    if (invalid) {
      setError(invalid);
      return;
    }

    setSending(true);
    try {
      // 1. Construir la transacción
      const xdr = await buildPaymentXdr(address, recipient, value, memo);

      // 2. Firmarla con Freighter (abre su popup)
      const signed = await signTransaction(xdr, {
        networkPassphrase: NETWORK_PASSPHRASE,
        address,
      });
      if (signed.error) {
        setError("La firma fue cancelada o falló en Freighter.");
        return;
      }

      // 3. Enviarla a la red
      const txHash = await submitSignedXdr(signed.signedTxXdr);
      setHash(txHash);
      setTo("");
      setAmount("");
      setMemo("");
      onSent();
    } catch (err) {
      setError(describeTxError(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <input
        className={styles.input}
        placeholder="Dirección de destino (G…)"
        value={to}
        onChange={(e) => setTo(e.target.value)}
        spellCheck={false}
        autoComplete="off"
      />
      <input
        className={styles.input}
        placeholder="Monto en XLM"
        inputMode="decimal"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
      />
      <input
        className={styles.input}
        placeholder="Memo (opcional)"
        maxLength={28}
        value={memo}
        onChange={(e) => setMemo(e.target.value)}
      />
      <button className={styles.secondary} type="submit" disabled={sending || wrongNetwork}>
        {sending ? "Enviando…" : "Enviar XLM"}
      </button>

      {error && <small className={`${styles.status} ${styles.error}`}>{error}</small>}
      {hash && (
        <small className={`${styles.status} ${styles.success}`}>
          ✅ Enviado ·{" "}
          <a href={txExplorerUrl(hash)} target="_blank" rel="noreferrer">
            ver transacción
          </a>
        </small>
      )}
    </form>
  );
}
