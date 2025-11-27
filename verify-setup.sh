#!/bin/bash

# Phase 2 Setup Verification Script
echo "=========================================="
echo " MuRP Phase 2 Setup Verification"
echo "=========================================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check environment file
echo "1️⃣  Checking environment configuration..."
if [ -f ".env.local" ]; then
    echo -e "${GREEN}✓${NC} .env.local found"
    
    if grep -q "VITE_SUPABASE_URL" .env.local; then
        echo -e "${GREEN}✓${NC} Supabase URL configured"
    else
        echo -e "${RED}✗${NC} Supabase URL missing"
    fi
    
    if grep -q "VITE_SUPABASE_ANON_KEY" .env.local; then
        echo -e "${GREEN}✓${NC} Supabase Anon Key configured"
    else
        echo -e "${RED}✗${NC} Supabase Anon Key missing"
    fi
else
    echo -e "${RED}✗${NC} .env.local not found"
fi
echo ""

# Check database connection
echo "2️⃣  Testing database connection..."
if command -v psql &> /dev/null; then
    source .env.local 2>/dev/null
    
    if PGPASSWORD="$POSTGRES_PASSWORD" psql -h "aws-1-us-east-1.pooler.supabase.com" -p 5432 -U "postgres.mpuevsmtowyexhsqugkm" -d postgres -c "SELECT COUNT(*) as tables FROM information_schema.tables WHERE table_schema = 'public';" 2>/dev/null | grep -q "12"; then
        echo -e "${GREEN}✓${NC} Database connection successful"
        echo -e "${GREEN}✓${NC} All 12 tables exist"
    else
        echo -e "${YELLOW}⚠${NC}  Could not verify table count"
    fi
else
    echo -e "${YELLOW}⚠${NC}  psql not available (optional)"
fi
echo ""

# Check TypeScript files
echo "3️⃣  Checking TypeScript files..."
FILES=(
    "types/database.ts"
    "lib/supabase/client.ts"
    "lib/supabase/auth.ts"
    "lib/cache.ts"
    "services/inventoryService.ts"
    "vite-env.d.ts"
)

for file in "${FILES[@]}"; do
    if [ -f "$file" ]; then
        echo -e "${GREEN}✓${NC} $file"
    else
        echo -e "${RED}✗${NC} $file missing"
    fi
done
echo ""

# Check migration files
echo "4️⃣  Checking migration files..."
MIGRATIONS=(
    "supabase/migrations/001_initial_schema.sql"
    "supabase/migrations/002_row_level_security.sql"
    "supabase/migrations/003_audit_logging.sql"
    "supabase/migrations/004_status_transitions.sql"
    "supabase/migrations/005_stored_procedures.sql"
)

for migration in "${MIGRATIONS[@]}"; do
    if [ -f "$migration" ]; then
        echo -e "${GREEN}✓${NC} $(basename $migration)"
    else
        echo -e "${RED}✗${NC} $(basename $migration) missing"
    fi
done
echo ""

# Check Node modules
echo "5️⃣  Checking dependencies..."
if [ -d "node_modules" ]; then
    if [ -d "node_modules/@supabase/supabase-js" ]; then
        echo -e "${GREEN}✓${NC} @supabase/supabase-js installed"
    else
        echo -e "${RED}✗${NC} @supabase/supabase-js not installed"
    fi
    
    if [ -d "node_modules/@supabase/ssr" ]; then
        echo -e "${GREEN}✓${NC} @supabase/ssr installed"
    else
        echo -e "${YELLOW}⚠${NC}  @supabase/ssr not installed (optional)"
    fi
    
    if [ -d "node_modules/react" ]; then
        echo -e "${GREEN}✓${NC} React installed"
    else
        echo -e "${RED}✗${NC} React not installed"
    fi
else
    echo -e "${RED}✗${NC} node_modules not found - run 'npm install'"
fi
echo ""

# Summary
echo "=========================================="
echo " Verification Complete!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "  1. Run 'npm install' if dependencies are missing"
echo "  2. Test connection: npm run dev"
echo "  3. Create remaining services (BOMs, POs, etc.)"
echo "  4. Update frontend components to use new services"
echo ""
