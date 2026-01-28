import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json(
        { error: "Supabase configuration missing" },
        { status: 500 }
      );
    }

    const requestBody = {
      topic: body.topic,
      context: body.context,
    };

    console.log("Calling generate_learning_objectives with context length:", body.context?.length || 0);
    const functionUrl = `${supabaseUrl}/functions/v1/generate_learning_objectives`;
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

      console.log("Generate results received:", data ? "Success" : "No data");
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
