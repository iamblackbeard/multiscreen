import { createApi } from "./app.ts";
import { authDependenciesFromEnvironment } from "./auth/environment.ts";
import { createPostgresPreferenceStore } from "./preferences/store.ts";
import { createPostgresMulticamSessionStore } from "./sessions/store.ts";
import { createTwitchStreamStatusClient } from "./sessions/twitch.ts";

const port = Number(process.env.PORT ?? 3000);
const authDependencies = authDependenciesFromEnvironment(process.env);
const preferenceStore = authDependencies
  ? createPostgresPreferenceStore(process.env.DATABASE_URL!)
  : undefined;
const sessionDependencies = authDependencies
  ? {
      sessionStore: createPostgresMulticamSessionStore(
        process.env.DATABASE_URL!,
      ),
      streamStatus: createTwitchStreamStatusClient({
        clientId: authDependencies.authConfig.twitchClientId,
        clientSecret: authDependencies.authConfig.twitchClientSecret,
      }),
    }
  : undefined;

createApi(authDependencies, preferenceStore, sessionDependencies).listen(port, () => {
  console.log(`Multicam API listening on http://localhost:${port}`);
});
