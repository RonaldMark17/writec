-- ==============================================================================
-- WriteCheck Supabase Schema for Plagiarism & Handwriting Detection
-- Run this in your Supabase SQL Editor (https://supabase.com/dashboard/project/_/sql)
-- ==============================================================================

-- 1. Enhance existing 'submissionTable' with OCR and Plagiarism Columns
ALTER TABLE IF EXISTS public."submissionTable"
  ADD COLUMN IF NOT EXISTS transcribed_text TEXT,
  ADD COLUMN IF NOT EXISTS scan_result JSONB,
  ADD COLUMN IF NOT EXISTS plagiarism_score NUMERIC;

-- 2. Create dedicated 'plagiarism_scans' table (mirroring plagiarism.db)
CREATE TABLE IF NOT EXISTS public.plagiarism_scans (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL DEFAULT 'anonymous',
    scan_id TEXT NOT NULL UNIQUE,
    filename TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    total_words INTEGER DEFAULT 0,
    plagiarism_score NUMERIC DEFAULT 0.0,
    identical_words INTEGER DEFAULT 0,
    result_data JSONB DEFAULT '{}'::jsonb,
    submitted_text TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- Index for fast scan retrieval
CREATE INDEX IF NOT EXISTS idx_plagiarism_scans_scan_id ON public.plagiarism_scans(scan_id);
CREATE INDEX IF NOT EXISTS idx_plagiarism_scans_user_id ON public.plagiarism_scans(user_id);

-- 3. Create dedicated 'submission_grades' table (mirroring plagiarism.db)
CREATE TABLE IF NOT EXISTS public.submission_grades (
    submission_id TEXT PRIMARY KEY,
    grade TEXT,
    feedback TEXT,
    status TEXT DEFAULT 'graded',
    transcribed_text TEXT,
    scan_result JSONB DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Configure Row Level Security (RLS) policies
ALTER TABLE public.plagiarism_scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submission_grades ENABLE ROW LEVEL SECURITY;

-- Allow public / authenticated read and write access for seamless sync
DROP POLICY IF EXISTS "Enable all operations for plagiarism_scans" ON public.plagiarism_scans;
CREATE POLICY "Enable all operations for plagiarism_scans"
    ON public.plagiarism_scans
    FOR ALL
    TO anon, authenticated
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "Enable all operations for submission_grades" ON public.submission_grades;
CREATE POLICY "Enable all operations for submission_grades"
    ON public.submission_grades
    FOR ALL
    TO anon, authenticated
    USING (true)
    WITH CHECK (true);

-- Ensure permission grants to anon and authenticated roles
GRANT ALL ON TABLE public.plagiarism_scans TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.submission_grades TO anon, authenticated, service_role;
GRANT ALL ON TABLE public."submissionTable" TO anon, authenticated, service_role;
