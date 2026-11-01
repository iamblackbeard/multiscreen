import { once } from "node:events";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const usesProcessGroup = process.platform !== "win32";
const dev = spawn("npm", ["run", "dev"], {
  cwd: root,
  detached: usesProcessGroup,
  env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
  stdio: ["ignore", "pipe", "pipe"],
});

let output = "";
let stopping = false;

for (const stream of [dev.stdout, dev.stderr]) {
  stream.on("data", (chunk) => {
    output = `${output}${chunk}`.slice(-20_000);
  });
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitFor(name, probe) {
  const deadline = Date.now() + 30_000;

  while (Date.now() < deadline) {
    if (dev.exitCode !== null && !stopping) {
      throw new Error(`Development environment exited before ${name} was ready.`);
    }

    try {
      if (await probe()) return;
    } catch {
      // A process may be listening before its first response is available.
    }

    await delay(200);
  }

  throw new Error(`Timed out waiting for ${name}.`);
}

async function respondsWith(url, check) {
  const response = await fetch(url, { signal: AbortSignal.timeout(1_000) });
  return response.ok && check(response);
}

async function stopDevelopmentEnvironment() {
  if (dev.exitCode !== null) return;

  stopping = true;

  if (usesProcessGroup && dev.pid) {
    process.kill(-dev.pid, "SIGTERM");
  } else {
    dev.kill("SIGTERM");
  }

  await Promise.race([once(dev, "exit"), delay(5_000)]);
}

try {
  await waitFor("API", () =>
    respondsWith("http://127.0.0.1:3000/health", async (response) => {
      const health = await response.json();
      return health.status === "ok";
    }),
  );

  await waitFor("dashboard", () =>
    respondsWith("http://127.0.0.1:5173/", async (response) =>
      (await response.text()).includes("<title>Twitch Multicam</title>"),
    ),
  );

  await waitFor("dashboard-to-API connection", () =>
    respondsWith("http://127.0.0.1:5173/health", async (response) => {
      const health = await response.json();
      return health.status === "ok";
    }),
  );

  await waitFor("extension", () =>
    respondsWith(
      "http://127.0.0.1:5174/entrypoints/popup/main.tsx",
      async (response) => (await response.text()).includes("createRoot"),
    ),
  );

  console.log("Smoke checks passed: API, dashboard, and extension are ready.");
} catch (error) {
  console.error(output);
  throw error;
} finally {
  await stopDevelopmentEnvironment();
}
