"use client";

import { useEffect, useState } from "react";
import { isConnected, requestAccess, getAddress } from "@stellar/freighter-api";
import styles from "./ConnectWallet.module.css";

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-6)}`;

export default function ConnectWallet() {
  const [address, setAddress] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  // Si ya diste permiso antes, recupera la wallet al recargar
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { isConnected: hasFreighter } = await isConnected();
      if (!hasFreighter) return;
      const { address } = await getAddress();
      if (address && !cancelled) setAddress(address);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleClick() {
    setMessage("");

    // Si ya está conectada, el botón desconecta (solo limpia el estado)
    if (address) {
      setAddress("");
      return;
    }

    setLoading(true);
    try {
      const { isConnected: hasFreighter } = await isConnected();
      if (!hasFreighter) {
        setMessage("No se detectó Freighter. Instálalo y recarga la página.");
        return;
      }
      // Abre el popup de Freighter para autorizar la app
      const access = await requestAccess();
      if (access.error) {
        setMessage("No se pudo conectar la wallet.");
        return;
      }
      setAddress(access.address);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.wrapper}>
      <button className={styles.button} onClick={handleClick} disabled={loading}>
        {address ? "Desconectar" : loading ? "Conectando…" : "Conectar wallet"}
      </button>
      {address && (
        <small className={styles.status} title={address}>
          Conectado: {short(address)}
        </small>
      )}
      {message && <small className={`${styles.status} ${styles.error}`}>{message}</small>}
    </div>
  );
}
