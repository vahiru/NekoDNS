import type { Env } from "../env";

export interface TurnstileCheckResult {
  success: boolean;
  errorCodes: string[];
}

export async function verifyTurnstile(env: Env, token?: string, ip?: string): Promise<TurnstileCheckResult> {
  if (!token) return { success: false, errorCodes: ["missing-input-response"] };
  if (env.TURNSTILE_SECRET_KEY === "1x0000000000000000000000000000000AA") return { success: true, errorCodes: [] };

  try {
    const body = new URLSearchParams();
    body.set("secret", env.TURNSTILE_SECRET_KEY);
    body.set("response", token);
    if (ip) body.set("remoteip", ip);

    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body,
    });

    const result = (await response.json().catch(() => null)) as { success?: boolean; "error-codes"?: string[] } | null;
    if (!result) return { success: false, errorCodes: ["invalid-siteverify-response"] };
    if (result.success === true) return { success: true, errorCodes: [] };

    const codes = result["error-codes"] ?? [];
    if (codes.length > 0) return { success: false, errorCodes: codes };
    return { success: false, errorCodes: [`siteverify-http-${response.status}`] };
  } catch {
    return { success: false, errorCodes: ["turnstile-upstream-unreachable"] };
  }
}
