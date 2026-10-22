import { ResetPasswordForm } from "../../lib/recovery-forms";

export default async function ResetPassword({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return <main><ResetPasswordForm token={token ?? null} /></main>;
}
