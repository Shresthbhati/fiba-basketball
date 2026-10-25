"use client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ApiError, api } from "../../../lib/api";

export default function NewCompetition() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const c = await api<{ id: string }>("/competitions", { method: "POST", body: { name: f.get("name"), format: f.get("format") } });
      router.push(`/competitions/${c.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? (err.status === 401 ? "Log in to create a competition." : err.message) : "Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main>
      <form onSubmit={submit} style={{ display: "grid", gap: 12, maxWidth: 420 }}>
        <h1>Create a competition</h1>
        <label>Name<input name="name" required maxLength={100} /></label>
        <label>Format
          <select name="format" defaultValue="ROUND_ROBIN">
            <option value="ROUND_ROBIN">Round robin (everyone plays everyone)</option>
            <option value="SINGLE_ELIMINATION">Knockout (lose and you're out)</option>
            <option value="GROUPS_TO_PLAYOFFS">Pool play to playoffs (groups + knockout)</option>
          </select>
        </label>
        {error && <p role="alert" style={{ color: "#ff6b6b" }}>{error}</p>}
        <button type="submit" disabled={busy}>{busy ? "Creating…" : "Create"}</button>
      </form>
    </main>
  );
}
