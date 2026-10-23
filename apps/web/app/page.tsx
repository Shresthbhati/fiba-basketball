import Link from "next/link";

export default function Home() {
  return (
    <main>
      <h1>COURT IQ</h1>
      <p>Find courts, join pickup games, run competitions and keep score.</p>
      <nav style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <Link href="/courts">Find a court</Link>
        <Link href="/login">Log in</Link>
        <Link href="/signup">Sign up</Link>
      </nav>
    </main>
  );
}
