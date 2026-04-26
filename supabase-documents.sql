-- ============================================================
-- HomeKeeper — Documents feature
-- Safe to re-run: every CREATE is paired with IF NOT EXISTS or
-- a preceding DROP IF EXISTS.
-- ============================================================

-- ============================================================
-- DOCUMENTS table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  home_id UUID NOT NULL REFERENCES public.homes(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  category TEXT,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT,
  file_size BIGINT,
  notes TEXT,
  uploaded_by UUID REFERENCES auth.users(id),
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Home members can view documents" ON public.documents;
CREATE POLICY "Home members can view documents"
  ON public.documents FOR SELECT
  USING (home_id IN (SELECT home_id FROM public.home_members WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Home members can insert documents" ON public.documents;
CREATE POLICY "Home members can insert documents"
  ON public.documents FOR INSERT
  WITH CHECK (home_id IN (SELECT home_id FROM public.home_members WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Home members can update documents" ON public.documents;
CREATE POLICY "Home members can update documents"
  ON public.documents FOR UPDATE
  USING (home_id IN (SELECT home_id FROM public.home_members WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Home members can delete documents" ON public.documents;
CREATE POLICY "Home members can delete documents"
  ON public.documents FOR DELETE
  USING (home_id IN (SELECT home_id FROM public.home_members WHERE user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_documents_home_id ON public.documents(home_id);
CREATE INDEX IF NOT EXISTS idx_documents_uploaded_at ON public.documents(uploaded_at DESC);

-- ============================================================
-- STORAGE bucket for documents (private; access via signed URLs)
-- Path layout: {home_id}/{document_id}-{file_name}
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', false)
ON CONFLICT (id) DO NOTHING;

-- A user can read/write objects only when the first path segment
-- (the home_id) matches a household they belong to.
DROP POLICY IF EXISTS "Home members can read documents bucket" ON storage.objects;
CREATE POLICY "Home members can read documents bucket"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1]::uuid IN (
      SELECT home_id FROM public.home_members WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Home members can upload to documents bucket" ON storage.objects;
CREATE POLICY "Home members can upload to documents bucket"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1]::uuid IN (
      SELECT home_id FROM public.home_members WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Home members can delete from documents bucket" ON storage.objects;
CREATE POLICY "Home members can delete from documents bucket"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1]::uuid IN (
      SELECT home_id FROM public.home_members WHERE user_id = auth.uid()
    )
  );
