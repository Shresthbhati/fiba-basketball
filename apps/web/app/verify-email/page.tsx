import { VerifyEmail } from "../../lib/recovery-forms";

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return <main><VerifyEmail token={token ?? null} /></main>;
}
