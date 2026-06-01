-- ============================================================================
-- Tidy Tails v2 — day closeout payout overrides
-- Authored: 2026-06-01
--
-- Purpose:
--   Store one operator-reviewed salon payout override per date + salon location.
--   This keeps customer appointment payments/tips separate from end-of-day
--   settlement math for Gina/Annette.
--
-- Safety:
--   - Additive schema only.
--   - No existing production rows are changed.
--   - RLS scopes all reads/writes to auth.uid().
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.day_closeout_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  groomer_id uuid NOT NULL REFERENCES auth.users(id) DEFAULT auth.uid(),
  date date NOT NULL,
  location text NOT NULL CHECK (location IN ('gina', 'annette')),
  final_payout numeric(10,2) NOT NULL CHECK (final_payout >= 0),
  calculated_payout numeric(10,2) CHECK (calculated_payout IS NULL OR calculated_payout >= 0),
  note text NOT NULL CHECK (char_length(trim(note)) BETWEEN 1 AND 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (groomer_id, date, location)
);

ALTER TABLE public.day_closeout_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "groomer_select" ON public.day_closeout_overrides;
CREATE POLICY "groomer_select" ON public.day_closeout_overrides
  FOR SELECT USING (groomer_id = auth.uid());

DROP POLICY IF EXISTS "groomer_insert" ON public.day_closeout_overrides;
CREATE POLICY "groomer_insert" ON public.day_closeout_overrides
  FOR INSERT WITH CHECK (groomer_id = auth.uid());

DROP POLICY IF EXISTS "groomer_update" ON public.day_closeout_overrides;
CREATE POLICY "groomer_update" ON public.day_closeout_overrides
  FOR UPDATE USING (groomer_id = auth.uid()) WITH CHECK (groomer_id = auth.uid());

DROP POLICY IF EXISTS "groomer_delete" ON public.day_closeout_overrides;
CREATE POLICY "groomer_delete" ON public.day_closeout_overrides
  FOR DELETE USING (groomer_id = auth.uid());

CREATE INDEX IF NOT EXISTS day_closeout_overrides_groomer_date_idx
  ON public.day_closeout_overrides (groomer_id, date);
