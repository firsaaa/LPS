import { NextResponse } from "next/server";

// Notifications are out of scope for this TA implementation.
export async function GET() {
  return NextResponse.json({ notifications: [], unreadCount: 0 });
}
