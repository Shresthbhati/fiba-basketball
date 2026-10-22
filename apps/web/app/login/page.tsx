import Link from "next/link";
import { AuthForm } from "../../lib/auth-form";

export default function Login() {
  return (
    <main>
      <AuthForm mode="login" />
      <p>New here? <Link href="/signup">Create an account</Link></p>
    </main>
  );
}
