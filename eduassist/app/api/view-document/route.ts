import { NextRequest, NextResponse } from "next/server";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;

/**
 * Proxies a document (PDF) from Supabase Storage and serves it with
 * Content-Disposition: inline so the browser displays it instead of
 * downloading or showing raw bytes.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get("url");

    if (!url) {
      return NextResponse.json(
        { error: "Missing url query parameter" },
        { status: 400 }
      );
    }

    // Only allow proxying our own Supabase Storage URLs
    if (!SUPABASE_URL || !url.startsWith(SUPABASE_URL)) {
      return NextResponse.json(
        { error: "Invalid document URL" },
        { status: 403 }
      );
    }

    const res = await fetch(url, {
      headers: {
        Accept: "application/pdf",
      },
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: "Failed to fetch document" },
        { status: res.status }
      );
    }

    const contentType =
      res.headers.get("Content-Type") || "application/pdf";

    return new NextResponse(res.body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": "inline",
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (err) {
    console.error("view-document error:", err);
    return NextResponse.json(
      { error: "Failed to load document" },
      { status: 500 }
    );
  }
}
