BEGIN;

-- Artwork asset normalization ---------------------------------------------
CREATE TABLE IF NOT EXISTS artwork_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    legacy_id TEXT UNIQUE,
    file_name TEXT NOT NULL,
    file_type TEXT NOT NULL DEFAULT 'artwork',
    status TEXT NOT NULL DEFAULT 'draft',
    revision INTEGER NOT NULL DEFAULT 1,
    storage_path TEXT,
    download_url TEXT,
    preview_url TEXT,
    barcode TEXT,
    notes TEXT,
    metadata JSONB NOT NULL DEFAULT '{}',
    rtp_flag BOOLEAN NOT NULL DEFAULT FALSE,
    uploaded_by UUID REFERENCES user_profiles(id),
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_edited_by UUID REFERENCES user_profiles(id),
    last_edited_at TIMESTAMPTZ,
    approved_by UUID REFERENCES user_profiles(id),
    approved_at TIMESTAMPTZ,
    approval_notes TEXT,
    is_archived BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS bom_artwork_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bom_id UUID NOT NULL REFERENCES boms(id) ON DELETE CASCADE,
    asset_id UUID NOT NULL REFERENCES artwork_assets(id) ON DELETE CASCADE,
    usage_type TEXT NOT NULL DEFAULT 'artwork',
    workflow_state TEXT NOT NULL DEFAULT 'draft',
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    attached_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    attached_by UUID REFERENCES user_profiles(id),
    notes TEXT,
    UNIQUE (bom_id, asset_id)
);

CREATE TABLE IF NOT EXISTS asset_compliance_checks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id UUID NOT NULL REFERENCES artwork_assets(id) ON DELETE CASCADE,
    check_type TEXT NOT NULL,
    jurisdiction TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    findings JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    checked_at TIMESTAMPTZ,
    checked_by UUID REFERENCES user_profiles(id),
    metadata JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_artwork_assets_status ON artwork_assets(status);
CREATE INDEX IF NOT EXISTS idx_bom_artwork_assets_bom ON bom_artwork_assets(bom_id);
CREATE INDEX IF NOT EXISTS idx_asset_checks_asset ON asset_compliance_checks(asset_id);

-- Artwork sync trigger ------------------------------------------------------
CREATE OR REPLACE FUNCTION sync_bom_artwork_assets()
RETURNS TRIGGER AS $$
DECLARE
BEGIN
    DELETE FROM bom_artwork_assets WHERE bom_id = NEW.id;

WITH raw_artwork AS (
        SELECT
            art,
            COALESCE(art->>'id', gen_random_uuid()::text) AS fallback_id
        FROM jsonb_array_elements(COALESCE(NEW.artwork, '[]'::jsonb)) AS art
    ),
    source_artwork AS (
        SELECT
            ra.fallback_id AS legacy_id,
            COALESCE(NULLIF(ra.art->>'fileName', ''), 'Unnamed Asset') AS file_name,
            COALESCE(NULLIF(ra.art->>'fileType', ''), 'artwork') AS file_type,
            COALESCE(NULLIF(ra.art->>'status', ''), 'draft') AS status,
            NULLIF(ra.art->>'notes', '') AS notes,
            COALESCE(
                CASE
                    WHEN (ra.art->>'revision') ~ '^[0-9]+(\\.[0-9]+)?$' THEN ((ra.art->>'revision')::numeric)::integer
                    ELSE NULL
                END,
                1
            ) AS revision,
            ra.art->>'url' AS download_url,
            ra.art
        FROM raw_artwork ra
    ), upserted AS (
        INSERT INTO artwork_assets (legacy_id, file_name, file_type, status, notes, revision, download_url, metadata, barcode, uploaded_at, updated_at)
        SELECT
            legacy_id,
            file_name,
            file_type,
            status,
            notes,
            revision,
            download_url,
            sa.art,
            sa.art->>'barcode',
            COALESCE((sa.art->>'uploadedAt')::timestamptz, now()),
            now()
        FROM source_artwork sa
        ON CONFLICT (legacy_id) DO UPDATE
        SET
            file_name = EXCLUDED.file_name,
            file_type = EXCLUDED.file_type,
            status = EXCLUDED.status,
            notes = EXCLUDED.notes,
            revision = EXCLUDED.revision,
            download_url = EXCLUDED.download_url,
            metadata = EXCLUDED.metadata,
            barcode = EXCLUDED.barcode,
            updated_at = now()
        RETURNING id, legacy_id
    )
    INSERT INTO bom_artwork_assets (bom_id, asset_id, usage_type, workflow_state, is_primary, attached_at)
    SELECT
        NEW.id,
        upserted.id,
        COALESCE(sa.file_type, 'artwork'),
        COALESCE(sa.status, 'draft'),
        COALESCE(sa.status, 'draft') = 'approved',
        now()
    FROM source_artwork sa
    JOIN upserted ON upserted.legacy_id = sa.legacy_id
    ON CONFLICT (bom_id, asset_id) DO UPDATE
    SET
        usage_type = EXCLUDED.usage_type,
        workflow_state = EXCLUDED.workflow_state,
        is_primary = EXCLUDED.is_primary,
        attached_at = EXCLUDED.attached_at;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Artwork sync trigger ------------------------------------------------------
CREATE OR REPLACE FUNCTION sync_bom_artwork_assets()
RETURNS TRIGGER AS $$
DECLARE
BEGIN
    DELETE FROM bom_artwork_assets WHERE bom_id = NEW.id;

WITH raw_artwork AS (
        SELECT
            art,
            COALESCE(art->>'id', gen_random_uuid()::text) AS fallback_id
        FROM jsonb_array_elements(COALESCE(NEW.artwork, '[]'::jsonb)) AS art
    ),
    source_artwork AS (
        SELECT
            ra.fallback_id AS legacy_id,
            COALESCE(NULLIF(ra.art->>'fileName', ''), 'Unnamed Asset') AS file_name,
            COALESCE(NULLIF(ra.art->>'fileType', ''), 'artwork') AS file_type,
            COALESCE(NULLIF(ra.art->>'status', ''), 'draft') AS status,
            NULLIF(ra.art->>'notes', '') AS notes,
            COALESCE(
                CASE
                    WHEN (ra.art->>'revision') ~ '^[0-9]+(\\.[0-9]+)?$' THEN ((ra.art->>'revision')::numeric)::integer
                    ELSE NULL
                END,
                1
            ) AS revision,
            ra.art->>'url' AS download_url,
            ra.art
        FROM raw_artwork ra
    ), upserted AS (
        INSERT INTO artwork_assets (legacy_id, file_name, file_type, status, notes, revision, download_url, metadata, barcode, uploaded_at, updated_at)
        SELECT
            legacy_id,
            file_name,
            file_type,
            status,
            notes,
            revision,
            download_url,
            sa.art,
            sa.art->>'barcode',
            COALESCE((sa.art->>'uploadedAt')::timestamptz, now()),
            now()
        FROM source_artwork sa
        ON CONFLICT (legacy_id) DO UPDATE
        SET
            file_name = EXCLUDED.file_name,
            file_type = EXCLUDED.file_type,
            status = EXCLUDED.status,
            notes = EXCLUDED.notes,
            revision = EXCLUDED.revision,
            download_url = EXCLUDED.download_url,
            metadata = EXCLUDED.metadata,
            barcode = EXCLUDED.barcode,
            updated_at = now()
        RETURNING id, legacy_id
    )
    INSERT INTO bom_artwork_assets (bom_id, asset_id, usage_type, workflow_state, is_primary, attached_at)
    SELECT
        NEW.id,
        upserted.id,
        COALESCE(sa.file_type, 'artwork'),
        COALESCE(sa.status, 'draft'),
        COALESCE(sa.status, 'draft') = 'approved',
        now()
    FROM source_artwork sa
    JOIN upserted ON upserted.legacy_id = sa.legacy_id
    ON CONFLICT (bom_id, asset_id) DO UPDATE
    SET
        usage_type = EXCLUDED.usage_type,
        workflow_state = EXCLUDED.workflow_state,
        is_primary = EXCLUDED.is_primary,
        attached_at = EXCLUDED.attached_at;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Only create the trigger if the artwork column exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'boms' 
    AND column_name = 'artwork'
  ) THEN
    DROP TRIGGER IF EXISTS trg_sync_bom_artwork_assets ON boms;
    CREATE TRIGGER trg_sync_bom_artwork_assets
    AFTER INSERT OR UPDATE OF artwork ON boms
    FOR EACH ROW EXECUTE FUNCTION sync_bom_artwork_assets();
  END IF;
END $$;

-- BOM revision tracking -----------------------------------------------------
ALTER TABLE boms
    ADD COLUMN IF NOT EXISTS revision_number INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS revision_status TEXT NOT NULL DEFAULT 'approved',
    ADD COLUMN IF NOT EXISTS revision_summary TEXT,
    ADD COLUMN IF NOT EXISTS revision_requested_by UUID REFERENCES user_profiles(id),
    ADD COLUMN IF NOT EXISTS revision_requested_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS revision_reviewer_id UUID REFERENCES user_profiles(id),
    ADD COLUMN IF NOT EXISTS revision_approved_by UUID REFERENCES user_profiles(id),
    ADD COLUMN IF NOT EXISTS revision_approved_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS last_approved_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS last_approved_by UUID REFERENCES user_profiles(id);

CREATE TABLE IF NOT EXISTS bom_revisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bom_id UUID NOT NULL REFERENCES boms(id) ON DELETE CASCADE,
    revision_number INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    summary TEXT,
    change_summary TEXT,
    change_diff JSONB,
    snapshot JSONB NOT NULL,
    created_by UUID REFERENCES user_profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    reviewer_id UUID REFERENCES user_profiles(id),
    approved_by UUID REFERENCES user_profiles(id),
    approved_at TIMESTAMPTZ,
    reverted_from_revision_id UUID REFERENCES bom_revisions(id),
    approval_notes TEXT,
    metadata JSONB NOT NULL DEFAULT '{}',
    UNIQUE (bom_id, revision_number)
);

CREATE INDEX IF NOT EXISTS idx_bom_revisions_bom ON bom_revisions(bom_id);
CREATE INDEX IF NOT EXISTS idx_bom_revisions_status ON bom_revisions(status);

INSERT INTO bom_revisions (bom_id, revision_number, status, summary, snapshot, created_at, approved_at)
SELECT
    id,
    COALESCE(revision_number, 1),
    'approved',
    'Baseline import',
    to_jsonb(boms),
    now(),
    now()
FROM boms
ON CONFLICT (bom_id, revision_number) DO NOTHING;

UPDATE boms
SET revision_number = COALESCE(revision_number, 1),
    revision_status = COALESCE(revision_status, 'approved'),
    last_approved_at = COALESCE(last_approved_at, now());

-- Backfill normalized artwork data for existing rows
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'boms' 
    AND column_name = 'artwork'
  ) THEN
    UPDATE boms SET artwork = artwork;
  END IF;
END $$;

COMMIT;
