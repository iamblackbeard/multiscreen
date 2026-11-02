import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App.tsx";
import { createPopupClient } from "./client.ts";
import "./styles.css";

const root = document.querySelector("#root");

if (!root) throw new Error("Popup root element is missing");

createRoot(root).render(
  <StrictMode>
    <App
      client={createPopupClient()}
      dashboardUrl={
        import.meta.env.VITE_DASHBOARD_URL ??
        "https://dashboard.multicam.tv/"
      }
    />
  </StrictMode>,
);
