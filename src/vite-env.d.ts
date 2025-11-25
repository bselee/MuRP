/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GEMINI_API_KEY: string;
  readonly VITE_FINALE_API_KEY?: string;
  readonly VITE_FINALE_API_SECRET?: string;
  readonly VITE_FINALE_ACCOUNT_ID?: string;
  readonly VITE_FINALE_FACILITY_ID?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_SHOW_NEW_PRICING?: string;
  readonly VITE_BILLING_LIVE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
