# Local development and live-demo setup

Docker is not required for the entire project. The simplest local setup is:

- Run the Node.js API, dashboard, and browser-extension tooling directly on the
  development machine.
- Use Docker only for PostgreSQL.
- Run OBS locally for the complete live Twitch demonstration.

## Requirements

- Node.js 24 or newer
- npm 11 or newer
- Docker Desktop, Docker Engine, or another PostgreSQL installation
- Chrome and/or Firefox
- A Twitch account with two-factor authentication enabled
- A registered Twitch developer application
- OBS Studio for the complete live-stream test

## Recommended Docker configuration

The repository does not currently include a `Dockerfile` or Compose file. For
local development, only PostgreSQL needs to run in Docker.

Add a `compose.yaml` file at the repository root with the following content:

```yaml
services:
  postgres:
    image: postgres:17-alpine
    environment:
      POSTGRES_DB: multicam
      POSTGRES_USER: multicam
      POSTGRES_PASSWORD: multicam
    ports:
      - "5432:5432"
    volumes:
      - multicam-postgres:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U multicam -d multicam"]
      interval: 5s
      timeout: 5s
      retries: 10

volumes:
  multicam-postgres:
```

Start PostgreSQL:

```sh
docker compose up -d postgres
```

The dashboard, API, extension, OBS, and Twitch do not need to be containerized.

## Install dependencies

From the repository root:

```sh
npm install
```

## Configure the API

Copy the example environment file:

```sh
cp apps/api/.env.example apps/api/.env
```

Update `apps/api/.env`:

```dotenv
DATABASE_URL=postgresql://multicam:multicam@localhost:5432/multicam
DASHBOARD_URL=http://localhost:5173/
EXTENSION_REDIRECT_ORIGINS=https://YOUR-CHROME-EXTENSION-ID.chromiumapp.org
TWITCH_CALLBACK_URL=http://localhost:3000/auth/twitch/callback
TWITCH_EXTENSION_CALLBACK_URL=http://localhost:3000/auth/extension/twitch/callback
TWITCH_CLIENT_ID=your_client_id
TWITCH_CLIENT_SECRET=your_client_secret
```

The application does not automatically load `apps/api/.env`. Export it into
the shell before running migrations or starting the development environment:

```sh
set -a
source apps/api/.env
set +a
```

Do not commit the populated `.env` file or expose the Twitch client secret to
the dashboard or extension.

## Configure the Twitch application

Register an application in the
[Twitch Developer Console](https://dev.twitch.tv/console/apps) and add these
exact OAuth redirect URLs:

```text
http://localhost:3000/auth/twitch/callback
http://localhost:3000/auth/extension/twitch/callback
```

Generate a client secret and place the client ID and secret in
`apps/api/.env`. Twitch documents application registration and the
authorization-code flow here:

- [Register Your App](https://dev.twitch.tv/docs/authentication/register-app)
- [Getting OAuth Access Tokens](https://dev.twitch.tv/docs/authentication/getting-tokens-oauth)

## Apply database migrations

After starting PostgreSQL and exporting the API environment:

```sh
npm run db:migrate --workspace @multicam/api
```

## Configure the extension for localhost

Copy the extension environment example and configure it for localhost:

```sh
cp apps/extension/.env.example apps/extension/.env
```

Use these values in `apps/extension/.env`:

```dotenv
VITE_API_BASE_URL=http://localhost:3000
VITE_DASHBOARD_URL=http://localhost:5173/
```

Both extension entrypoints and the generated browser host permission use
`VITE_API_BASE_URL`. The build fails when this setting is missing or is not a
plain HTTP(S) origin.

## Start the development environment

After exporting both the API and extension environment variables:

```sh
npm run dev
```

This starts:

- Express API: `http://localhost:3000`
- Dashboard: `http://localhost:5173`
- WXT extension development server: `http://localhost:5174`

Open the dashboard using `http://localhost:5173/`, not the `127.0.0.1`
equivalent. Keeping the same hostname as the OAuth callback avoids cookie-host
mismatches during local authentication.

## Load the Chrome extension

The development extension is generated at:

```text
apps/extension/.output/chrome-mv3-dev
```

In Chrome:

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Select **Load unpacked**.
4. Choose `apps/extension/.output/chrome-mv3-dev`.

To obtain the extension's exact identity callback, inspect the extension's
background service worker and evaluate:

```js
chrome.identity.getRedirectURL()
```

Copy only the returned URL's origin, for example:

```text
https://abcdefghijklmnop.chromiumapp.org
```

Add that exact origin to `EXTENSION_REDIRECT_ORIGINS`, then restart the API.
Do not use a wildcard origin.

For Firefox callback discovery and browser verification, follow
[`firefox-smoke.md`](./firefox-smoke.md).

## Verification levels

### 1. Basic project verification

These checks do not require PostgreSQL, Twitch credentials, or OBS:

```sh
npm test
npm run typecheck
npm run build
npm run smoke
```

The smoke check proves that the API health endpoint, dashboard,
dashboard-to-API proxy, and extension development server start successfully.
It does not prove database, OAuth, OBS, or live Twitch behavior. Without the
API environment variables, the API intentionally starts in health-only mode.

### 2. Dashboard authentication and persistence

This level requires:

- PostgreSQL running
- Database migrations applied
- A configured Twitch application
- API environment variables exported

Verify that the streamer can:

1. Open `http://localhost:5173/`.
2. Sign in with Twitch.
3. Configure two to four active camera slots.
4. Choose one active slot as the main camera.
5. Save and reload the configuration.

### 3. Complete local live demonstration

This level additionally requires the local extension environment described
above, OBS, and a live Twitch broadcast.

1. Create a fixed 2x2 OBS scene.
2. Place two to four unique camera feeds into equal quadrants.
3. Use branding or instructions in unused quadrants instead of duplicating a
   camera.
4. Start streaming the composite to Twitch.
5. Sign into the local dashboard.
6. Configure camera labels and the main camera.
7. Enable Multicam after Twitch reports the channel as live.
8. Open the normal Twitch channel page with the unpacked extension enabled.
9. Test every published camera and **Show Grid**.
10. Test normal, theater, and fullscreen modes.
11. Verify Twitch volume, quality, playback, and fullscreen controls remain
    usable.
12. Navigate to another or inactive channel and verify the crop and Multicam
    controls disappear.
13. Disable Multicam and verify Twitch returns to its unmodified state.

For a clean viewer test, use a second Chrome profile or another browser with
the extension loaded.

## Browser extension production builds

Build and verify both browser artifacts:

```sh
npm run build --workspace @multicam/extension
```

The unpacked artifacts are generated at:

- Chrome Manifest V3: `apps/extension/.output/chrome-mv3`
- Firefox Manifest V2: `apps/extension/.output/firefox-mv2`

## Current verification status

At the time this guide was created, the repository passed:

- 17 test files and 130 tests
- TypeScript checks for all workspaces
- API and dashboard production builds
- Chrome Manifest V3 and Firefox Manifest V2 builds
- Extension artifact verification
- The complete development smoke check

The remaining environment-dependent verification is the real PostgreSQL,
Twitch OAuth, OBS, and live Twitch end-to-end path.
