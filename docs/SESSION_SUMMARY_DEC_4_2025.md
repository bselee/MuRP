### Fix Dashboard Inventory Filtering and Finale Setup UI

**Changes Made:**
- Modified: `pages/Inventory.tsx` to respect filters from localStorage (dashboard drill-down).
- Modified: `components/PurchasingGuidanceDashboard.tsx` to navigate using localStorage filters.
- Created: `components/FinaleSetupModal.tsx` to provide UI for Finale credential input.
- Modified: `components/CompanyIntegrationsPanel.tsx` to use the new modal.
- Created: `hooks/useFinaleInit.ts` to initialize sync service from stored credentials.
- Modified: `App.tsx` to use `useFinaleInit`.

- **Verification**: User confirmed Finale data is currently passing to Supabase successfully.
- **Enhancement**: Implemented `KPIFilterModal` to display inventory details directly on the Dashboard instead of navigating away.
- **Feature**: Updated Dashboard metrics cards (Stockouts, Low Stock, Overstock) to open this modal with filtered data.
- **Fix**: Ensured correct logic matching `inventoryKPIService` is used for filtering items in the modal.
