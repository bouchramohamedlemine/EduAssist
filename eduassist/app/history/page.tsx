"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowLeft } from "lucide-react";
import Link from "next/link";

// Match ask page: render **bold** markdown
function renderMarkdown(text: string): React.ReactNode {
  let cleanedText = text
    .replace(/^\*\s+(?=\*\*)/gm, "")
    .replace(/(\s)\*\s+(?=\*\*)/g, "$1");

  const parts: (string | React.ReactElement)[] = [];
  let currentIndex = 0;
  const regex = /\*\*(.*?)\*\*/g;
  let match;

  while ((match = regex.exec(cleanedText)) !== null) {
    if (match.index > currentIndex) {
      parts.push(cleanedText.substring(currentIndex, match.index));
    }
    parts.push(<strong key={match.index}>{match[1]}</strong>);
    currentIndex = match.index + match[0].length;
  }

  if (currentIndex < cleanedText.length) {
    parts.push(cleanedText.substring(currentIndex));
  }

  return parts.length > 0 ? <>{parts}</> : cleanedText;
}

function removeLeadingNumber(text: string): string {
  let cleaned = text.replace(/^\s*[\*\-]\s+/, "");
  cleaned = cleaned.replace(/^\d+\.\s*(\d+\.\s*)*/, "");
  return cleaned.trim();
}

interface SavedContent {
  id: string;
  topic: string;
  content: string;
  created_at: string;
  document_ids?: string[];
}

export default function HistoryPage() {
  const [savedContent, setSavedContent] = useState<SavedContent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const fetchSavedContent = async () => {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          router.push("/auth/login");
          return;
        }

        const response = await fetch("/api/get-saved-content");
        
        if (!response.ok) {
          throw new Error("Failed to fetch saved content");
        }

        const data = await response.json();
        setSavedContent(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred");
      } finally {
        setIsLoading(false);
      }
    };

    fetchSavedContent();
  }, [router]);

  const parseContent = (content: string): string[] => {
    try {
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      // Not valid JSON, continue to parse as plain text
    }

    // Handle plain text with bullet points or numbered lists
    // Check for " * " bullet pattern (asterisks used as bullets)
    if (content.includes(" * ")) {
      // Split by " * " and filter out empty/intro text
      const parts = content.split(/\s+\*\s+/);
      const objectives = parts
        .map((part) => part.trim())
        .filter((part) => {
          if (!part) return false;
          const lower = part.toLowerCase();
          // Filter out intro text like "After studying this content, learners will be able to:"
          return !lower.includes("after studying") &&
                 !lower.includes("learners will be able to") &&
                 !lower.includes("here are") &&
                 part.length > 10; // Skip very short fragments
        });
      if (objectives.length > 0) {
        return objectives;
      }
    }

    // Check for numbered list pattern (1. , 2. , etc.)
    if (/\d+\.\s+/.test(content)) {
      const parts = content.split(/\n?\s*\d+\.\s+/);
      const objectives = parts
        .map((part) => part.trim())
        .filter((part) => part && part.length > 10);
      if (objectives.length > 0) {
        return objectives;
      }
    }

    // Fallback: return as single item
    return [content];
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (isLoading) {
    return (
      <div className="flex-1 w-full flex flex-col gap-12 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-muted-foreground">Loading your history...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 w-full flex flex-col gap-12 items-center justify-center">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Error</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/ask">Go Back</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex-1 w-full flex flex-col gap-8 items-center">
      <div className="w-full max-w-4xl">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/ask">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Link>
          </Button>
          <h1 className="text-3xl font-bold text-foreground">History</h1>
        </div>

        {savedContent.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>No Saved Content</CardTitle>
              <CardDescription>
                You haven't saved any learning materials yet.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild>
                <Link href="/ask">Create Learning Materials</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {savedContent.map((item) => {
              const objectives = parseContent(item.content);
              return (
                <Card key={item.id} className="border border-border shadow-sm">
                  <CardHeader>
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <CardTitle className="text-xl font-semibold text-foreground mb-2">
                          {item.topic}
                        </CardTitle>
                        <CardDescription className="text-sm text-muted-foreground">
                          {formatDate(item.created_at)}
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {objectives.map((objective, index) => {
                        const cleanedObjective = removeLeadingNumber(objective);
                        return (
                          <p
                            key={index}
                            className="text-base leading-relaxed"
                          >
                            {renderMarkdown(cleanedObjective)}
                          </p>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
