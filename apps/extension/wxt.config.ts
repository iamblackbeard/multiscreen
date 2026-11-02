import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "wxt";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: ({ browser }) => ({
    name: "Twitch Multicam",
    description: "Choose a camera angle on supported Twitch streams.",
    host_permissions: [
      "http://localhost:3000/*",
      "https://api.multicam.tv/*",
    ],
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
  }),
  webExt: {
    disabled: true,
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
});
