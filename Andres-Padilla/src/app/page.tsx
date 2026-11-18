import ConnectWallet from "@/components/ConnectWallet";
import Universe from "@/components/Universe";
import styles from "./page.module.css";

export default function Home() {
  return (
    <>
      <Universe />
      {/* Panel temporal: la wallet se integrará en los capítulos */}
      <aside className={styles.walletPanel}>
        <ConnectWallet />
      </aside>
    </>
  );
}
