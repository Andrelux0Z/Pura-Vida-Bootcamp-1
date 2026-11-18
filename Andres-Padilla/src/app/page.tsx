import ConnectWallet from "@/components/ConnectWallet";

export default function Home() {
  return (
    <main
      style={{
        minHeight: "100svh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <ConnectWallet />
    </main>
  );
}
