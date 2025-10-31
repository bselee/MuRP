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

- **[API Ingestion Setup Guide](API_INGESTION_SETUP.md)** - Complete setup for secure API integration
- **[Usage Examples](USAGE_EXAMPLES.md)** - Code examples for all services
- **[Backend Documentation](backend_documentation.md)** - Backend API specification

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
- **AI:** Google Gemini API
- **Backend:** Supabase Edge Functions (optional)
- **Database:** Supabase PostgreSQL (optional)
- **Inventory API:** Finale Inventory (optional)
