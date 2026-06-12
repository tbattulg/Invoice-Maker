import fs from "node:fs/promises";
import path from "node:path";

const defaultDatabaseUrl = "file:./dev.db";

async function ensureDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

  let env = "";
  try {
    env = await fs.readFile(".env", "utf8");
    const match = env.match(/^DATABASE_URL\s*=\s*["']?([^"'\r\n]+)["']?/m);
    if (match) return match[1];
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  const separator = env.length > 0 && !env.endsWith("\n") ? "\n" : "";
  await fs.appendFile(
    ".env",
    `${separator}DATABASE_URL="${defaultDatabaseUrl}"\n`,
    "utf8",
  );
  return defaultDatabaseUrl;
}

const url = await ensureDatabaseUrl();
if (url.startsWith("file:")) {
  const configuredPath = url.slice("file:".length);
  const databasePath = path.isAbsolute(configuredPath)
    ? configuredPath
    : path.resolve("prisma", configuredPath);
  await fs.mkdir(path.dirname(databasePath), { recursive: true });
  const handle = await fs.open(databasePath, "a");
  await handle.close();
}
