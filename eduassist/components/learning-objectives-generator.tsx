"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Helper function to render markdown bold syntax
function renderMarkdown(text: string): React.ReactNode {
  // Clean up leading list asterisks before bold text, e.g. "* **Communication:**" -> "**Communication:**"
  let cleanedText = text
    // Start of line: "* **" -> "**"
    .replace(/^\*\s+(?=\*\*)/gm, "")
    // In the middle of a sentence: " ... * **" -> " ... **"
    .replace(/(\s)\*\s+(?=\*\*)/g, "$1");

  const parts: (string | React.ReactElement)[] = [];
  let currentIndex = 0;
  const regex = /\*\*(.*?)\*\*/g;
  let match;

  while ((match = regex.exec(cleanedText)) !== null) {
    // Add text before the match
    if (match.index > currentIndex) {
      parts.push(cleanedText.substring(currentIndex, match.index));
    }
    // Add the bold text
    parts.push(<strong key={match.index}>{match[1]}</strong>);
    currentIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (currentIndex < cleanedText.length) {
    parts.push(cleanedText.substring(currentIndex));
  }

  return parts.length > 0 ? <>{parts}</> : cleanedText;
}

// Helper function to remove leading bullets and numbers from objectives
function removeLeadingNumber(text: string): string {
  // Remove leading bullet markers like "* " or "- "
  let cleaned = text.replace(/^\s*[\*\-]\s+/, "");
  // Remove patterns like "1. ", "1.1. ", "1. 1. ", etc.
  cleaned = cleaned.replace(/^\d+\.\s*(\d+\.\s*)*/, "");
  return cleaned.trim();
}
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

interface ContentChunk {
  id?: string;
  content: string;
  document_id?: string;
  similarity?: number;
  metadata?: {
    document_id?: string;
    page_index?: number;
    document_name?: string;
    document_url?: string;
    name?: string;
    url?: string;
    [key: string]: any;
  };
}

export function LearningObjectivesGenerator() {
  const [topic, setTopic] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [contentChunks, setContentChunks] = useState<ContentChunk[]>([]);
  const [title, setTitle] = useState<string | null>(null);
  const [learningObjectives, setLearningObjectives] = useState<string[]>([]);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
            if (!topic.trim()) {
              setError("Please enter a question or describe what learning materials you'd like to create");
              return;
            }

    setIsLoading(true);
    setError(null);
    setSaveError(null);
    setSaveSuccess(false);
    setContentChunks([]);
    setTitle(null);
    setLearningObjectives([]);

    try {
      // Search knowledge base
      console.log("Calling search_knowledge_base with:", { query: topic });
      
      const searchResponse = await fetch("/api/search-knowledge-base", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: topic,
          // top_k and similarity_threshold are optional - edge function will use defaults if not provided
        }),
      });

      if (!searchResponse.ok) {
        const errorData = await searchResponse.json().catch(() => ({ error: "Unknown error" }));
        const errorMessage = errorData.error || searchResponse.statusText;
        const errorDetails = errorData.details ? `\n\nDetails: ${JSON.stringify(errorData.details, null, 2)}` : "";
        throw new Error(
          `Failed to search knowledge base: ${errorMessage}${errorDetails}`
        );
      }

      const searchData = await searchResponse.json();

      // Handle different response formats
      let chunks: ContentChunk[] = [];
      
      if (Array.isArray(searchData)) {
        chunks = searchData.map((chunk) => ({
          id: chunk.id,
          content: chunk.content || '',
          document_id: chunk.document_id || chunk.metadata?.document_id,
          similarity: chunk.similarity,
          metadata: chunk.metadata,
        }));
      } else if (searchData && typeof searchData === 'object') {
        // Check if the array is nested in a property
        const resultsArray = searchData.results || searchData.data || searchData.chunks || [];
        chunks = resultsArray.map((chunk: any) => ({
          id: chunk.id,
          content: chunk.content || '',
          document_id: chunk.document_id || chunk.metadata?.document_id,
          similarity: chunk.similarity,
          metadata: chunk.metadata,
        }));
      }

      console.log("Content chunks count:", chunks.length);
      setContentChunks(chunks);

      // Check if we have any context
      if (chunks.length === 0) {
        throw new Error("This topic is not in our knowledge base. Please try a different topic or question.");
      }

      // Step 2: Generate learning objectives using the content as context
      const context = chunks
        .map((chunk) => chunk.content)
        .filter(Boolean)
        .join("\n\n");

      if (!context || context.trim().length === 0) {
        throw new Error("This topic is not in our knowledge base. Please try a different topic or question.");
      }

      console.log("Calling generate_learning_objectives with context length:", context.length);
      
      const generateResponse = await fetch("/api/generate-learning-objectives", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          topic: topic,
          context: context,
        }),
      });

      if (!generateResponse.ok) {
        const errorData = await generateResponse.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(
          `Failed to generate learning objectives: ${errorData.error || generateResponse.statusText}`
        );
      }

      const generateData = await generateResponse.json();
      // Handle different response formats
      let extractedTitle: string | null = null;
      let extractedObjectives: string[] = [];

      if (generateData) {
        // Check if it's the expected format
        if (generateData.title && Array.isArray(generateData.learning_objectives)) {
          extractedTitle = generateData.title;
          extractedObjectives = generateData.learning_objectives;
        } else if (generateData.title && typeof generateData.learning_objectives === 'string') {
          // learning_objectives is a string - parse it into an array
          extractedTitle = generateData.title;
          const objectivesString = generateData.learning_objectives;
          
          // Try to split by numbered list items (1., 2., 3., etc.)
          const objectivesArray = objectivesString
            .split(/\n\s*\d+\.\s+/)
            .filter((item: string) => item.trim().length > 0)
            .map((item: string) => item.trim());
          
          if (objectivesArray.length > 0) {
            extractedObjectives = objectivesArray;
          } else {
            // If splitting didn't work, try splitting by newlines
            extractedObjectives = objectivesString
              .split('\n')
              .filter((item: string) => item.trim().length > 0 && !item.trim().startsWith('Here are'))
              .map((item: string) => item.trim());
          }
        } else if (generateData.title && generateData.objectives) {
          extractedTitle = generateData.title;
          if (Array.isArray(generateData.objectives)) {
            extractedObjectives = generateData.objectives;
          } else if (typeof generateData.objectives === 'string') {
            // Parse string objectives
            extractedObjectives = generateData.objectives
              .split(/\n\s*\d+\.\s+/)
              .filter((item: string) => item.trim().length > 0)
              .map((item: string) => item.trim());
          }
        } else if (Array.isArray(generateData)) {
          extractedObjectives = generateData;
        } else if (typeof generateData === 'object') {
          extractedTitle = generateData.title;
          const objectives = generateData.answer;
          
          if (Array.isArray(objectives)) {
            extractedObjectives = objectives;
          } else if (typeof objectives === 'string') {
            // Parse string objectives
            extractedObjectives = objectives
              .split(/\n\s*\d+\.\s+/)
              .filter((item: string) => item.trim().length > 0 && !item.trim().startsWith('Here are'))
              .map((item: string) => item.trim());
          } else {
            extractedObjectives = [];
          }
        }
      }

      // Clean learning objectives - remove intro text
      const cleanedObjectives = extractedObjectives.filter((obj: string) => {
        const lower = obj.toLowerCase();
        return !lower.includes('here are') && 
               !lower.includes('based on the provided context') &&
               !lower.includes('learning objectives about');
      });

      console.log("Extracted title:", extractedTitle);
      console.log("Extracted learning objectives count:", cleanedObjectives.length);

      setTitle(extractedTitle);
      setLearningObjectives(cleanedObjectives);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (learningObjectives.length === 0) {
      setSaveError("No learning materials to save");
      return;
    }

    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      // Get unique document IDs using Set
      const uniqueDocumentIds = Array.from(
        new Set(
          contentChunks
            .map((chunk) => chunk.document_id || chunk.metadata?.document_id)
            .filter((id): id is string => Boolean(id))
        )
      );

      // Use title as topic, and save only learning objectives as content
      const saveResponse = await fetch("/api/save-content", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          user_id: user?.id || null,
          topic: title || topic, // Use the generated title as topic
          content: JSON.stringify(learningObjectives), // Save only the learning objectives array
          document_ids: uniqueDocumentIds,
        }),
      });

      if (!saveResponse.ok) {
        const errorData = await saveResponse.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(errorData.error || "Failed to save content");
      }

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000); // Hide success message after 3 seconds
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : "Failed to save content");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-8 w-full max-w-3xl">
      <Card className="border border-border shadow-sm">
        <CardHeader className="pb-6">
          <CardTitle className="text-2xl font-semibold text-foreground">
            Ask Your Question
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleGenerate} className="flex flex-col gap-6">
            <div className="grid gap-3">
              <Input
                id="topic"
                type="text"
                placeholder="Enter a question or topic to generate learning materials"
                required
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                disabled={isLoading}
                className="h-12 text-base border-2 focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
              />
            </div>
            {error && (
              <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                {error}
              </div>
            )}
            <Button 
              type="submit" 
              className="w-full h-12 text-base font-medium bg-primary hover:bg-primary/90 text-primary-foreground shadow-md hover:shadow-lg transition-all" 
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Learning Materials"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {(title || learningObjectives.length > 0) && (
        <Card className="border border-border shadow-sm">
          <CardHeader>
            {title && (
              <div className="text-xl font-semibold text-foreground mb-4">
                {renderMarkdown(title)}
              </div>
            )}
          </CardHeader>
          <CardContent>
            {saveError && (
              <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm mb-4">
                {saveError}
              </div>
            )}
            {saveSuccess && (
              <div className="p-4 rounded-lg bg-green-50 border border-green-200 text-green-800 text-sm mb-4">
                Content saved successfully!
              </div>
            )}
            {learningObjectives.length > 0 ? (
              <div className="space-y-3 mb-6">
                {learningObjectives.map((objective, index) => {
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
            ) : (
              <p className="text-sm text-muted-foreground mb-6">
                No learning materials generated.
              </p>
            )}
            <div className="flex justify-center">
              <Button
                onClick={handleSave}
                disabled={isSaving || learningObjectives.length === 0}
                className="bg-secondary hover:bg-secondary/90 text-secondary-foreground shadow-sm hover:shadow-md transition-all"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save"
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {contentChunks.length > 0 && (title || learningObjectives.length > 0) && (() => {
        // Create a Map of unique documents by document_id
        const uniqueDocuments = new Map<string, {
          documentId: string;
          documentName: string;
          documentUrl?: string;
          maxSimilarity?: number;
          pageIndexes: Set<number>;
        }>();

        contentChunks.forEach((chunk) => {
          const documentId = chunk.document_id || chunk.metadata?.document_id;
          if (!documentId) return;

          const pageIndex = chunk.metadata?.page_index;

          if (!uniqueDocuments.has(documentId)) {
            // Get document name and URL from metadata.
            // Prefer a human-readable name and avoid exposing the raw document ID in the UI.
            const documentName = chunk.metadata?.document_name || 
                                chunk.metadata?.name || 
                                "Document";
            const documentUrl = chunk.metadata?.document_url || 
                               chunk.metadata?.url || 
                               undefined;

            uniqueDocuments.set(documentId, {
              documentId,
              documentName,
              documentUrl,
              maxSimilarity: chunk.similarity,
              pageIndexes: pageIndex !== undefined ? new Set([pageIndex]) : new Set(),
            });
          } else {
            // Update max similarity if this chunk has a higher similarity
            const existing = uniqueDocuments.get(documentId)!;
            if (chunk.similarity !== undefined && 
                (existing.maxSimilarity === undefined || chunk.similarity > existing.maxSimilarity)) {
              existing.maxSimilarity = chunk.similarity;
            }
            // Update document name/URL if not already set and this chunk has it
            if (!existing.documentName || existing.documentName.startsWith('Document ')) {
              const documentName = chunk.metadata?.document_name || chunk.metadata?.name;
              if (documentName) {
                existing.documentName = documentName;
              }
            }
            if (!existing.documentUrl) {
              const documentUrl = chunk.metadata?.document_url || chunk.metadata?.url;
              if (documentUrl) {
                existing.documentUrl = documentUrl;
              }
            }
            // Track all unique page indexes this document contributed from
            if (pageIndex !== undefined) {
              existing.pageIndexes.add(pageIndex);
            }
          }
        });

        const uniqueDocumentsArray = Array.from(uniqueDocuments.values());

        return (
          <Card className="border border-border shadow-sm">
            <CardHeader>
              <CardTitle className="text-xl font-semibold text-foreground">
                Source Documents
              </CardTitle>
              <CardDescription className="text-muted-foreground mt-2">
                {uniqueDocumentsArray.length} unique document{uniqueDocumentsArray.length !== 1 ? 's' : ''} from our knowledge base used to create these learning materials
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {uniqueDocumentsArray.map((doc) => (
                  <div 
                    key={doc.documentId} 
                    className="flex items-center justify-between p-4 border border-border rounded-lg hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex-1">
                      {doc.documentUrl ? (
                        <a
                          href={`/api/view-document?url=${encodeURIComponent(doc.documentUrl)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm font-semibold text-primary hover:text-secondary transition-colors flex items-center gap-2 group"
                        >
                          {doc.documentName}
                          <svg
                            className="w-4 h-4 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                            />
                          </svg>
                        </a>
                      ) : (
                        <span className="text-sm font-semibold">{doc.documentName}</span>
                      )}
                      <p className="text-xs text-muted-foreground mt-2 space-y-1 font-medium">
                        {doc.maxSimilarity !== undefined && (
                          <span className="block">
                            Max Similarity:{" "}
                            <span className="text-secondary font-semibold">
                              {(doc.maxSimilarity * 100).toFixed(2)}%
                            </span>
                          </span>
                        )}
                        {doc.pageIndexes.size > 0 && (
                          <span className="block">
                            Pages:{" "}
                            {Array.from(doc.pageIndexes)
                              .sort((a, b) => a - b)
                              .join(", ")}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })()}
    </div>
  );
}
