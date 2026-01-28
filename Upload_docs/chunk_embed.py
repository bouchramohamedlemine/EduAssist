import os
import shutil
import requests
from dotenv import load_dotenv
from supabase import create_client, Client
from storage3.exceptions import StorageApiError
from llama_index.readers.file import PDFReader
from llama_index.core.node_parser import SentenceSplitter
from typing import List, Dict, Tuple

# Load environment variables
load_dotenv()

EMBED_MODEL = "text-embedding-3-large"
EMBED_DIM = 3072

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
NEW_DOCS_DIR = os.path.join(BASE_DIR, "New_docs")
UPLOADED_DOCS_DIR = os.path.join(BASE_DIR, "Uploaded_docs")

splitter = SentenceSplitter(
    # smaller, lighter chunks for faster retrieval + context passing
    chunk_size=1000,
    chunk_overlap=200,
)


def _smart_chunk_page_text(
    text: str,
    page_num: int,
    # slightly smaller semantic chunks to avoid over-long context blocks
    target_chars: int = 1800,
) -> List[Dict]:
    """
    Heuristic, paragraph/section-aware chunking for better reasoning:
    - Keeps section headings with their following paragraphs
    - Builds chunks around a target character size instead of raw sentences only
    - Attaches page and simple section metadata
    """
    paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]

    def is_heading(p: str) -> bool:
        one_line = p.replace("\n", " ").strip()
        if len(one_line) > 120:
            return False
        # simple heading heuristics
        if one_line.isupper():
            return True
        if one_line.endswith(":"):
            return True
        if any(one_line.startswith(prefix) for prefix in ("1.", "2.", "3.", "4.", "5.")):
            return True
        return False

    chunks: List[Dict] = []
    current_section = None
    buffer: List[str] = []

    for para in paragraphs:
        if is_heading(para):
            # flush previous buffer as a chunk
            if buffer:
                content = "\n\n".join(buffer).strip()
                if content:
                    chunks.append(
                        {
                            "content": content,
                            "page": page_num,
                            "section_title": current_section,
                        }
                    )
                buffer = []
            current_section = para.replace("\n", " ").strip()
            continue

        buffer.append(para)
        # if buffer too big, cut a chunk
        if sum(len(p) for p in buffer) >= target_chars:
            content = "\n\n".join(buffer).strip()
            if content:
                chunks.append(
                    {
                        "content": content,
                        "page": page_num,
                        "section_title": current_section,
                    }
                )
            buffer = []

    # final buffer
    if buffer:
        content = "\n\n".join(buffer).strip()
        if content:
            chunks.append(
                {
                    "content": content,
                    "page": page_num,
                    "section_title": current_section,
                }
            )

    return chunks






def load_and_chunk_pdf(path: str) -> List[Dict]:
    docs = PDFReader().load_data(file=path)

    chunks = []

    for page_num, doc in enumerate(docs):
        text = doc.text
        if not text:
            continue

        # First we do heuristic section-aware chunking at page level
        page_chunks = _smart_chunk_page_text(text, page_num + 1)

        # Then we refine long chunks with sentence-based splitter
        for page_chunk in page_chunks:
            if len(page_chunk["content"]) > 2500:
                refined = splitter.split_text(page_chunk["content"])
                for sub in refined:
                    chunks.append(
                        {
                            "content": sub,
                            "page": page_chunk["page"],
                            "section_title": page_chunk["section_title"],
                        }
                    )
            else:
                chunks.append(page_chunk)

    return chunks






def embed_chunks(chunks: List[Dict], openai_api_key: str) -> List[List[float]]:
    if not openai_api_key:
        raise ValueError("OPENAI_API_KEY not set")

    embeddings: List[List[float]] = []

    for i, chunk in enumerate(chunks):
        text = chunk["content"]

        response = requests.post(
            "https://api.openai.com/v1/embeddings",
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {openai_api_key}"
            },
            json={"input": text, "model": EMBED_MODEL, "dimensions": EMBED_DIM}
        )

        response.raise_for_status()
        embedding = response.json()["data"][0]["embedding"]
        embeddings.append(embedding)

        if (i + 1) % 10 == 0:
            print(f"Embedded {i + 1}/{len(chunks)} chunks")

    return embeddings





def upload_to_storage(
    local_path: str,
    storage_bucket: str,
    supabase: Client,
) -> Tuple[str, bool]:
    """
    Upload a file to Supabase Storage.
    Returns (storage_path, was_uploaded).
    was_uploaded is False if the file already existed in the bucket (409).
    """
    filename = os.path.basename(local_path)
    storage_path = filename   

    try:
        with open(local_path, "rb") as f:
            # supabase-py upload: upload(path_in_bucket, file_obj)
            supabase.storage.from_(storage_bucket).upload(storage_path, f)
    except StorageApiError as e:
        # 409 Duplicate: file already exists in bucket – skip re-upload
        text = str(e)
        if "Duplicate" in text or "statusCode': 409" in text or '"statusCode": 409' in text:
            print(f"File {storage_path} already exists in storage, skipping upload.")
            return storage_path, False
        # For any other storage error, re-raise
        raise

    return storage_path, True





def insert_document(
    document_name: str,
    supabase: Client,
) -> str:
    """
    Insert into public.documents:
      id uuid primary key default gen_random_uuid(),
      document_name text not null,
      created_at timestamptz not null default now()
    """
    result = (
        supabase.table("documents")
        .insert({"document_name": document_name})
        .execute()
    )

    return result.data[0]["id"]  # UUID generated by Postgres




def insert_chunks(
    chunks,
    embeddings,
    document_id: str,
    supabase: Client
) -> int:
    records = []

    for i, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
        records.append(
            {
                "document_id": document_id,
                "content": chunk["content"],
                "embedding": embedding,
                # map our in-memory page number to the DB column `page_index`
                "page_index": chunk["page"],
            }
        )

    batch_size = 100
    total = 0

    for i in range(0, len(records), batch_size):
        supabase.table("document_chunks").insert(
            records[i:i + batch_size]
        ).execute()
        total += len(records[i:i + batch_size])

    return total





if __name__ == "__main__":
    openai_api_key = os.getenv("OPENAI_API_KEY")
    supabase_url = os.getenv("SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_ANON_KEY")
    storage_bucket = os.getenv("SUPABASE_STORAGE_BUCKET")

    if not openai_api_key:
        raise ValueError("OPENAI_API_KEY not set")

    if not supabase_url or not supabase_key:
        raise ValueError("Supabase credentials not set")

    if not storage_bucket:
        raise ValueError("SUPABASE_STORAGE_BUCKET not set")

    supabase: Client = create_client(supabase_url, supabase_key)

    # Ensure folders exist
    os.makedirs(NEW_DOCS_DIR, exist_ok=True)
    os.makedirs(UPLOADED_DOCS_DIR, exist_ok=True)

    for filename in os.listdir(NEW_DOCS_DIR):
        if not filename.lower().endswith(".pdf"):
            continue

        file_path = os.path.join(NEW_DOCS_DIR, filename)
        print(f"\n Processing {filename}")

        # Upload original file to Supabase Storage (skip chunk/save if already in bucket)
        storage_path, was_uploaded = upload_to_storage(file_path, storage_bucket, supabase)
        if not was_uploaded:
            print(f"Skipping chunk/embed/save for {filename} (already in bucket).")
            continue

        print(f"Uploaded to storage at path: {storage_path}")

        # Insert document record (store document_name as the file path, e.g. 'report.pdf')
        document_name = filename
        document_id = insert_document(document_name, supabase)
        print(f"Document ID: {document_id}")

        # Chunk
        chunks = load_and_chunk_pdf(file_path)
        print(f"Created {len(chunks)} chunks")

        # Embed
        embeddings = embed_chunks(chunks, openai_api_key)
        print(f"Created {len(embeddings)} embeddings")

        # Insert chunks
        total = insert_chunks(chunks, embeddings, document_id, supabase)
        print(f" Inserted {total} chunks for {filename}")

        # Move processed file to Uploaded_docs
        dest_path = os.path.join(UPLOADED_DOCS_DIR, filename)
        shutil.move(file_path, dest_path)
        print(f"Moved {filename} to Uploaded_docs")
