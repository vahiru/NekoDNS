import { Alert, Box, useMediaQuery, useTheme } from "@mui/material";
import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (
        selector: HTMLElement,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          "expired-callback"?: () => void;
          "error-callback"?: () => void;
          size?: "normal" | "compact";
        },
      ) => string;
      reset: (id?: string) => void;
    };
  }
}

/** Cloudflare's documented always-passing test key; the worker short-circuits the same value. */
function isTestSiteKey(siteKey?: string) {
  return Boolean(siteKey?.startsWith("1x000"));
}

export function TurnstileBox({ siteKey, onToken, resetKey = 0 }: { siteKey?: string; onToken: (token: string) => void; resetKey?: number }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const widgetId = useRef<string | undefined>(undefined);
  const renderedRef = useRef(false);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const isTestKey = isTestSiteKey(siteKey);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!siteKey || isTestKey || renderedRef.current || !ref.current) return;

    const render = () => {
      if (!window.turnstile || !ref.current || renderedRef.current) return;
      renderedRef.current = true;
      widgetId.current = window.turnstile.render(ref.current, {
        sitekey: siteKey,
        callback: onToken,
        "expired-callback": () => onToken(""),
        "error-callback": () => onToken(""),
        size: isMobile ? "compact" : "normal",
      });
    };

    if (!document.querySelector("script[data-turnstile]")) {
      const script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
      script.async = true;
      script.defer = true;
      script.dataset.turnstile = "true";
      script.onload = render;
      script.onerror = () => setFailed(true);
      document.head.appendChild(script);
    } else {
      render();
    }
  }, [onToken, siteKey, isMobile, isTestKey]);

  useEffect(() => {
    if (!siteKey) return;
    if (isTestKey) {
      onToken("dev-token");
      return;
    }
    if (!widgetId.current || !window.turnstile) return;
    onToken("");
    window.turnstile.reset(widgetId.current);
  }, [onToken, resetKey, siteKey, isTestKey]);

  // No widget will ever mount with the test key, so do not hold space for one.
  if (isTestKey) return null;

  if (failed) {
    return (
      <Alert severity="warning" sx={{ width: "100%" }}>
        人机验证组件加载失败，请检查网络后刷新页面重试。
      </Alert>
    );
  }

  return <Box ref={ref} sx={{ minHeight: isMobile ? 120 : 70, display: "flex", justifyContent: "center" }} />;
}
