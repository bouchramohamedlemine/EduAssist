import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const body = await request.json();

    // Validate request body
    if (!body.query) {
      return NextResponse.json(
        { error: "Missing required parameter: query" },
        { status: 400 }
      );
    }

    const requestBody: {
      query: string;
      top_k?: number;
      similarity_threshold?: number;
    } = {
      query: body.query,
    };

    // Only include top_k if provided
    if (body.top_k !== undefined && body.top_k !== null) {
      requestBody.top_k = body.top_k;
    }

    // Only include similarity_threshold if provided
    if (body.similarity_threshold !== undefined && body.similarity_threshold !== null) {
      requestBody.similarity_threshold = body.similarity_threshold;
    }

    console.log("Calling search_knowledge_base with:", JSON.stringify(requestBody, null, 2));

    // Use direct fetch to get better error details
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json(
        { error: "Supabase configuration missing" },
        { status: 500 }
      );
    }

    const functionUrl = `${supabaseUrl}/functions/v1/search_knowledge_base`;
    console.log("Calling edge function at:", functionUrl);

    try {
      const response = await fetch(functionUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify(requestBody),
      });

      const responseText = await response.text();
      console.log("Edge function response status:", response.status);
      console.log("Edge function response body:", responseText);

      if (!response.ok) {
        let errorData;
        try {
          errorData = JSON.parse(responseText);
        } catch {
          errorData = { message: responseText || `HTTP ${response.status}` };
        }

        return NextResponse.json(
          {
            error: errorData.error || errorData.message || `Edge function returned status ${response.status}`,
            details: {
              status: response.status,
              statusText: response.statusText,
              responseBody: errorData,
            },
          },
          { status: response.status }
        );
      }

      let data;
      try {
        data = JSON.parse(responseText);
      } catch {
        data = responseText;
      }

      console.log("Search results received:", data ? "Success" : "No data");
      return NextResponse.json(data);
    } catch (fetchError) {
      console.error("Fetch error:", fetchError);
      return NextResponse.json(
        {
          error: fetchError instanceof Error ? fetchError.message : "Failed to call edge function",
          type: "fetch_error",
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("API route error:", error);
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : "An error occurred",
        type: "api_error",
      },
      { status: 500 }
    );
  }
}
