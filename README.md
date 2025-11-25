<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# TGF MRP - Manufacturing Resource Planning

A production-ready MRP system with secure API integrations, AI-powered insights, and comprehensive inventory management.

View your app in AI Studio: https://ai.studio/apps/drive/1K8TR2Yc9tBjelTjM7_v6uJmq_Fg368Bl

## 🚀 Quick Start

**Prerequisites:** Node.js 18+

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment:**
   - Your `.env.local` file should already exist
   - See [.env.local.example](.env.local.example) for all available options
   - Required: `API_KEY` or `VITE_GEMINI_API_KEY` for Gemini AI

3. **Run the app:**
   ```bash
   npm run dev
   ```

4. **Build for production:**
   ```bash
   npm run build
   ```

## 📚 Documentation

### Getting Started
- **[Supabase Deployment Guide](SUPABASE_DEPLOYMENT_GUIDE.md)** - 🚀 Deploy database migrations
- **[Migration Conventions](docs/MIGRATION_CONVENTIONS.md)** - 📏 Numbering scheme & workflow for new Supabase migrations
- **[API Ingestion Setup Guide](API_INGESTION_SETUP.md)** - Complete setup for secure API integration
- **[BOM Setup Guide](BOM_SETUP_GUIDE.md)** - Bill of Materials configuration and usage
- **[Usage Examples](USAGE_EXAMPLES.md)** - Code examples for all services

### Architecture & Schema
- **[Schema Architecture](SCHEMA_ARCHITECTURE.md)** - 4-layer schema design (Raw → Parsed → Database → Display)
- **[Backend Documentation](backend_documentation.md)** - Backend API specification

### Compliance & MCP System
- **[Compliance System Architecture](docs/COMPLIANCE_SYSTEM_ARCHITECTURE.md)** - Multi-state regulatory compliance
- **[MCP Setup Guide](docs/MCP_SETUP_GUIDE.md)** - Admin guide for MCP server configuration
- **[AI Gateway Integration](docs/AI_GATEWAY_INTEGRATION.md)** - ✨ Vercel AI Gateway with tier-based routing
- **[Session Summary](docs/SESSION_SUMMARY_2025-11-13.md)** - Latest development session details
- **[Pricing & Billing Rollout Checklist](docs/PRICING_ROLLOUT_CHECKLIST.md)** - Flags + steps for launching the new landing page and Stripe billing

## 🔐 Security Features

- ✅ API keys stored server-side only (never in frontend)
- ✅ Multi-layer rate limiting (per-user & application-wide)
- ✅ Circuit breaker pattern for resilience
- ✅ Exponential backoff retry logic
- ✅ Comprehensive audit logging
- ✅ Zero security vulnerabilities (CodeQL verified)

## 🛠️ Key Features

### AI-Powered Intelligence ✨ NEW
- **Vercel AI Gateway Integration** - Tier-based access to GPT-4o, Claude, and Gemini
- **Usage Tracking Dashboard** - Real-time analytics and cost monitoring
- **Automatic Fallbacks** - 99.9% uptime with multi-provider redundancy
- **Smart Tier System** - Basic (100 msg/month free) and Full AI (unlimited)

### API Ingestion & Integration
- **Finale Inventory Integration** - Sync inventory, vendors, and purchase orders
- **Secure API Client** - Frontend-safe client routing through backend proxy
- **Rate Limiting** - Multi-layer protection with automatic request queuing
- **Circuit Breaker** - Automatic failure detection and recovery
- **Retry Logic** - Smart exponential backoff with configurable limits

### Services
- `services/aiGatewayService.ts` - 🆕 Unified AI service with tier-based routing
- `services/usageTrackingService.ts` - 🆕 Comprehensive usage analytics
- `services/rateLimiter.ts` - Rate limiting with queuing
- `services/circuitBreaker.ts` - Circuit breaker pattern
- `services/retryWithBackoff.ts` - Exponential backoff retry
- `services/finaleIngestion.ts` - Finale API integration
- `services/secureApiClient.ts` - Secure frontend API client
- `services/geminiService.ts` - AI-powered insights

### Backend
- `supabase/functions/api-proxy/index.ts` - Secure backend proxy
- `supabase/migrations/001_api_audit_log.sql` - Audit logging schema

## 📦 Tech Stack

- **Frontend:** React 19, TypeScript, Vite
- **AI:** Vercel AI Gateway (GPT-4o, Claude 3.5, Gemini 2.0) with tier-based routing
- **Backend:** Supabase PostgreSQL + Edge Functions
- **Database:** Supabase (vendor sync ready, migration deployed)
- **Inventory API:** Finale Inventory (REST + CSV reports)
- **Schema System:** Zod-based 4-layer validation (zero data loss)
- **Testing:** Playwright E2E (14/14 passing), Unit tests (9/9 passing)
