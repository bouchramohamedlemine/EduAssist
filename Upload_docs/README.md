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

   You can implement optional Edge Functions (for answering questions with Gemini, saving generated content, and performing vector search over `document_chunks`) separately in your Supabase project.

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
