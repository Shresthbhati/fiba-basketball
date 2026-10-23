import Link from "next/link";
import { AuthForm } from "../../lib/auth-form";

export default function Signup() {
  return (
    <main>
      <AuthForm mode="signup" />
      <p>Already have an account? <Link href="/login">Log in</Link></p>
    </main>
  );
}
