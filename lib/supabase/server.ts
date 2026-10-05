import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
export async function userDb() {
  const jar = await cookies();
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  // All authentication happens on the server. A privileged key is never serialized.
  const key =
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("DATABASE_NOT_CONFIGURED");
  return createServerClient(url, key, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll(values) {
        try {
          values.forEach(({ name, value, options }) =>
            jar.set(name, value, {
              ...options,
              httpOnly: true,
              sameSite: "lax",
              secure:
                process.env.NODE_ENV === "production" &&
                (
                  process.env.APP_URL ||
                  process.env.NEXT_PUBLIC_APP_URL ||
                  ""
                ).startsWith("https:"),
            }),
          );
        } catch {
          /* Server component cookies are refreshed by proxy. */
        }
      },
    },
  });
}
