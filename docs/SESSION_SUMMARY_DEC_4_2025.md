### Fix Dashboard Inventory Filtering and Finale Setup UI

**Changes Made:**
- Modified: `pages/Inventory.tsx` to respect filters from localStorage (dashboard drill-down).
- Modified: `components/PurchasingGuidanceDashboard.tsx` to navigate using localStorage filters.
- Created: `components/FinaleSetupModal.tsx` to provide UI for Finale credential input.
- Modified: `components/CompanyIntegrationsPanel.tsx` to use the new modal.
- Created: `hooks/useFinaleInit.ts` to initialize sync service from stored credentials.
- Modified: `App.tsx` to use `useFinaleInit`.

