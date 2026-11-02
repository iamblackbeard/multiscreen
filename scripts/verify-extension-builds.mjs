import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const extension = new URL("../apps/extension/", import.meta.url);

async function text(path) {
  return readFile(new URL(path, extension), "utf8");
}

async function manifest(target) {
  return JSON.parse(await text(`.output/${target}/manifest.json`));
}

function sorted(values) {
  return [...values].sort();
}

const chrome = await manifest("chrome-mv3");
const firefox = await manifest("firefox-mv2");
const apiPermissions = ["identity", "storage", "tabs"];
const apiBaseUrl = process.env.VITE_API_BASE_URL;
assert.ok(apiBaseUrl, "VITE_API_BASE_URL is required to verify extension builds");
const apiHosts = [`${new URL(apiBaseUrl).origin}/*`];

assert.equal(chrome.manifest_version, 3);
assert.deepEqual(sorted(chrome.permissions), sorted(apiPermissions));
assert.deepEqual(sorted(chrome.host_permissions), sorted(apiHosts));
assert.deepEqual(chrome.background, { service_worker: "background.js" });
assert.equal(chrome.action.default_popup, "popup.html");
assert.equal(chrome.browser_specific_settings, undefined);

assert.equal(firefox.manifest_version, 2);
assert.deepEqual(
  sorted(firefox.permissions),
  sorted([...apiPermissions, ...apiHosts]),
);
assert.deepEqual(firefox.background, { scripts: ["background.js"] });
assert.equal(firefox.browser_action.default_popup, "popup.html");
assert.deepEqual(firefox.browser_specific_settings, {
  gecko: {
    data_collection_permissions: {
      required: ["authenticationInfo", "websiteActivity"],
    },
    id: "twitch-multicam@hackathon.local",
    strict_min_version: "140.0",
  },
});

for (const built of [chrome, firefox]) {
  assert.deepEqual(built.content_scripts, [
    {
      js: ["content-scripts/twitch-player.js"],
      matches: ["https://www.twitch.tv/*"],
      run_at: "document_idle",
    },
  ]);
}

for (const target of ["chrome-mv3", "firefox-mv2"]) {
  for (const artifact of [
    "background.js",
    "popup.html",
    "content-scripts/twitch-player.js",
  ]) {
    assert.ok((await text(`.output/${target}/${artifact}`)).length > 0);
  }
}

const browserApiSources = await Promise.all([
  text("entrypoints/background.ts"),
  text("entrypoints/popup/client.ts"),
]);
for (const source of browserApiSources) {
  assert.match(source, /from ["']wxt\/browser["']/);
  assert.doesNotMatch(source, /\bchrome\s*\./);
}

const contentScript = await text("entrypoints/twitch-player.content.ts");
assert.match(
  contentScript,
  /from ["']wxt\/utils\/define-content-script["']/,
);
assert.match(contentScript, /context\.onInvalidated/);
assert.doesNotMatch(contentScript, /\bchrome\s*\./);

const playerControl = await text("src/full-video-control.ts");
assert.match(playerControl, /attachShadow\(\{ mode: ["']open["'] \}\)/);
assert.match(playerControl, /shadow\.innerHTML\s*=\s*`\s*<style>/);

console.log(
  "Verified Chrome MV3 and Firefox MV2 manifests, artifacts, cross-browser APIs, and Shadow DOM isolation.",
);
