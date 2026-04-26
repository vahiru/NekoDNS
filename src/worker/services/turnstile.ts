import type { Env } from "../env";

export interface TurnstileCheckResult {
  success: boolean;
  errorCodes: string[];
}

export async function verifyTurnstile(env: Env, token?: string, ip?: string): Promise<TurnstileCheckResult> {
  if (!token) return { success: false, errorCodes: ["missing-input-response"] };
  if (env.TURNSTILE_SECRET_KEY === "1x0000000000000000000000000000000AA") return { success: true, errorCodes: [] };

  const body = new URLSearchParams();
  body.set("secret", env.TURNSTILE_SECRET_KEY);
  body.set("response", token);
  if (ip) body.set("remoteip", ip);

  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body,
  });

  const result = (await response.json()) as { success?: boolean; "error-codes"?: string[] };
  return {
    success: result.success === true,
    errorCodes: result["error-codes"] ?? [],
  };
}
