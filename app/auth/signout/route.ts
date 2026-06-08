import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Signs the user out and returns them to the login screen. */
export async function POST(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/login", request.url), { status: 303 });
}
