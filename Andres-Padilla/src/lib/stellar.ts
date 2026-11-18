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

export const formatXlm = (amount: string) =>
  Number(amount).toLocaleString("es-CR", { maximumFractionDigits: 7 });
