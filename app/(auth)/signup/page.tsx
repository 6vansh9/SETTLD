import { redirect } from "next/navigation";
import { AuthScreen } from "@/components/features/auth/AuthScreen";
import { postSignInPath } from "@/lib/auth-redirect";
import { safeNext } from "@/lib/redirect";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Create account · Settld" };

export default async function SignupPage({ searchParams }: { searchParams: { next?: string; error?: string } }) {
  const next = safeNext(searchParams.next);
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect(await postSignInPath(supabase, next));
  return <AuthScreen mode="signup" next={next} error={searchParams.error} />;
}
