import type { Env } from "../env";

export async function verifyTurnstile(env: Env, token?: string, ip?: string) {
  if (!token) return false;
  if (env.TURNSTILE_SECRET_KEY === "1x0000000000000000000000000000000AA") return true;

  const body = new URLSearchParams();
  body.set("secret", env.TURNSTILE_SECRET_KEY);
  body.set("response", token);
  if (ip) body.set("remoteip", ip);

  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body,
  });

  const result = (await response.json()) as { success?: boolean };
  return result.success === true;
}
