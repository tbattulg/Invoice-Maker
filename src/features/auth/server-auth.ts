import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { getPrisma } from "@/lib/prisma";

const SESSION_COOKIE = "invoice-creator-session";
const SESSION_LIFETIME_MS = 1000 * 60 * 60 * 24 * 30;
const scrypt = promisify(scryptCallback);

export type AuthUser = {
  id: string;
  email: string;
};

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function createPasswordCredentials(password: string) {
  const passwordSalt = randomBytes(16).toString("base64url");
  return {
    passwordSalt,
    passwordHash: await derivePasswordHash(password, passwordSalt)
  };
}

export async function verifyPassword(
  password: string,
  passwordSalt: string,
  expectedHash: string
) {
  const candidateHash = await derivePasswordHash(password, passwordSalt);
  const candidate = Buffer.from(candidateHash, "base64url");
  const expected = Buffer.from(expectedHash, "base64url");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

export async function createSession(userId: string) {
  const prisma = await getPrisma();
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_LIFETIME_MS);
  await prisma.session.create({
    data: {
      userId,
      tokenHash: hashSessionToken(token),
      expiresAt
    }
  });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt
  });
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const prisma = await getPrisma();
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    include: { user: { select: { id: true, email: true } } }
  });
  if (!session || session.expiresAt <= new Date()) return null;
  return session.user;
}

export async function requireCurrentUser() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Your session has expired. Please log in again.");
  return user;
}

export async function clearSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    const prisma = await getPrisma();
    await prisma.session.deleteMany({ where: { tokenHash: hashSessionToken(token) } });
  }
  cookieStore.delete(SESSION_COOKIE);
}

async function derivePasswordHash(password: string, passwordSalt: string) {
  const result = (await scrypt(password, passwordSalt, 64)) as Buffer;
  return result.toString("base64url");
}

function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
