import Link from "next/link";
import { AuthForm } from "../../lib/auth-form";

export default function Login() {
  return (
    <main>
      <AuthForm mode="login" />
      <p><Link href="/forgot-password">Forgot password?</Link></p>
      <p>New here? <Link href="/signup">Create an account</Link></p>
    </main>
  );
}
