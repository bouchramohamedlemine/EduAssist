import { NextResponse } from "next/server";

export async function POST(request: Request) {
  return NextResponse.json(
    { error: "Document upload is disabled." },
    { status: 403 }
  );
}
