import type { Env } from "../env";

export interface TurnstileCheckResult {
  success: boolean;
  errorCodes: string[];
}

export async function verifyTurnstile(env: Env, token?: string, ip?: string): Promise<TurnstileCheckResult> {
  const secretPreview = env.TURNSTILE_SECRET_KEY.length > 12
    ? `${env.TURNSTILE_SECRET_KEY.slice(0, 6)}...${env.TURNSTILE_SECRET_KEY.slice(-6)}`
    : env.TURNSTILE_SECRET_KEY;
  const secretLength = env.TURNSTILE_SECRET_KEY.length;

  if (!token) {
    console.error("Turnstile token missing", {
      siteKey: env.TURNSTILE_SITE_KEY,
      secretPreview,
      secretLength,
      ipPresent: Boolean(ip),
    });
    return { success: false, errorCodes: ["missing-input-response"] };
  }
  if (env.TURNSTILE_SECRET_KEY === "1x0000000000000000000000000000000AA") return { success: true, errorCodes: [] };

  try {
    const tokenPreview = token.length > 16 ? `${token.slice(0, 8)}...${token.slice(-8)}` : token;
    const body = new URLSearchParams();
    body.set("secret", env.TURNSTILE_SECRET_KEY);
    body.set("response", token);

    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body,
    });

    const result = (await response.json().catch(() => null)) as { success?: boolean; "error-codes"?: string[] } | null;
    if (!result) {
      console.error("Turnstile siteverify returned invalid JSON", {
        siteKey: env.TURNSTILE_SITE_KEY,
        secretPreview,
        secretLength,
        tokenLength: token.length,
        tokenPreview,
        status: response.status,
      });
      return { success: false, errorCodes: ["invalid-siteverify-response"] };
    }
    if (result.success === true) {
      console.log("Turnstile verification passed", {
        siteKey: env.TURNSTILE_SITE_KEY,
        secretPreview,
        secretLength,
        tokenLength: token.length,
        tokenPreview,
      });
      return { success: true, errorCodes: [] };
    }

    const codes = result["error-codes"] ?? [];
    console.error("Turnstile verification failed", {
      siteKey: env.TURNSTILE_SITE_KEY,
      secretPreview,
      secretLength,
      tokenLength: token.length,
      tokenPreview,
      status: response.status,
      result,
      codes,
    });
    if (codes.length > 0) return { success: false, errorCodes: codes };
    return { success: false, errorCodes: [`siteverify-http-${response.status}`] };
  } catch {
    return { success: false, errorCodes: ["turnstile-upstream-unreachable"] };
  }
}
