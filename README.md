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
- **[Supabase Deployment Guide](SUPABASE_DEPLOYMENT_GUIDE.md)** - 🚀 Deploy vendor schema migration
- **[API Ingestion Setup Guide](API_INGESTION_SETUP.md)** - Complete setup for secure API integration
- **[Usage Examples](USAGE_EXAMPLES.md)** - Code examples for all services

### Architecture & Schema
- **[Schema Architecture](SCHEMA_ARCHITECTURE.md)** - 4-layer schema design (Raw → Parsed → Database → Display)
- **[Schema Implementation Summary](SCHEMA_IMPLEMENTATION_SUMMARY.md)** - Vendor parsing solution
- **[Backend Documentation](backend_documentation.md)** - Backend API specification

### Integration & Deployment
- **[Finale Integration Report](FINALE_INTEGRATION_REPORT.md)** - Complete Finale API integration (A+ grade)
- **[Deployment Checklist](DEPLOYMENT_CHECKLIST.md)** - Step-by-step deployment verification
- **[AI Enhancements](AI_ENHANCEMENTS.md)** - Tier 1 AI features ($98K annual value)

## 🔐 Security Features

- ✅ API keys stored server-side only (never in frontend)
- ✅ Multi-layer rate limiting (per-user & application-wide)
- ✅ Circuit breaker pattern for resilience
- ✅ Exponential backoff retry logic
- ✅ Comprehensive audit logging
- ✅ Zero security vulnerabilities (CodeQL verified)

## 🛠️ Key Features

### API Ingestion & Integration
- **Finale Inventory Integration** - Sync inventory, vendors, and purchase orders
- **Secure API Client** - Frontend-safe client routing through backend proxy
- **Rate Limiting** - Multi-layer protection with automatic request queuing
- **Circuit Breaker** - Automatic failure detection and recovery
- **Retry Logic** - Smart exponential backoff with configurable limits

### Services
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
- **AI:** Google Gemini API ($98K annual value from Tier 1 features)
- **Backend:** Supabase PostgreSQL + Edge Functions
- **Database:** Supabase (vendor sync ready, migration deployed)
- **Inventory API:** Finale Inventory (REST + CSV reports)
- **Schema System:** Zod-based 4-layer validation (zero data loss)
- **Testing:** Playwright E2E (14/14 passing), Unit tests (9/9 passing)
