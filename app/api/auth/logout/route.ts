import { NextResponse, type NextRequest } from "next/server";
import { checkOrigin } from "@/lib/api";
import { endSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * A route handler rather than a Server Function, so the sign-out form can live in a
 * client component without that component importing the server-only session module.
 * A plain form post also means sign-out works with JavaScript disabled.
 */
export async function POST(request: NextRequest) {
  const blocked = checkOrigin(request);
  if (blocked) return blocked;

  await endSession();
  return NextResponse.redirect(new URL("/login", request.url), { status: 303 });
}
