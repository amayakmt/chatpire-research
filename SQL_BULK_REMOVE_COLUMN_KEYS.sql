-- RPC helpers for column-deletion cleanup.
--
-- Referenced by app/api/columns/[id]/route.ts (DELETE handler). When a column
-- is deleted we must also strip its key(s) out of every lead's `data` JSONB.
-- Run this once in the Supabase SQL editor (Dashboard → SQL Editor).

-- Remove one or more JSONB keys from every lead in a board in a single UPDATE.
-- `p_keys` typically contains the column UUID plus any legacy name-based keys.
CREATE OR REPLACE FUNCTION bulk_remove_jsonb_keys_from_board_leads(
  p_board_id UUID,
  p_keys     TEXT[]
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_updated INTEGER;
BEGIN
  UPDATE leads
  SET data = data - p_keys      -- `jsonb - text[]` removes all listed keys
  WHERE board_id = p_board_id
    AND data ?| p_keys;         -- only touch rows that actually contain a key

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$;

-- Fallback used when the bulk helper above is unavailable: remove a single
-- column's UUID key from every lead in a board.
CREATE OR REPLACE FUNCTION delete_board_column_by_uuid(
  p_board_id    UUID,
  p_column_uuid UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_updated INTEGER;
BEGIN
  UPDATE leads
  SET data = data - p_column_uuid::text
  WHERE board_id = p_board_id
    AND data ? p_column_uuid::text;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$;
