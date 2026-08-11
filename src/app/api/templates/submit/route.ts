import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({ error: "Templates are out of scope" }, { status: 410 });
}
