import { createApi } from "./app.ts";

const port = Number(process.env.PORT ?? 3000);

createApi().listen(port, () => {
  console.log(`Multicam API listening on http://localhost:${port}`);
});
