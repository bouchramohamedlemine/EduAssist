-- Quick test: Check if RLS is enabled and what policies exist
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

-- If no policies show up, run this to create a simple test policy:
-- (Only run this if the above query shows no policies)

-- First, make sure RLS is enabled
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- Create a simple insert policy (drop if exists first)
DROP POLICY IF EXISTS "test_insert_policy" ON documents;

CREATE POLICY "test_insert_policy"
ON documents
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);
