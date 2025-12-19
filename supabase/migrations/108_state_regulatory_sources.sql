-- Migration: 108_state_regulatory_sources.sql
-- Description: Comprehensive state regulatory source configuration for compliance data gathering
-- Purpose: Define authoritative sources for each state's agricultural compliance regulations
-- Date: 2025-12-19

-- ============================================================================
-- PHASE 1: STATE REGULATORY SOURCES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS state_regulatory_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- State identification
  state_code TEXT NOT NULL,                -- Two-letter state code
  state_name TEXT NOT NULL,

  -- Source identification
  source_name TEXT NOT NULL,               -- Name of the source (e.g., "CDFA Fertilizer Registration")
  source_type TEXT NOT NULL                -- 'primary', 'secondary', 'reference'
    CHECK (source_type IN ('primary', 'secondary', 'reference')),

  -- Agency information
  agency_name TEXT NOT NULL,               -- Full agency name
  agency_acronym TEXT,                     -- e.g., "CDFA", "ODA", "WSDA"
  agency_division TEXT,                    -- Specific division if applicable

  -- URLs
  base_url TEXT NOT NULL,                  -- Main agency URL
  regulations_url TEXT,                    -- Direct link to regulations page
  registration_url TEXT,                   -- Product registration page
  forms_url TEXT,                          -- Forms and applications
  fee_schedule_url TEXT,                   -- Fee schedule page
  contact_url TEXT,                        -- Contact information page
  faq_url TEXT,                            -- FAQ page if available

  -- Regulatory domain
  regulatory_domain TEXT NOT NULL          -- 'agriculture', 'fertilizer', 'organic', 'pesticide', 'food_safety'
    CHECK (regulatory_domain IN (
      'agriculture', 'fertilizer', 'organic', 'pesticide',
      'food_safety', 'environmental', 'general'
    )),

  -- Contact information
  contact_email TEXT,
  contact_phone TEXT,
  contact_fax TEXT,
  mailing_address TEXT,
  physical_address TEXT,

  -- Data gathering configuration
  scrape_enabled BOOLEAN DEFAULT FALSE,    -- Whether MCP should scrape this source
  scrape_frequency TEXT DEFAULT 'weekly',  -- 'daily', 'weekly', 'monthly', 'quarterly'
  scrape_selectors JSONB,                  -- CSS selectors for data extraction
  last_scraped_at TIMESTAMPTZ,
  last_scrape_status TEXT,                 -- 'success', 'partial', 'failed'

  -- Key regulatory references
  primary_statutes TEXT[],                 -- Key statute references
  primary_regulations TEXT[],              -- Key regulation codes
  effective_chapters TEXT[],               -- Relevant code chapters

  -- Compliance requirements summary
  registration_required BOOLEAN DEFAULT TRUE,
  registration_annual_fee DECIMAL(10,2),
  registration_fee_per_product DECIMAL(10,2),
  testing_required BOOLEAN DEFAULT FALSE,
  testing_frequency TEXT,                  -- 'per_product', 'annual', 'biennial'
  certification_required TEXT[],           -- Required certifications

  -- Key labeling requirements specific to this source
  labeling_requirements JSONB,             -- Detailed labeling requirements
  prohibited_claims TEXT[],                -- Claims not allowed
  required_statements TEXT[],              -- Required label statements

  -- Enforcement information
  enforcement_level TEXT DEFAULT 'moderate', -- 'strict', 'moderate', 'lenient'
  penalty_info TEXT,
  inspection_frequency TEXT,

  -- Data quality tracking
  data_completeness INTEGER DEFAULT 0,     -- 0-100 percentage
  last_verified_at TIMESTAMPTZ DEFAULT NOW(),
  last_verified_by TEXT,
  verification_notes TEXT,

  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  notes TEXT,

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by TEXT,

  CONSTRAINT unique_state_source UNIQUE (state_code, agency_acronym, regulatory_domain)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_reg_sources_state ON state_regulatory_sources(state_code);
CREATE INDEX IF NOT EXISTS idx_reg_sources_domain ON state_regulatory_sources(regulatory_domain);
CREATE INDEX IF NOT EXISTS idx_reg_sources_active ON state_regulatory_sources(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_reg_sources_scrape ON state_regulatory_sources(scrape_enabled) WHERE scrape_enabled = TRUE;

-- ============================================================================
-- PHASE 2: SEED DATA - KEY AGRICULTURAL/FERTILIZER STATES
-- ============================================================================

-- Priority states (strictest, most important for compliance)
INSERT INTO state_regulatory_sources (
  state_code, state_name, source_name, source_type,
  agency_name, agency_acronym, agency_division,
  base_url, regulations_url, registration_url, forms_url, fee_schedule_url, contact_url,
  regulatory_domain, contact_email, contact_phone,
  scrape_enabled, scrape_frequency,
  primary_statutes, primary_regulations,
  registration_required, registration_annual_fee, testing_required,
  labeling_requirements, prohibited_claims, required_statements,
  enforcement_level, data_completeness, notes
) VALUES

-- ============================================================================
-- CALIFORNIA (Strictest - Priority 1)
-- ============================================================================
(
  'CA', 'California', 'CDFA Fertilizer Registration Program', 'primary',
  'California Department of Food and Agriculture', 'CDFA', 'Fertilizing Materials Inspection Program',
  'https://www.cdfa.ca.gov/',
  'https://www.cdfa.ca.gov/is/ffldrs/Fertilizer_Tonnage_Reports.html',
  'https://www.cdfa.ca.gov/is/ffldrs/fert_label_reg.html',
  'https://www.cdfa.ca.gov/is/ffldrs/Forms_and_Publications.html',
  'https://www.cdfa.ca.gov/is/ffldrs/fee_schedule.html',
  'https://www.cdfa.ca.gov/is/ffldrs/Contact.html',
  'fertilizer',
  'fert.reg@cdfa.ca.gov',
  '(916) 900-5022',
  TRUE, 'weekly',
  ARRAY['California Food and Agricultural Code Division 7'],
  ARRAY['CCR Title 3, Division 4, Chapter 1'],
  TRUE, 200.00, TRUE,
  '{
    "guaranteed_analysis": {"required": true, "format": "N-P-K order", "decimal_places": 2},
    "net_weight": {"required": true, "units": ["lb", "kg"], "prominently_displayed": true},
    "manufacturer_info": {"required": true, "includes": ["name", "address", "phone"]},
    "registration_number": {"required": true, "format": "CA-XXXX"},
    "heavy_metals": {"required": true, "display_method": "AAPFCO cautionary statement"},
    "directions_for_use": {"required": true}
  }'::jsonb,
  ARRAY['Unsubstantiated efficacy claims', 'Disease prevention claims without EPA registration', 'Organic claims without OMRI/CDFA certification'],
  ARRAY['Guaranteed analysis', 'Net weight', 'Manufacturer name and address', 'Registration number', 'Heavy metal statement if applicable'],
  'strict', 85,
  'Most comprehensive fertilizer regulations. Requires heavy metal testing, Prop 65 compliance, strict labeling.'
),

(
  'CA', 'California', 'CDFA Organic Program', 'primary',
  'California Department of Food and Agriculture', 'CDFA', 'Organic Program',
  'https://www.cdfa.ca.gov/',
  'https://www.cdfa.ca.gov/is/i_&_c/organic.html',
  'https://www.cdfa.ca.gov/is/i_&_c/organic.html',
  'https://www.cdfa.ca.gov/is/i_&_c/organic.html',
  NULL, NULL,
  'organic',
  'organic@cdfa.ca.gov',
  '(916) 900-5030',
  TRUE, 'weekly',
  ARRAY['California Organic Products Act of 2003'],
  ARRAY['CCR Title 3, Division 4, Chapter 10'],
  TRUE, 75.00, TRUE,
  '{
    "omri_certification": {"required_for_organic_claims": true},
    "organic_percentage": {"must_be_verified": true},
    "certification_number": {"required": true, "display": "prominent"}
  }'::jsonb,
  ARRAY['Organic without certification', 'USDA Organic seal without certification'],
  ARRAY['Certifying agent name', 'Certification number', 'Organic content percentage'],
  'strict', 80,
  'State organic certification required in addition to USDA NOP. Strict enforcement.'
),

-- ============================================================================
-- OREGON (Priority 2)
-- ============================================================================
(
  'OR', 'Oregon', 'ODA Fertilizer Program', 'primary',
  'Oregon Department of Agriculture', 'ODA', 'Fertilizer Program',
  'https://www.oregon.gov/oda/',
  'https://www.oregon.gov/oda/programs/Pesticides/Pages/Fertilizer.aspx',
  'https://www.oregon.gov/oda/programs/Pesticides/Pages/FertilizerRegistration.aspx',
  'https://www.oregon.gov/oda/programs/Pesticides/Pages/FertilizerForms.aspx',
  NULL,
  'https://www.oregon.gov/oda/programs/Pesticides/Pages/FertilizerContacts.aspx',
  'fertilizer',
  'fertilizer@oda.oregon.gov',
  '(503) 986-4635',
  TRUE, 'weekly',
  ARRAY['ORS 633 - Commercial Feeds, Fertilizers'],
  ARRAY['OAR 603-059 - Fertilizers'],
  TRUE, 150.00, TRUE,
  '{
    "guaranteed_analysis": {"required": true, "aapfco_format": true},
    "registration_number": {"required": true, "format": "OR-XXXX"},
    "pathogen_testing": {"required_for_organic": true}
  }'::jsonb,
  ARRAY['Unverified organic claims', 'Efficacy claims without data'],
  ARRAY['Guaranteed analysis', 'Net weight', 'Registration number', 'Manufacturer info'],
  'strict', 75,
  'Strong compost and organic amendment rules. Pathogen testing required for certain products.'
),

-- ============================================================================
-- WASHINGTON (Priority 3)
-- ============================================================================
(
  'WA', 'Washington', 'WSDA Fertilizer Program', 'primary',
  'Washington State Department of Agriculture', 'WSDA', 'Fertilizer Program',
  'https://agr.wa.gov/',
  'https://agr.wa.gov/departments/pesticides-and-fertilizers/fertilizers',
  'https://agr.wa.gov/departments/pesticides-and-fertilizers/fertilizers/fertilizer-registration',
  'https://agr.wa.gov/departments/pesticides-and-fertilizers/fertilizers/forms',
  'https://agr.wa.gov/departments/pesticides-and-fertilizers/fertilizers/fees',
  'https://agr.wa.gov/departments/pesticides-and-fertilizers/fertilizers/contact-us',
  'fertilizer',
  'Fertilizer@agr.wa.gov',
  '(360) 902-2030',
  TRUE, 'weekly',
  ARRAY['RCW 15.54 - Fertilizers'],
  ARRAY['WAC 16-200 - Fertilizers'],
  TRUE, 125.00, TRUE,
  '{
    "guaranteed_analysis": {"required": true},
    "wsda_registration": {"required": true, "number_on_label": true},
    "heavy_metals": {"disclosure_required": true}
  }'::jsonb,
  ARRAY['Unregistered product claims', 'Misleading nutrient claims'],
  ARRAY['WSDA registration number', 'Guaranteed analysis', 'Net weight', 'Manufacturer'],
  'strict', 70,
  'Comprehensive program with annual registration. Strong enforcement on labeling accuracy.'
),

-- ============================================================================
-- COLORADO (Priority 4)
-- ============================================================================
(
  'CO', 'Colorado', 'CDA Fertilizer Program', 'primary',
  'Colorado Department of Agriculture', 'CDA', 'Plant Industry Division',
  'https://ag.colorado.gov/',
  'https://ag.colorado.gov/plants/fertilizers',
  'https://ag.colorado.gov/plants/fertilizers/registration',
  'https://ag.colorado.gov/plants/fertilizers/forms',
  'https://ag.colorado.gov/plants/fertilizers/fees',
  'https://ag.colorado.gov/plants/fertilizers/contact',
  'fertilizer',
  'cda_plantindustry@state.co.us',
  '(303) 869-9050',
  TRUE, 'weekly',
  ARRAY['Colorado Fertilizer Act'],
  ARRAY['8 CCR 1203-10'],
  TRUE, 100.00, FALSE,
  '{
    "registration_number": {"required": true},
    "omri_for_organic": {"required": true}
  }'::jsonb,
  ARRAY['Organic claims without OMRI certification'],
  ARRAY['Registration number', 'Guaranteed analysis', 'Manufacturer info'],
  'moderate', 65,
  'Strong organic program. OMRI certification required for organic claims.'
),

-- ============================================================================
-- NEW YORK (Priority 5)
-- ============================================================================
(
  'NY', 'New York', 'NYSDAM Fertilizer Program', 'primary',
  'New York State Department of Agriculture and Markets', 'NYSDAM', 'Plant Industry Division',
  'https://agriculture.ny.gov/',
  'https://agriculture.ny.gov/plant-industry/fertilizers',
  'https://agriculture.ny.gov/plant-industry/fertilizers/registration',
  'https://agriculture.ny.gov/plant-industry/fertilizers/forms',
  NULL,
  'https://agriculture.ny.gov/contact',
  'fertilizer',
  'plantindustry@agriculture.ny.gov',
  '(518) 457-2087',
  TRUE, 'weekly',
  ARRAY['NYS Agriculture and Markets Law Article 10'],
  ARRAY['1 NYCRR Part 146'],
  TRUE, 150.00, TRUE,
  '{
    "registration_number": {"required": true, "display": "prominent"},
    "guaranteed_analysis": {"required": true, "aapfco_format": true},
    "heavy_metals": {"testing_required": true}
  }'::jsonb,
  ARRAY['False efficacy claims', 'Unverified organic claims'],
  ARRAY['Registration number', 'Guaranteed analysis', 'Net weight', 'Manufacturer'],
  'strict', 60,
  'Strong enforcement. Heavy metal limits apply.'
),

-- ============================================================================
-- TEXAS (Priority 6)
-- ============================================================================
(
  'TX', 'Texas', 'TDA Feed and Fertilizer Program', 'primary',
  'Texas Department of Agriculture', 'TDA', 'Feed and Fertilizer',
  'https://www.texasagriculture.gov/',
  'https://www.texasagriculture.gov/RegulatoryPrograms/FeedandFertilizer.aspx',
  'https://www.texasagriculture.gov/RegulatoryPrograms/FeedandFertilizer/FertilizerRegistration.aspx',
  'https://www.texasagriculture.gov/RegulatoryPrograms/FeedandFertilizer/Forms.aspx',
  'https://www.texasagriculture.gov/RegulatoryPrograms/FeedandFertilizer/Fees.aspx',
  NULL,
  'fertilizer',
  'feedandfertilizer@texasagriculture.gov',
  '(512) 463-7476',
  TRUE, 'monthly',
  ARRAY['Texas Agriculture Code Chapter 63'],
  ARRAY['4 TAC Chapter 65'],
  TRUE, 100.00, FALSE,
  '{
    "registration_number": {"required": true},
    "guaranteed_analysis": {"required": true}
  }'::jsonb,
  ARRAY['Unregistered product sales'],
  ARRAY['Registration number', 'Guaranteed analysis', 'Net weight'],
  'moderate', 55,
  'Large agricultural market. Registration required but moderate enforcement.'
),

-- ============================================================================
-- FLORIDA (Priority 7)
-- ============================================================================
(
  'FL', 'Florida', 'FDACS Fertilizer Program', 'primary',
  'Florida Department of Agriculture and Consumer Services', 'FDACS', 'Fertilizer Inspection',
  'https://www.fdacs.gov/',
  'https://www.fdacs.gov/Agriculture-Industry/Fertilizer',
  'https://www.fdacs.gov/Agriculture-Industry/Fertilizer/Fertilizer-Registration',
  'https://www.fdacs.gov/Agriculture-Industry/Fertilizer/Fertilizer-Forms',
  'https://www.fdacs.gov/Agriculture-Industry/Fertilizer/Fertilizer-Fees',
  'https://www.fdacs.gov/About-Us/Contact-Us',
  'fertilizer',
  'FertilizerInspection@FreshFromFlorida.com',
  '(850) 617-7870',
  TRUE, 'monthly',
  ARRAY['Florida Statutes Chapter 576'],
  ARRAY['Florida Administrative Code 5E-1'],
  TRUE, 175.00, TRUE,
  '{
    "registration_number": {"required": true},
    "guaranteed_analysis": {"required": true},
    "heavy_metals": {"required_for_biosolids": true}
  }'::jsonb,
  ARRAY['Unregistered products', 'False nutrient claims'],
  ARRAY['Registration number', 'Guaranteed analysis', 'Net weight', 'Manufacturer'],
  'moderate', 60,
  'Important citrus and agricultural market. Heavy metal testing for biosolids.'
),

-- ============================================================================
-- MICHIGAN (Priority 8)
-- ============================================================================
(
  'MI', 'Michigan', 'MDARD Fertilizer Program', 'primary',
  'Michigan Department of Agriculture and Rural Development', 'MDARD', 'Pesticide and Plant Pest Management',
  'https://www.michigan.gov/mdard/',
  'https://www.michigan.gov/mdard/environment/pesticide/fertilizer',
  'https://www.michigan.gov/mdard/environment/pesticide/fertilizer/registration',
  'https://www.michigan.gov/mdard/environment/pesticide/fertilizer/forms',
  'https://www.michigan.gov/mdard/environment/pesticide/fertilizer/fees',
  NULL,
  'fertilizer',
  'MDARD-Fertilizer@michigan.gov',
  '(800) 292-3939',
  TRUE, 'monthly',
  ARRAY['Public Act 451 of 1994, Part 85'],
  ARRAY['R 285.636 - Fertilizers'],
  TRUE, 100.00, FALSE,
  '{
    "registration_number": {"required": true},
    "guaranteed_analysis": {"required": true}
  }'::jsonb,
  ARRAY['Unregistered product distribution'],
  ARRAY['Registration number', 'Guaranteed analysis', 'Net weight'],
  'moderate', 50,
  'Great Lakes region focus. Strong agricultural oversight.'
),

-- ============================================================================
-- PENNSYLVANIA (Priority 9)
-- ============================================================================
(
  'PA', 'Pennsylvania', 'PDA Fertilizer Program', 'primary',
  'Pennsylvania Department of Agriculture', 'PDA', 'Bureau of Plant Industry',
  'https://www.agriculture.pa.gov/',
  'https://www.agriculture.pa.gov/Plants_Land_Water/PlantIndustry/Pages/Fertilizer.aspx',
  'https://www.agriculture.pa.gov/Plants_Land_Water/PlantIndustry/fertilizer/Pages/Registration.aspx',
  'https://www.agriculture.pa.gov/Plants_Land_Water/PlantIndustry/fertilizer/Pages/Forms.aspx',
  'https://www.agriculture.pa.gov/Plants_Land_Water/PlantIndustry/fertilizer/Pages/Fees.aspx',
  NULL,
  'fertilizer',
  'RA-AGFertilizer@pa.gov',
  '(717) 772-5217',
  TRUE, 'monthly',
  ARRAY['Pennsylvania Fertilizer Act (3 P.S. Section 68.1 et seq.)'],
  ARRAY['7 Pa. Code Chapter 73'],
  TRUE, 100.00, FALSE,
  '{
    "registration_number": {"required": true},
    "guaranteed_analysis": {"required": true}
  }'::jsonb,
  ARRAY['Unregistered sales'],
  ARRAY['Registration number', 'Guaranteed analysis', 'Manufacturer info'],
  'moderate', 50,
  'Mid-Atlantic agricultural hub. Standard registration requirements.'
),

-- ============================================================================
-- NORTH CAROLINA (Priority 10)
-- ============================================================================
(
  'NC', 'North Carolina', 'NCDA Fertilizer Section', 'primary',
  'North Carolina Department of Agriculture', 'NCDA', 'Fertilizer Section',
  'https://www.ncagr.gov/',
  'https://www.ncagr.gov/fooddrug/fertilizer/',
  'https://www.ncagr.gov/fooddrug/fertilizer/registration.htm',
  'https://www.ncagr.gov/fooddrug/fertilizer/forms.htm',
  'https://www.ncagr.gov/fooddrug/fertilizer/fees.htm',
  'https://www.ncagr.gov/fooddrug/fertilizer/contact.htm',
  'fertilizer',
  'fertilizer@ncagr.gov',
  '(919) 733-7366',
  TRUE, 'monthly',
  ARRAY['North Carolina Fertilizer Law (Article 70)'],
  ARRAY['02 NCAC 09L'],
  TRUE, 75.00, FALSE,
  '{
    "registration_number": {"required": true},
    "guaranteed_analysis": {"required": true}
  }'::jsonb,
  ARRAY['Unregistered distribution'],
  ARRAY['Registration number', 'Guaranteed analysis', 'Net weight'],
  'moderate', 50,
  'Important agricultural state. Standard registration program.'
);

-- ============================================================================
-- PHASE 3: FEDERAL SOURCES
-- ============================================================================

INSERT INTO state_regulatory_sources (
  state_code, state_name, source_name, source_type,
  agency_name, agency_acronym, agency_division,
  base_url, regulations_url, registration_url, forms_url,
  regulatory_domain, contact_phone,
  scrape_enabled, scrape_frequency,
  primary_regulations,
  labeling_requirements, required_statements,
  enforcement_level, data_completeness, notes
) VALUES
(
  'US', 'Federal', 'USDA National Organic Program', 'primary',
  'United States Department of Agriculture', 'USDA', 'Agricultural Marketing Service',
  'https://www.ams.usda.gov/',
  'https://www.ams.usda.gov/rules-regulations/organic',
  'https://www.ams.usda.gov/services/organic-certification',
  'https://www.ams.usda.gov/rules-regulations/organic/forms',
  'organic',
  '(202) 720-3252',
  TRUE, 'weekly',
  ARRAY['7 CFR Part 205 - National Organic Program'],
  '{
    "usda_organic_seal": {"when_allowed": "95% or more organic content"},
    "made_with_organic": {"when_allowed": "70-95% organic content"},
    "certified_organic_logo": {"required_for_retail": true}
  }'::jsonb,
  ARRAY['Certifying agent identification', 'Organic seal if applicable', 'Ingredient list with organic designation'],
  'strict', 90,
  'Federal baseline for organic. Required for organic claims on fertilizers and soil amendments.'
),
(
  'US', 'Federal', 'EPA Pesticide Registration', 'reference',
  'Environmental Protection Agency', 'EPA', 'Office of Pesticide Programs',
  'https://www.epa.gov/',
  'https://www.epa.gov/pesticide-registration',
  'https://www.epa.gov/pesticide-registration/register-pesticide',
  'https://www.epa.gov/pesticide-registration/forms',
  'pesticide',
  '(703) 305-5805',
  TRUE, 'monthly',
  ARRAY['FIFRA - Federal Insecticide, Fungicide, and Rodenticide Act', '40 CFR Parts 150-180'],
  '{
    "epa_registration_number": {"required_if_claims": true},
    "pesticide_label": {"must_follow": "exactly as registered"}
  }'::jsonb,
  ARRAY['EPA registration number', 'Use directions', 'Precautionary statements'],
  'strict', 85,
  'Required for any product making pest control claims. Important for bio-fertilizers.'
),
(
  'US', 'Federal', 'AAPFCO Model Bill', 'reference',
  'Association of American Plant Food Control Officials', 'AAPFCO', NULL,
  'https://www.aapfco.org/',
  'https://www.aapfco.org/publications.html',
  NULL,
  'https://www.aapfco.org/publications.html',
  'fertilizer',
  NULL,
  FALSE, 'quarterly',
  ARRAY['AAPFCO Model Bill', 'AAPFCO Official Publication'],
  '{
    "guaranteed_analysis": {"format": "AAPFCO standard", "nutrients": "recognized list"},
    "terminology": {"must_use": "AAPFCO recognized terms"}
  }'::jsonb,
  ARRAY['Primary nutrient percentages', 'Secondary/micronutrient percentages if claimed'],
  'moderate', 75,
  'Not regulatory but most states follow AAPFCO guidelines. Use for labeling format guidance.'
);

-- ============================================================================
-- PHASE 4: HELPER FUNCTION FOR REGULATORY LOOKUPS
-- ============================================================================

CREATE OR REPLACE FUNCTION get_state_regulatory_sources(
  p_state_codes TEXT[],
  p_regulatory_domain TEXT DEFAULT NULL
)
RETURNS TABLE (
  state_code TEXT,
  state_name TEXT,
  agency_name TEXT,
  agency_acronym TEXT,
  base_url TEXT,
  regulations_url TEXT,
  registration_url TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  regulatory_domain TEXT,
  registration_required BOOLEAN,
  registration_fee DECIMAL,
  labeling_requirements JSONB,
  required_statements TEXT[],
  enforcement_level TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    srs.state_code,
    srs.state_name,
    srs.agency_name,
    srs.agency_acronym,
    srs.base_url,
    srs.regulations_url,
    srs.registration_url,
    srs.contact_email,
    srs.contact_phone,
    srs.regulatory_domain,
    srs.registration_required,
    srs.registration_annual_fee as registration_fee,
    srs.labeling_requirements,
    srs.required_statements,
    srs.enforcement_level
  FROM state_regulatory_sources srs
  WHERE
    srs.is_active = TRUE
    AND srs.source_type = 'primary'
    AND (p_state_codes IS NULL OR srs.state_code = ANY(p_state_codes))
    AND (p_regulatory_domain IS NULL OR srs.regulatory_domain = p_regulatory_domain)
  ORDER BY
    srs.enforcement_level DESC,
    srs.state_code;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- PHASE 5: VIEW FOR REGULATORY SOURCE OVERVIEW
-- ============================================================================

CREATE OR REPLACE VIEW regulatory_sources_overview AS
SELECT
  srs.state_code,
  srs.state_name,
  srs.agency_acronym,
  srs.regulatory_domain,
  srs.base_url,
  srs.regulations_url,
  srs.registration_url,
  srs.contact_email,
  srs.contact_phone,
  srs.registration_required,
  srs.registration_annual_fee,
  srs.enforcement_level,
  srs.data_completeness,
  srs.last_scraped_at,
  srs.last_scrape_status,
  scr.strictness_score,
  scr.strictness_level
FROM state_regulatory_sources srs
LEFT JOIN state_compliance_ratings scr ON scr.state_code = srs.state_code
WHERE srs.is_active = TRUE AND srs.source_type = 'primary'
ORDER BY scr.strictness_score DESC NULLS LAST, srs.state_code;

COMMENT ON VIEW regulatory_sources_overview IS 'Overview of active regulatory sources with compliance ratings';

-- ============================================================================
-- PHASE 6: ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE state_regulatory_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read access to state_regulatory_sources" ON state_regulatory_sources
  FOR SELECT USING (true);

CREATE POLICY "Allow authenticated write on state_regulatory_sources" ON state_regulatory_sources
  FOR ALL USING (auth.role() = 'authenticated');

-- ============================================================================
-- PHASE 7: COMMENTS
-- ============================================================================

COMMENT ON TABLE state_regulatory_sources IS 'Authoritative regulatory sources for each state with URLs and requirements for compliance data gathering';
COMMENT ON COLUMN state_regulatory_sources.scrape_enabled IS 'Whether MCP server should automatically scrape this source';
COMMENT ON COLUMN state_regulatory_sources.labeling_requirements IS 'Detailed JSON structure of labeling requirements specific to this source';
COMMENT ON COLUMN state_regulatory_sources.data_completeness IS 'Percentage (0-100) indicating how complete our regulatory data is for this source';

-- ============================================================================
-- PHASE 8: VERIFICATION
-- ============================================================================

DO $$
DECLARE
  v_state_count INTEGER;
  v_federal_count INTEGER;
  v_scrape_enabled INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_state_count
  FROM state_regulatory_sources WHERE state_code != 'US' AND source_type = 'primary';

  SELECT COUNT(*) INTO v_federal_count
  FROM state_regulatory_sources WHERE state_code = 'US';

  SELECT COUNT(*) INTO v_scrape_enabled
  FROM state_regulatory_sources WHERE scrape_enabled = TRUE;

  RAISE NOTICE 'Migration 108 completed successfully!';
  RAISE NOTICE '============================================';
  RAISE NOTICE 'State regulatory sources added: %', v_state_count;
  RAISE NOTICE 'Federal sources added: %', v_federal_count;
  RAISE NOTICE 'Sources with scraping enabled: %', v_scrape_enabled;
  RAISE NOTICE '============================================';
  RAISE NOTICE 'Key states covered:';
  RAISE NOTICE '  CA (CDFA) - Strictest fertilizer regulations';
  RAISE NOTICE '  OR (ODA) - Strong compost/organic rules';
  RAISE NOTICE '  WA (WSDA) - Comprehensive program';
  RAISE NOTICE '  CO (CDA) - OMRI required for organic';
  RAISE NOTICE '  NY (NYSDAM) - Heavy metal testing';
  RAISE NOTICE '  TX (TDA) - Large ag market';
  RAISE NOTICE '  FL (FDACS) - Citrus/ag focus';
  RAISE NOTICE '  MI (MDARD) - Great Lakes region';
  RAISE NOTICE '  PA (PDA) - Mid-Atlantic hub';
  RAISE NOTICE '  NC (NCDA) - Standard program';
  RAISE NOTICE '============================================';
END $$;
