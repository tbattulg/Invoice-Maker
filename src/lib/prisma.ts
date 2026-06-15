import path from "node:path";
import { pathToFileURL } from "node:url";
import type { PrismaClient, Prisma } from "@prisma/client";
import { PrismaClient as WorkerPrismaClient } from "@prisma/client/wasm";
import { PrismaD1 } from "@prisma/adapter-d1";
import { getCloudflareContext } from "@opennextjs/cloudflare";

declare global {
  interface CloudflareEnv {
    DB: D1Database;
    LOGOS: KVNamespace;
  }
}

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  d1PrismaClients?: WeakMap<D1Database, PrismaClient>;
  d1Clients?: WeakSet<PrismaClient>;
};

export async function getPrisma(): Promise<PrismaClient> {
  let database: D1Database | undefined;
  try {
    database = getCloudflareContext().env.DB;
  } catch {
    // The Cloudflare request context is unavailable in local Node.js and at build time.
  }

  if (database) {
    const clients = globalForPrisma.d1PrismaClients ?? new WeakMap<D1Database, PrismaClient>();
    globalForPrisma.d1PrismaClients = clients;
    const cached = clients.get(database);
    if (cached) return cached;
    const client = new WorkerPrismaClient({
      adapter: new PrismaD1(database)
    }) as PrismaClient;
    clients.set(database, client);
    globalForPrisma.d1Clients ??= new WeakSet<PrismaClient>();
    globalForPrisma.d1Clients.add(client);
    return client;
  }

  globalForPrisma.prisma ??= await createLocalPrismaClient();
  return globalForPrisma.prisma;
}

export async function runPrismaTransaction<T>(
  client: PrismaClient,
  operation: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  if (globalForPrisma.d1Clients?.has(client)) {
    return operation(client as unknown as Prisma.TransactionClient);
  }
  return client.$transaction(operation);
}

async function createLocalPrismaClient() {
  const clientPath = pathToFileURL(
    path.join(process.cwd(), "node_modules", ".prisma", "local-client", "index.js")
  ).href;
  const { PrismaClient: LocalPrismaClient } = await import(
    /* webpackIgnore: true */ clientPath
  );
  return new LocalPrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"]
  }) as PrismaClient;
}
