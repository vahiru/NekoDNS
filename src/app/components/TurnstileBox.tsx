import { Box } from "@mui/material";
import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (selector: HTMLElement, options: { sitekey: string; callback: (token: string) => void }) => string;
      reset: (id?: string) => void;
    };
  }
}

export function TurnstileBox({ siteKey, onToken }: { siteKey?: string; onToken: (token: string) => void }) {
  const ref = useRef<HTMLDivElement | null>(null);
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
        window.turnstile.render(ref.current, { sitekey: siteKey, callback: onToken });
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

  return <Box ref={ref} sx={{ minHeight: siteKey?.startsWith("1x000") ? 0 : 70 }} />;
}
