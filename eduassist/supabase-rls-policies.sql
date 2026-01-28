-- RLS Policies for documents table
-- Run this SQL in your Supabase SQL Editor
-- This will drop existing policies if they exist and create new ones

-- First, verify the table exists and has the correct structure
-- Expected structure:
-- create table documents (
--   id uuid primary key default gen_random_uuid(),
--   user_id uuid not null references auth.users(id) on delete cascade,
--   document_path text not null,
--   document_url text not null,
--   created_at timestamptz default now()
-- );

-- Enable RLS on documents table (if not already enabled)
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "Users can insert their own documents" ON documents;
DROP POLICY IF EXISTS "Users can select their own documents" ON documents;
DROP POLICY IF EXISTS "Users can update their own documents" ON documents;
DROP POLICY IF EXISTS "Users can delete their own documents" ON documents;

-- Policy: Allow users to insert their own documents
-- This policy checks that the user_id being inserted matches the authenticated user's ID
CREATE POLICY "Users can insert their own documents"
ON documents
FOR INSERT
TO authenticated
WITH CHECK (auth.uid()::text = user_id::text);

-- Policy: Allow users to select their own documents
CREATE POLICY "Users can select their own documents"
ON documents
FOR SELECT
TO authenticated
USING (auth.uid()::text = user_id::text);

-- Policy: Allow users to update their own documents
CREATE POLICY "Users can update their own documents"
ON documents
FOR UPDATE
TO authenticated
USING (auth.uid()::text = user_id::text)
WITH CHECK (auth.uid()::text = user_id::text);

-- Policy: Allow users to delete their own documents
CREATE POLICY "Users can delete their own documents"
ON documents
FOR DELETE
TO authenticated
USING (auth.uid()::text = user_id::text);

-- Verify policies were created
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'documents';
