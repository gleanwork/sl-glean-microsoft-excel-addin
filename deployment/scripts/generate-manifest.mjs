import { readFile, writeFile } from "node:fs/promises";

const replacements = {
  ADDIN_ID: process.env.ADDIN_ID || "42c7fc70-e3ef-42e8-8afd-5a7841ff537d",
  ADDIN_VERSION: process.env.ADDIN_VERSION || "1.0.0.0",
  DOMAIN_NAME: process.env.DOMAIN_NAME || "gleaninexcel.gleandemo.com",
  GLEAN_INSTANCE: process.env.GLEAN_INSTANCE || "your-instance",
};

let manifest = await readFile("manifest.xml.example", "utf8");
for (const [key, value] of Object.entries(replacements)) {
  manifest = manifest.replaceAll(`{{${key}}}`, value);
}
await writeFile("manifest.xml", manifest);
await writeFile("dist/manifest.xml", manifest);
