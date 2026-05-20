import { build } from "esbuild";
import { rm, mkdir } from "node:fs/promises";
import path from "node:path";

const handlers = [
  "chatStream",
  "clientError",
  "config",
  "oauthRegister",
  "oauthToken",
];

await rm("backend/dist", { recursive: true, force: true });
await mkdir("backend/dist", { recursive: true });

await Promise.all(
  handlers.map((name) =>
    build({
      entryPoints: [`backend/src/handlers/${name}.ts`],
      bundle: true,
      platform: "node",
      target: "node20",
      format: "esm",
      outfile: path.join("backend", "dist", `${name}.mjs`),
      external: [],
      sourcemap: true,
      banner: {
        js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
      },
    }),
  ),
);
