import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";

const tmpDir = ".tmp";
const tmpManifest = `${tmpDir}/manifest.xml`;

const replacements = {
  ADDIN_ID: process.env.ADDIN_ID || "42c7fc70-e3ef-42e8-8afd-5a7841ff537d",
  ADDIN_VERSION: process.env.ADDIN_VERSION || "1.0.0.0",
  DOMAIN_NAME: process.env.DOMAIN_NAME || "gleaninexcel.gleandemo.com",
  GLEAN_INSTANCE: process.env.GLEAN_INSTANCE || "example",
};

await mkdir(tmpDir, { recursive: true });
let manifest = await readFile("manifest.xml.example", "utf8");
for (const [key, value] of Object.entries(replacements)) {
  manifest = manifest.replaceAll(`{{${key}}}`, value);
}
await writeFile(tmpManifest, manifest);

const bin = process.platform === "win32"
  ? "node_modules/.bin/office-addin-manifest.cmd"
  : "node_modules/.bin/office-addin-manifest";

const exitCode = await new Promise((resolve) => {
  const child = spawn(bin, ["validate", tmpManifest], { stdio: "inherit" });
  child.on("close", resolve);
});

await rm(tmpDir, { recursive: true, force: true });
process.exit(Number(exitCode));
