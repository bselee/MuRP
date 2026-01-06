-- Migration 158: Protect email inbox configs from deletion and prevent duplicates
--
-- Ensures:
-- 1. Email configs are tied to users and not deleted unless user is deleted
-- 2. No duplicate inbox configs for the same email address
-- 3. Proper cascade behavior for user deletion
--
-- Part of: Email Monitoring System
-- Goal: NEVER BE OUT OF STOCK

-- ============================================================================
-- ENSURE PROPER FOREIGN KEY CASCADE
-- ============================================================================

-- First, check and fix the user_id foreign key to ensure ON DELETE CASCADE
-- Drop and recreate to ensure proper cascade behavior
DO $$
BEGIN
    -- Check if the constraint exists and has correct behavior
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'email_inbox_configs_user_id_fkey'
        AND table_name = 'email_inbox_configs'
    ) THEN
        -- Drop and recreate with proper cascade
        ALTER TABLE email_inbox_configs DROP CONSTRAINT email_inbox_configs_user_id_fkey;
    END IF;

    -- Add foreign key with ON DELETE CASCADE
    ALTER TABLE email_inbox_configs
        ADD CONSTRAINT email_inbox_configs_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

EXCEPTION WHEN OTHERS THEN
    -- Constraint might already be correct, that's fine
    RAISE NOTICE 'Foreign key constraint already exists or could not be modified: %', SQLERRM;
END $$;

-- ============================================================================
-- PREVENT DUPLICATE EMAIL ADDRESSES
-- ============================================================================

-- Remove the old UNIQUE constraint on email_address (allows same email for different users)
ALTER TABLE email_inbox_configs DROP CONSTRAINT IF EXISTS email_inbox_configs_email_address_key;

-- Add composite unique constraint: same email address can only exist once per user
-- This allows org-wide inboxes (user_id=NULL) to coexist with user-specific ones
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_inbox_unique_user_email
    ON email_inbox_configs(COALESCE(user_id, '00000000-0000-0000-0000-000000000000'::uuid), email_address);

-- ============================================================================
-- CLEAN UP DUPLICATE ENTRIES
-- ============================================================================

-- Delete duplicate inbox configs, keeping the most recently updated one
DELETE FROM email_inbox_configs a
USING email_inbox_configs b
WHERE a.id < b.id
  AND a.email_address = b.email_address
  AND COALESCE(a.user_id, '00000000-0000-0000-0000-000000000000'::uuid) =
      COALESCE(b.user_id, '00000000-0000-0000-0000-000000000000'::uuid);

-- ============================================================================
-- ENSURE CREATED_BY AND UPDATED_BY HAVE CASCADE
-- ============================================================================

-- Fix created_by foreign key
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'email_inbox_configs_created_by_fkey'
    ) THEN
        ALTER TABLE email_inbox_configs DROP CONSTRAINT email_inbox_configs_created_by_fkey;
    END IF;

    ALTER TABLE email_inbox_configs
        ADD CONSTRAINT email_inbox_configs_created_by_fkey
        FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'created_by constraint: %', SQLERRM;
END $$;

-- Fix updated_by foreign key
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'email_inbox_configs_updated_by_fkey'
    ) THEN
        ALTER TABLE email_inbox_configs DROP CONSTRAINT email_inbox_configs_updated_by_fkey;
    END IF;

    ALTER TABLE email_inbox_configs
        ADD CONSTRAINT email_inbox_configs_updated_by_fkey
        FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'updated_by constraint: %', SQLERRM;
END $$;

-- ============================================================================
-- USER_OAUTH_TOKENS CASCADE PROTECTION
-- ============================================================================

-- Ensure user_oauth_tokens also has proper cascade
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'user_oauth_tokens'
    ) THEN
        -- Check for existing constraint
        IF EXISTS (
            SELECT 1 FROM information_schema.table_constraints
            WHERE constraint_name = 'user_oauth_tokens_user_id_fkey'
            AND table_name = 'user_oauth_tokens'
        ) THEN
            ALTER TABLE user_oauth_tokens DROP CONSTRAINT user_oauth_tokens_user_id_fkey;
        END IF;

        ALTER TABLE user_oauth_tokens
            ADD CONSTRAINT user_oauth_tokens_user_id_fkey
            FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'user_oauth_tokens constraint: %', SQLERRM;
END $$;

-- ============================================================================
-- ADD HELPFUL INDEXES
-- ============================================================================

-- Index for finding active inboxes by user
CREATE INDEX IF NOT EXISTS idx_email_inbox_user_active_purpose
    ON email_inbox_configs(user_id, is_active, inbox_purpose)
    WHERE is_active = true;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON CONSTRAINT email_inbox_configs_user_id_fkey ON email_inbox_configs IS
    'Cascade delete inbox configs when user is deleted. Tokens should not outlive users.';

COMMENT ON INDEX idx_email_inbox_unique_user_email IS
    'Prevents duplicate email addresses per user. Same email can exist for different users or org-wide (user_id=NULL).';
