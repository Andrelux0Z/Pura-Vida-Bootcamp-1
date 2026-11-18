"use client";

import { useEffect, useState } from "react";
import { formatXlm, getXlmBalance } from "@/lib/stellar";
import styles from "./ConnectWallet.module.css";

type Props = { address: string };

export default function AccountInfo({ address }: Props) {
  // undefined = cargando · null = cuenta sin fondos · string = saldo
  const [balance, setBalance] = useState<string | null | undefined>(undefined);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getXlmBalance(address)
      .then((b) => {
        if (cancelled) return;
        setBalance(b);
        setError("");
      })
      .catch(() => {
        if (!cancelled) setError("No se pudo leer el saldo.");
      });
    return () => {
      cancelled = true;
    };
  }, [address, refresh]);

  return (
    <>
      <small className={styles.status}>
        {error ? (
          <span className={styles.error}>{error}</span>
        ) : balance === undefined ? (
          "Cargando saldo…"
        ) : balance === null ? (
          "Cuenta sin fondos en Testnet"
        ) : (
          <>Saldo: {formatXlm(balance)} XLM</>
        )}{" "}
        <button className={styles.link} onClick={() => setRefresh((n) => n + 1)}>
          Actualizar
        </button>
      </small>
    </>
  );
}
