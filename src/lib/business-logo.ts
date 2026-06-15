import { Buffer } from "node:buffer";
import { getCloudflareContext } from "@opennextjs/cloudflare";

const LOGO_MARKER = /^kv:(image\/(?:png|jpeg)):(.+)$/;

function logoStore(): KVNamespace | undefined {
  try {
    return getCloudflareContext().env.LOGOS;
  } catch {
    return undefined;
  }
}

export function validateBusinessLogo(value: string): string {
  if (!value) return "";
  if (value.length > 7_100_000) throw new Error("The business logo must be smaller than 5 MB.");
  if (!/^data:image\/(?:png|jpeg);base64,[a-z0-9+/=]+$/i.test(value)) {
    throw new Error("The business logo must be a PNG or JPG image.");
  }
  return value;
}

export async function persistBusinessLogo(workspaceId: string, value: string): Promise<string> {
  const logo = validateBusinessLogo(value);
  const store = logoStore();
  if (!store) return logo;

  const key = `business-logo:${workspaceId}`;
  if (!logo) {
    await store.delete(key);
    return "";
  }

  const match = /^data:(image\/(?:png|jpeg));base64,(.+)$/i.exec(logo);
  if (!match) throw new Error("The business logo must be a PNG or JPG image.");
  await store.put(key, Buffer.from(match[2], "base64"));
  return `kv:${match[1].toLowerCase()}:${key}`;
}

export async function resolveBusinessLogo(value: string): Promise<string> {
  const marker = LOGO_MARKER.exec(value);
  if (!marker) return value;

  const bytes = await logoStore()?.get(marker[2], "arrayBuffer");
  if (!bytes) return "";
  return `data:${marker[1]};base64,${Buffer.from(bytes).toString("base64")}`;
}
