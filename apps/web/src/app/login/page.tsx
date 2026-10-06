import { redirect } from "next/navigation";
import { AuthForm } from "../../components/AuthForm";
import { getSession } from "../../lib/auth";

export default async function LoginPage() {
  if (await getSession()) redirect("/dashboard");
  return <AuthForm mode="login" />;
}