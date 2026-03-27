-- Migration Script: Convert Name-Based Keys to UUID Keys in leads.data
-- 
-- Purpose: Migrate existing data from name-based keys (e.g., "company_name") 
--          to UUID-based keys (e.g., "a1b2c3d4-e5f6-7890-abcd-ef1234567890")
--
-- This ensures data survives column renames and follows "Single Source of Truth" principle
-- from "The Pragmatic Programmer"
--
-- Run this in Supabase SQL Editor after deploying the UUID-based code changes

DO $$
DECLARE
  board_rec   RECORD;
  lead_rec    RECORD;
  column_rec  RECORD;
  old_key     TEXT;
  new_key     TEXT;
  keys_migrated INTEGER := 0;
  leads_updated INTEGER := 0;
BEGIN
  -- Process each distinct board
  FOR board_rec IN 
    SELECT DISTINCT board_id 
    FROM leads 
    WHERE board_id IS NOT NULL
  LOOP
    RAISE NOTICE 'Processing board: %', board_rec.board_id;
    
    -- Get all columns for this board
    FOR column_rec IN 
      SELECT id, name 
      FROM board_columns 
      WHERE board_id = board_rec.board_id
    LOOP
      -- Try to find data under normalized name (old format)
      old_key := lower(replace(column_rec.name, ' ', '_'));
      new_key := column_rec.id::text; -- UUID as string
      
      -- Update all leads for this board that still use the old key
      FOR lead_rec IN 
        SELECT id, data 
        FROM leads 
        WHERE board_id = board_rec.board_id
          AND data IS NOT NULL
          AND data ? old_key           -- Old key exists
          AND NOT (data ? new_key)     -- New UUID key not present yet
      LOOP
        -- Copy data from old key to new key and remove old key
        UPDATE leads 
        SET data = jsonb_set(
              data - old_key,     -- Remove old key
              ARRAY[new_key],     -- Add new key with UUID
              data->old_key,      -- Copy value from old key
              true
            )
        WHERE id = lead_rec.id;
        
        keys_migrated := keys_migrated + 1;
      END LOOP;
    END LOOP;
    
    -- Count leads for this board (for reporting only)
    SELECT COUNT(*) INTO leads_updated
    FROM leads
    WHERE board_id = board_rec.board_id;
    
    RAISE NOTICE 'Board %: Migrated % keys across % leads', 
      board_rec.board_id, keys_migrated, leads_updated;
  END LOOP;
  
  RAISE NOTICE 'Migration complete. Total keys migrated: %', keys_migrated;
END $$;

-- Verification query: Check for any remaining name-based keys
-- This should return 0 rows after migration
SELECT 
  l.id as lead_id,
  l.board_id,
  bc.id as column_uuid,
  bc.name as column_name,
  key as data_key,
  CASE 
    WHEN key ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' 
    THEN 'UUID (correct)'
    ELSE 'Name-based (needs migration)'
  END as key_type
FROM leads l
CROSS JOIN LATERAL jsonb_object_keys(l.data) AS key
JOIN board_columns bc ON bc.board_id = l.board_id
WHERE l.data IS NOT NULL
  AND key NOT IN (
    SELECT id::text FROM board_columns WHERE board_id = l.board_id
  )
  AND key NOT LIKE '{{%' -- Exclude variable syntax
ORDER BY l.board_id, key;
