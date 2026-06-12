import fs from "node:fs/promises";
import path from "node:path";

async function databaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  try {
    const env = await fs.readFile(".env", "utf8");
    const match = env.match(/^DATABASE_URL\s*=\s*["']?([^"'\r\n]+)["']?/m);
    if (match) return match[1];
  } catch {
    // Prisma will report missing configuration after this preparation step.
  }
  return "";
}

const url = await databaseUrl();
if (url.startsWith("file:")) {
  const configuredPath = url.slice("file:".length);
  const databasePath = path.isAbsolute(configuredPath)
    ? configuredPath
    : path.resolve("prisma", configuredPath);
  await fs.mkdir(path.dirname(databasePath), { recursive: true });
  const handle = await fs.open(databasePath, "a");
  await handle.close();
}
