import { createApi } from "./app.ts";
import { authDependenciesFromEnvironment } from "./auth/environment.ts";

const port = Number(process.env.PORT ?? 3000);

createApi(authDependenciesFromEnvironment(process.env)).listen(port, () => {
  console.log(`Multicam API listening on http://localhost:${port}`);
});
