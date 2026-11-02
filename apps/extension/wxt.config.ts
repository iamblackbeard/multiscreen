import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "wxt";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "Twitch Multicam",
    description: "Choose a camera angle on supported Twitch streams.",
    host_permissions: [
      "http://localhost:3000/*",
      "https://api.multicam.tv/*",
    ],
    permissions: ["identity", "storage", "tabs"],
  },
  webExt: {
    disabled: true,
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
});
