import { NextResponse } from "next/server";

export function GET() {
  if (process.env.NODE_ENV === "production") {
    return new NextResponse("Not Found", { status: 404 });
  }
  return NextResponse.json({ ok: true, service: "asgc-os-web" });
}
