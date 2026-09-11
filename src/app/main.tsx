import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ThemeRoot } from "./components/ThemeRoot";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeRoot>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </ThemeRoot>
  </React.StrictMode>,
);
