import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const prisma = await getPrisma();
    await prisma.workspace.count();
    return NextResponse.json(
      { status: "ok" },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Health check failed.", error);
    return NextResponse.json(
      { status: "error" },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
