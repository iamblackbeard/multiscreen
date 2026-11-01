import { createApi } from "./app.ts";
import { authDependenciesFromEnvironment } from "./auth/environment.ts";
import { createPostgresPreferenceStore } from "./preferences/store.ts";

const port = Number(process.env.PORT ?? 3000);
const authDependencies = authDependenciesFromEnvironment(process.env);
const preferenceStore = authDependencies
  ? createPostgresPreferenceStore(process.env.DATABASE_URL!)
  : undefined;

createApi(authDependencies, preferenceStore).listen(port, () => {
  console.log(`Multicam API listening on http://localhost:${port}`);
});
