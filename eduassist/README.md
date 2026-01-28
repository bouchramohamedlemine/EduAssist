# EduAssist

## Setup

**Create the Next.js + Supabase project:**

```bash
npx create-next-app -e with-supabase
```

**Enable the `vector` extension** (required for pgvector / semantic search):

- From the **Supabase Dashboard**: Database → Extensions → enable **vector**, or  
- In the **SQL Editor**, run:

```sql
create extension if not exists vector;
```

---

## Backend Overview

The backend uses **Supabase Edge Functions** and **PostgreSQL** for semantic search, then an **LLM** (Gemini) to generate learning materials. The flow has three main parts: search, generation, and save.

---

### 1. Semantic search (SQL + edge function)

Search is powered by a **SQL function** that finds document chunks by **cosine similarity** between the user’s query embedding and chunk embeddings.

#### `match_document_chunks`

```sql
create or replace function match_document_chunks(
    query_embedding vector(3072),
    similarity_threshold float,
    match_count int
)
returns table (
    chunk_id uuid,
    document_id uuid,
    content text,
    similarity float
)
language sql
as $$
    select
        id as chunk_id,
        document_id,
        content,
        1 - (embedding <=> query_embedding) as similarity
    from document_chunks
    where 1 - (embedding <=> query_embedding) > similarity_threshold
    order by embedding <=> query_embedding
    limit match_count;
$$;
```

- **`embedding <=> query_embedding`** is the cosine distance in pgvector.
- **`1 - (embedding <=> query_embedding)`** is the **similarity** (higher = more similar).
- Rows are **filtered** by `similarity_threshold` and **ordered** by distance, then we take **top `match_count`** chunks.

The **search edge function** (`search_knowledge_base`) uses this:

- Embeds the user query (e.g. same model/dims as chunk embeddings).
- Calls `match_document_chunks` with `similarity_threshold` and `match_count` (effectively top‑k).

We use **both** the similarity threshold and top‑k:

- **Top‑k** limits how many chunks we return.
- **Similarity threshold** ensures we only return chunks that are relevant enough. That keeps context high‑quality for the LLM and avoids answers when the question is outside the knowledge base.

If no chunks pass the threshold (or the result set is empty), we **do not** call the LLM and instead respond that the topic is not in our knowledge base (“we don’t know”).

---

### 2. LLM call (Gemini)

After search, we have a set of **relevant chunks** and the user’s **topic/question**.

- We use **Gemini 3 preview flash** for the LLM call.
- We send the LLM:
  - The **topic** (user query).
  - The **context**: the concatenated `content` of the retrieved chunks.

The **generate-learning-objectives** edge function performs this LLM call and returns the generated learning objectives (or other learning materials) based on that context.

---

### 3. Edge functions used

| Edge function | Role |
|---------------|------|
| **`search_knowledge_base`** | Embeds the query, calls `match_document_chunks`, returns matching chunks (and metadata). Uses similarity threshold + top‑k. |
| **`generate_learning_objectives`** | Takes `topic` + `context` (from search), calls Gemini, returns learning objectives. |
| **`save_content`** | Persists user‑saved content (e.g. topic, generated objectives, related `document_ids`) to the database. |

---

### End‑to‑end flow

1. User submits a topic or question.
2. **Search**: `search_knowledge_base` → `match_document_chunks` → chunks above `similarity_threshold`, up to top‑k.
3. If no chunks → respond “topic not in knowledge base”; stop.
4. **Generate**: Build `context` from chunk `content` → `generate_learning_objectives` → Gemini returns learning objectives.
5. **Save** (optional): User saves → `save_content` stores topic, objectives, and `document_ids`.
