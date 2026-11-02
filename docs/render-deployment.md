# Deploying the backend to Render

The Express backend can run on Render as a native Node.js Web Service without
Docker. It already:

- reads the port from Render's `PORT` environment variable;
- exposes a `GET /health` endpoint;
- compiles to JavaScript successfully; and
- provides a production `start` command.

## Create the Render Web Service

Connect the repository to Render and create a **Web Service** using the
**Node** runtime.

Use the repository root as the service root. Do not set the root directory to
`apps/api`, because this repository uses npm workspaces and the API depends on
the shared `packages/contracts` workspace.

Configure the service as follows:

```text
Root Directory: leave blank
Build Command: npm ci && npm run build --workspace @multicam/api
Start Command: npm start --workspace @multicam/api
Health Check Path: /health
```

Render documents its Node.js and monorepo deployment behavior here:

- [Deploy a Node Express App](https://render.com/docs/deploy-node-express-app)
- [Monorepo Support](https://render.com/docs/monorepo-support)
- [Health Checks](https://render.com/docs/health-checks)

## Node.js version

The root `package.json` currently declares:

```json
{
  "engines": {
    "node": ">=24.0.0"
  }
}
```

Render can resolve the version from this setting. For more predictable
deployments, consider adding an upper bound or setting `NODE_VERSION` to the
exact Node.js 24 release used during local verification.

Render's Node version configuration is documented in
[Setting Your Node.js Version](https://render.com/docs/node-version).

## Create or connect PostgreSQL

Create a Render PostgreSQL database, or connect another managed PostgreSQL
database that Render can reach.

When the API and database are in the same Render region, use Render's internal
database URL for `DATABASE_URL`. Keep this value available only to the API.
Do not expose it to the dashboard or browser extension.

## Environment variables

Add the following environment variables to the Render Web Service:

```dotenv
NODE_ENV=production
DATABASE_URL=<Render PostgreSQL internal URL>
DASHBOARD_URL=https://your-dashboard-domain.example/
EXTENSION_REDIRECT_ORIGINS=https://your-extension-id.chromiumapp.org,<firefox-origin>
TWITCH_CALLBACK_URL=https://your-api.onrender.com/auth/twitch/callback
TWITCH_EXTENSION_CALLBACK_URL=https://your-api.onrender.com/auth/extension/twitch/callback
TWITCH_CLIENT_ID=<Twitch client ID>
TWITCH_CLIENT_SECRET=<Twitch client secret>
```

Do not manually define `PORT`. Render supplies it to the service.

Setting `NODE_ENV=production` is important because the API then marks its
authentication cookies as secure.

### Environment variable reference

| Variable | Purpose |
| --- | --- |
| `NODE_ENV` | Enables production cookie security when set to `production`. |
| `DATABASE_URL` | PostgreSQL connection used by authentication, preferences, and live sessions. |
| `DASHBOARD_URL` | Destination after a successful dashboard Twitch login. |
| `EXTENSION_REDIRECT_ORIGINS` | Comma-separated allowlist of exact Chrome and Firefox identity callback origins. |
| `TWITCH_CALLBACK_URL` | Backend callback for dashboard Twitch authentication. |
| `TWITCH_EXTENSION_CALLBACK_URL` | Backend callback for extension Twitch authentication. |
| `TWITCH_CLIENT_ID` | Twitch application client ID. |
| `TWITCH_CLIENT_SECRET` | Server-only Twitch application secret. |

Store `DATABASE_URL` and `TWITCH_CLIENT_SECRET` as secret values. Never place
them in frontend environment variables or committed files.

## Database migrations

The API does not automatically apply database migrations when it starts.

The preferred Render pre-deploy command is:

```text
npm run db:migrate --workspace @multicam/api
```

Render recommends pre-deploy commands for migrations, but their availability
depends on the selected Render plan. See
[Deploying on Render](https://render.com/docs/deploys#pre-deploy-command).

If pre-deploy commands are unavailable, run the migration manually whenever a
release contains database changes.

Avoid routinely combining migrations with the web-service start command. With
multiple instances or overlapping deployments, more than one instance could
attempt to execute the migration concurrently.

## Twitch application callbacks

In the Twitch Developer Console, register the exact production callback URLs:

```text
https://your-api.onrender.com/auth/twitch/callback
https://your-api.onrender.com/auth/extension/twitch/callback
```

These values must exactly match `TWITCH_CALLBACK_URL` and
`TWITCH_EXTENSION_CALLBACK_URL`.

If the API later receives a custom domain, update all three locations:

1. Render environment variables
2. Twitch application callback allowlist
3. Extension API configuration and host permissions

## Dashboard integration caveat

The dashboard currently makes relative requests such as:

```text
/health
/auth/twitch
/api/auth/session
/api/preferences
/api/multicam
```

The API does not currently configure CORS, and dashboard authentication uses
an HTTP-only cookie with `SameSite=Lax`.

Consequently, deploying the dashboard at a separate origin and changing its
requests to call the Render URL directly will not work as-is.

### Recommended arrangement

Deploy the dashboard behind a host that proxies these paths to the Render API:

```text
/health/*  -> Render API
/auth/*    -> Render API
/api/*     -> Render API
```

From the browser's perspective, the dashboard and authentication API then
share one origin. This preserves the current relative requests and cookie
behavior.

### Alternative cross-origin arrangement

If the dashboard must call Render directly from a different origin, the
application will need deliberate cross-origin changes, including:

- a configured API CORS allowlist;
- credentialed CORS responses;
- `credentials: "include"` on dashboard requests;
- compatible cookie `SameSite`, `Secure`, and domain behavior; and
- validation of the resulting OAuth flow in production browsers.

These changes should be treated as an authentication design change, not just
a deployment setting.

## Browser extension integration caveat

The extension reads its API origin from `VITE_API_BASE_URL`. The same value is
compiled into both runtime entrypoints and the generated browser host
permission.

There are two deployment options.

### Option 1: Use a custom API domain

Attach `api.multicam.tv` to the Render service and build the extension with:

```dotenv
VITE_API_BASE_URL=https://api.multicam.tv
```

This is the cleanest arrangement for the current code.

### Option 2: Use the Render hostname

To use the default Render hostname directly, build the extension with:

```dotenv
VITE_API_BASE_URL=https://your-api.onrender.com
```

The generated manifest will grant permission only to that configured origin.
Rebuild the Chrome and Firefox artifacts and repeat the browser smoke tests.

## Recommended production layout

The least disruptive layout for the current implementation is:

```text
Dashboard URL
  /              -> dashboard static files
  /health/*      -> Render API
  /auth/*        -> Render API
  /api/*         -> Render API

API custom domain
  api.multicam.tv -> Render Web Service

PostgreSQL
  Render internal database URL -> API only
```

The same-origin dashboard proxy preserves cookie authentication, while the
API custom domain matches the extension's existing production configuration.

## Deployment checklist

- [ ] Create the Render Node.js Web Service from the repository root.
- [ ] Set the build and start commands.
- [ ] Create or connect PostgreSQL.
- [ ] Configure all API environment variables.
- [ ] Apply database migrations.
- [ ] Set `/health` as the Render health-check path.
- [ ] Register both production callbacks with Twitch.
- [ ] Decide between an API custom domain and the Render hostname.
- [ ] Configure the dashboard's same-origin API proxy.
- [ ] Confirm the extension has the correct API host permission and base URL.
- [ ] Deploy and verify `GET /health`.
- [ ] Complete one real dashboard Twitch login.
- [ ] Verify preferences can be saved and reloaded.
- [ ] Verify Multicam can be enabled only while the broadcaster is live.
- [ ] Verify the public channel configuration endpoint from the extension.
- [ ] Complete the Chrome and Firefox smoke checks.

## Current readiness assessment

The backend itself is capable of running on Render without a Dockerfile or
backend code rewrite. The remaining requirements are deployment
configuration, database migrations, Twitch callback registration, and a clear
same-origin/custom-domain arrangement for the dashboard and extension.
