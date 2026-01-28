# Document Chunking & Embedding Pipeline

This project processes PDF documents by chunking them semantically, generating embeddings using OpenAI, and storing the results in Supabase (database + storage).

---

## Setup

1. **Install dependencies**

```bash
pip install -r Upload_docs/requirements.txt
```

2. **Environment variables**

Create a `.env` file inside `Upload_docs/`:

```bash
OPENAI_API_KEY=<your_openai_api_key>
SUPABASE_URL=<your_supabase_url>
SUPABASE_ANON_KEY=<your_supabase_anon_key>
SUPABASE_STORAGE_BUCKET=<your_storage_bucket_name>
```

3. **Folders**

- `Upload_docs/New_docs/` — place PDFs to process here  
- `Upload_docs/Uploaded_docs/` — processed PDFs are moved here automatically

---

## Supabase Setup

1. **Enable `pgvector` extension**

   In the SQL editor (or Extensions tab), run:

   ```sql
   create extension if not exists vector;
   ```

2. **Create core tables**

   - **`documents`**

     ```sql
     create table documents (
       id uuid primary key default gen_random_uuid(),
       document_name text not null,
       created_at timestamptz default now()
     );
     ```

   - **`document_chunks`**

     ```sql
     create table document_chunks (
       id uuid primary key default gen_random_uuid(),
       document_id uuid not null
         references documents(id)
         on delete cascade,
       content text not null,
       embedding vector(3072) not null,
       page_index int not null,
       created_at timestamptz default now()
     );
     ```

   - **`saved_content`** (stores generated content tied to users and documents)

     ```sql
     create table saved_content (
       id uuid primary key default gen_random_uuid(),
       user_id uuid not null,
       topic text not null,
       content text not null,
       document_ids uuid[] not null,
       created_at timestamptz default now()
     );
     ```

3. **Edge Functions**

   - **Generate answer & title with Gemini**

     ```ts
     Deno.serve(async (req: Request) => {
       try {
         if (req.method !== "POST") {
           return new Response(
             JSON.stringify({ error: "Method not allowed" }),
             { status: 405, headers: { "Content-Type": "application/json" } }
           );
         }

         const { topic, context } = await req.json();

         if (!topic || typeof topic !== "string") {
           return new Response(
             JSON.stringify({ error: "Topic (question) is required" }),
             { status: 400, headers: { "Content-Type": "application/json" } }
           );
         }

         if (!context || typeof context !== "string") {
           return new Response(
             JSON.stringify({ error: "Context is required" }),
             { status: 400, headers: { "Content-Type": "application/json" } }
           );
         }

         const geminiKey = Deno.env.get("GEMINI_API_KEY");
         if (!geminiKey) {
           return new Response(
             JSON.stringify({ error: "Gemini API key not configured" }),
             { status: 500, headers: { "Content-Type": "application/json" } }
           );
         }

         const geminiModel = "gemini-3-flash-preview";

         const generateGeminiContent = async (prompt: string) => {
           const res = await fetch(
             `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiKey}`,
             {
               method: "POST",
               headers: { "Content-Type": "application/json" },
               body: JSON.stringify({
                 contents: [{ parts: [{ text: prompt }] }],
                 generationConfig: {
                   temperature: 0.5,
                   maxOutputTokens: 2000,
                 },
               }),
             }
           );

           if (!res.ok) {
             const errText = await res.text();
             throw new Error(
               `Gemini API error: ${res.status} ${res.statusText}: ${errText}`
             );
           }

           const data = await res.json();
           return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
         };

         const answerPrompt = `
You are an expert knowledge assistant, specializing in sexual consent education.

Task:
Using ONLY the context provided, generate a clear, actionable answer about consent.
The answer should be:
- Specific and measurable.
- Written as a statement of what a learner will be able to do after reading/studying the content.
Do NOT include explanations, filler text, or phrases like "Based on the context".

Topic:
${topic}

Context:
${context}
`;

         const answer = await generateGeminiContent(answerPrompt);

         const titlePrompt = `
Generate a short, clear title for the following content.
Rules:
- Return ONLY the title text
- No quotes
- No prefixes like "Title:" or "Heading:"

Question:
${topic}

Answer:
${answer}
`;

         let title = await generateGeminiContent(titlePrompt);

         title = title
           .replace(/^title\\s*[:\\-]\\s*/i, "")
           .replace(/^["']|["']$/g, "")
           .trim();

         return new Response(
           JSON.stringify({
             topic,
             title,
             answer,
             generated_at: new Date().toISOString(),
           }),
           { headers: { "Content-Type": "application/json" } }
         );
       } catch (err: any) {
         console.error("Generate content error:", err);
         return new Response(
           JSON.stringify({ error: err.message || "Internal server error" }),
           { status: 500, headers: { "Content-Type": "application/json" } }
         );
       }
     });
     ```

   - **Save generated content to `saved_content`**

     ```ts
     import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

     Deno.serve(async (req: Request) => {
       try {
         if (req.method !== "POST") {
           return new Response(
             JSON.stringify({ error: "Method not allowed" }),
             { status: 405, headers: { "Content-Type": "application/json" } }
           );
         }

         const { user_id, topic, content, document_ids } = await req.json();

         if (!user_id || typeof user_id !== "string") {
           return new Response(
             JSON.stringify({ error: "user_id is required" }),
             { status: 400, headers: { "Content-Type": "application/json" } }
           );
         }

         if (!topic || typeof topic !== "string") {
           return new Response(
             JSON.stringify({ error: "Topic is required" }),
             { status: 400, headers: { "Content-Type": "application/json" } }
           );
         }

         if (!content || typeof content !== "string") {
           return new Response(
             JSON.stringify({ error: "Content is required" }),
             { status: 400, headers: { "Content-Type": "application/json" } }
           );
         }

         if (!Array.isArray(document_ids) || document_ids.some(id => typeof id !== "string")) {
           return new Response(
             JSON.stringify({ error: "document_ids must be an array of UUID strings" }),
             { status: 400, headers: { "Content-Type": "application/json" } }
           );
         }

         const supabaseUrl = Deno.env.get("SUPABASE_URL");
         const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

         if (!supabaseUrl || !supabaseKey) {
           return new Response(
             JSON.stringify({ error: "Missing Supabase environment variables" }),
             { status: 500, headers: { "Content-Type": "application/json" } }
           );
         }

         const supabase = createClient(supabaseUrl, supabaseKey);

         const { data, error } = await supabase
           .from("saved_content")
           .insert([{ user_id, topic, content, document_ids }])
           .select();

         if (error) {
           throw new Error(`Supabase insert error: ${error.message}`);
         }

         return new Response(
           JSON.stringify({ success: true, saved: data }),
           { headers: { "Content-Type": "application/json" } }
         );
       } catch (err: any) {
         console.error("Save generated content error:", err);
         return new Response(
           JSON.stringify({ error: err.message || "Internal server error" }),
           { status: 500, headers: { "Content-Type": "application/json" } }
         );
       }
     });
     ```

   - **Vector search over `document_chunks`**

     ```ts
     import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

     const DOCUMENTS_BUCKET = "Documents";

     const OPENAI_EMBEDDING_URL = "https://api.openai.com/v1/embeddings";
     const EMBED_MODEL = "text-embedding-3-large";

     Deno.serve(async (req: Request) => {
       try {
         if (req.method !== "POST") {
           return new Response(
             JSON.stringify({ error: "Method not allowed" }),
             { status: 405 }
           );
         }

         const supabaseUrl = Deno.env.get("SUPABASE_URL");
         const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY");
         const openaiKey = Deno.env.get("OPENAI_API_KEY");

         if (!supabaseUrl || !supabaseKey || !openaiKey) {
           return new Response(
             JSON.stringify({
               error: "Missing environment variables",
               hint: "Check SUPABASE_URL, SUPABASE_ANON_KEY, OPENAI_API_KEY",
             }),
             { status: 500 }
           );
         }

         const { query, top_k, similarity_threshold } = await req.json();

         if (!query || typeof query !== "string") {
           return new Response(
             JSON.stringify({ error: "Query is required" }),
             { status: 400 }
           );
         }

         const match_count =
           typeof top_k === "number" && top_k > 0 ? top_k : 20;

         const similarity_thresh =
           typeof similarity_threshold === "number" &&
           similarity_threshold >= 0 &&
           similarity_threshold <= 1
             ? similarity_threshold
             : 0.1;

         const embeddingResponse = await fetch(OPENAI_EMBEDDING_URL, {
           method: "POST",
           headers: {
             "Content-Type": "application/json",
             Authorization: `Bearer ${openaiKey}`,
           },
           body: JSON.stringify({
             input: query,
             model: EMBED_MODEL,
           }),
         });

         if (!embeddingResponse.ok) {
           const errText = await embeddingResponse.text();
           throw new Error(`OpenAI error: ${errText}`);
         }

         const embeddingJson = await embeddingResponse.json();
         const embedding = embeddingJson?.data?.[0]?.embedding;

         if (!embedding) {
           throw new Error("Invalid embedding returned from OpenAI");
         }

         const supabase = createClient(supabaseUrl, supabaseKey);

         const { data, error } = await supabase.rpc("match_document_chunks", {
           query_embedding: embedding,
           similarity_threshold: similarity_thresh,
           match_count,
         });

         if (error) {
           throw new Error(`RPC error: ${error.message}`);
         }

         const results = (data ?? []).map((r: any) => {
           const { data: urlData, error: urlError } = supabase.storage
             .from(DOCUMENTS_BUCKET)
             .getPublicUrl(r.document_name);

           if (urlError) {
             console.warn("Failed to get public URL:", urlError.message);
           }

           return {
             id: r.chunk_id,
             content: r.content,
             similarity: r.similarity,
             metadata: {
               document_id: r.document_id,
               document_name: r.document_name,
               page_index: r.page_index,
               document_url: urlData?.publicUrl ?? null,
             },
           };
         });

         return new Response(JSON.stringify({ results }), {
           headers: { "Content-Type": "application/json" },
         });
       } catch (err: any) {
         console.error("Edge function error:", err);

         return new Response(
           JSON.stringify({
             error: err.message ?? "Internal server error",
           }),
           { status: 500 }
         );
       }
     });
     ```

---

## How It Works

- **Load PDFs** using `load_and_chunk_pdf(path)`.

- **Chunking**
  - `_smart_chunk_page_text(text, page_num)`:
    - Splits text into paragraphs
    - Detects headings (uppercase, numbered, or ending with `:`)
    - Groups paragraphs into ~1800-character chunks
    - Adds `page` and `section_title` metadata
  - If a chunk is > 2500 characters, it is further split using `SentenceSplitter()`.

- **Embedding**
  - `embed_chunks(chunks, openai_api_key)` calls the OpenAI API to generate embeddings for each chunk using the `text-embedding-3-large` model.

- **Storage**
  - `upload_to_storage(local_path, storage_bucket, supabase)` uploads PDFs to Supabase Storage.
  - If a file already exists in the bucket, the upload is skipped and **the document is not re-chunked or re-saved**.

- **Database**
  - `documents` table: stores metadata like document name and creation timestamp.
  - `document_chunks` table: stores chunk content, embeddings, and page index.
  - Records are inserted via `insert_document()` and `insert_chunks()` functions.

---

## Adding New Documents

1. Place your PDF(s) in `Upload_docs/New_docs/`.
2. Run:

```bash
cd Upload_docs
python chunk_embed.py
```

Notes:

- If the document already exists in the Supabase storage bucket, it will **not** be reprocessed.
- Successfully processed files are moved to `Upload_docs/Uploaded_docs/`.

---

## Summary

- **Chunking**: `_smart_chunk_page_text` + `SentenceSplitter`  
- **Embedding**: OpenAI `text-embedding-3-large`  
- **Storage**: Supabase Storage bucket  
- **Database**: Supabase `documents` + `document_chunks` tables  
- **Automation**: Add PDFs → run script → processed files moved automatically
