import { redirect } from "next/navigation";
import { ShieldCheck, Sparkles } from "lucide-react";
import { signIn, auth } from "../../auth";
import { Button } from "../../components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";

export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  const session = await auth();
  if (session?.user?.id) redirect("/dashboard");

  return (
    <main className="grid min-h-screen place-items-center px-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <span className="mb-3 grid h-11 w-11 place-items-center rounded-xl bg-primary/20 text-primary">
            <Sparkles className="h-5 w-5" />
          </span>
          <CardTitle className="text-xl">Welcome to Nujum</CardTitle>
          <CardDescription>
            Sign in with Discord using the <strong>identify</strong> and <strong>guilds</strong>{" "}
            scopes. Nujum never posts on your behalf.
          </CardDescription>
        </CardHeader>
        <form
          action={async () => {
            "use server";
            await signIn("discord", { redirectTo: "/dashboard" });
          }}
        >
          <Button type="submit" className="w-full">
            <ShieldCheck className="h-4 w-4" /> Continue with Discord
          </Button>
        </form>
        <p className="mt-4 text-center text-xs text-muted">
          Sessions are httpOnly, secure in production and expire after 8 hours.
        </p>
      </Card>
    </main>
  );
}
