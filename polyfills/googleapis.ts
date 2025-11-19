/**
 * Browser polyfill for googleapis
 * Provides stub exports to prevent import errors
 */

export const google = {
  auth: {
    OAuth2: class OAuth2 {
      constructor() {
        throw new Error('googleapis should not be used in browser. Use Supabase Edge Functions.');
      }
    }
  },
  sheets: () => {
    throw new Error('googleapis should not be used in browser. Use Supabase Edge Functions.');
  },
  drive: () => {
    throw new Error('googleapis should not be used in browser. Use Supabase Edge Functions.');
  },
  calendar: () => {
    throw new Error('googleapis should not be used in browser. Use Supabase Edge Functions.');
  }
};

export const sheets_v4 = {} as any;
