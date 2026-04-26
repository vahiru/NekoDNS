import { Box } from "@mui/material";
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
        },
      ) => string;
      reset: (id?: string) => void;
    };
  }
}

export function TurnstileBox({ siteKey, onToken, resetKey = 0 }: { siteKey?: string; onToken: (token: string) => void; resetKey?: number }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const widgetId = useRef<string | undefined>(undefined);
  const [rendered, setRendered] = useState(false);

  useEffect(() => {
    if (!siteKey || rendered || !ref.current) return;
    if (siteKey.startsWith("1x000")) {
      onToken("dev-token");
      setRendered(true);
      return;
    }

    const load = () => {
      if (window.turnstile && ref.current && !rendered) {
        widgetId.current = window.turnstile.render(ref.current, {
          sitekey: siteKey,
          callback: onToken,
          "expired-callback": () => onToken(""),
          "error-callback": () => onToken(""),
        });
        setRendered(true);
      }
    };

    if (!document.querySelector("script[data-turnstile]")) {
      const script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
      script.async = true;
      script.defer = true;
      script.dataset.turnstile = "true";
      script.onload = load;
      document.head.appendChild(script);
    } else {
      load();
    }
  }, [onToken, rendered, siteKey]);

  useEffect(() => {
    if (!siteKey) return;
    if (siteKey.startsWith("1x000")) {
      onToken("dev-token");
      return;
    }
    if (!widgetId.current || !window.turnstile) return;
    onToken("");
    window.turnstile.reset(widgetId.current);
  }, [onToken, resetKey, siteKey]);

  return <Box ref={ref} sx={{ minHeight: siteKey?.startsWith("1x000") ? 0 : 70 }} />;
}
