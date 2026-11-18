import { Horizon, NotFoundError } from "@stellar/stellar-sdk";

// Toda la app trabaja en Testnet
export const HORIZON_URL = "https://horizon-testnet.stellar.org";
export const server = new Horizon.Server(HORIZON_URL);

/**
 * Devuelve el saldo de XLM de una cuenta.
 * `null` significa que la cuenta todavía no existe en la red (sin fondos).
 */
export async function getXlmBalance(address: string): Promise<string | null> {
  try {
    const account = await server.loadAccount(address);
    const native = account.balances.find((b) => b.asset_type === "native");
    return native?.balance ?? "0";
  } catch (e) {
    if (e instanceof NotFoundError) return null;
    throw e;
  }
}

/**
 * Pide a Friendbot que cree y fondee la cuenta con 10 000 XLM de prueba.
 * Friendbot solo funciona con cuentas que todavía no existen.
 */
export async function fundWithFriendbot(address: string): Promise<void> {
  const res = await fetch(
    `https://friendbot.stellar.org?addr=${encodeURIComponent(address)}`,
  );
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.detail ?? `Friendbot respondió ${res.status}`);
  }
}

export const formatXlm = (amount: string) =>
  Number(amount).toLocaleString("es-CR", { maximumFractionDigits: 7 });
