import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "wxt";

import { requiredApiBaseUrl } from "./src/environment.ts";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: ({ browser }) => {
    const apiBaseUrl = requiredApiBaseUrl(
      process.env.VITE_API_BASE_URL,
    );

    return {
      name: "Twitch Multicam",
      description: "Choose a camera angle on supported Twitch streams.",
      host_permissions: [`${apiBaseUrl}/*`],
      permissions: ["identity", "storage", "tabs"],
      ...(browser === "firefox"
        ? {
            browser_specific_settings: {
              gecko: {
                data_collection_permissions: {
                  required: ["authenticationInfo", "websiteActivity"],
                },
                id: "twitch-multicam@hackathon.local",
                strict_min_version: "140.0",
              },
            },
          }
        : {}),
    };
  },
  webExt: {
    disabled: true,
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
});
