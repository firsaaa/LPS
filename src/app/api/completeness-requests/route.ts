import { NextResponse } from "next/server";

// Completeness requests are out of scope for this TA implementation.
export async function GET() {
  return NextResponse.json([]);
}

export async function POST() {
  return NextResponse.json({ error: "Out of scope" }, { status: 410 });
}

export async function PUT() {
  return NextResponse.json({ error: "Out of scope" }, { status: 410 });
}
