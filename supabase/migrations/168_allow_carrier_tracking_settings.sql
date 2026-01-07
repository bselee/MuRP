-- Migration: Allow authenticated users to manage carrier tracking settings
-- This enables users to save USPS, UPS, FedEx API credentials without admin role

-- Add policy for carrier tracking settings (setting_key starts with 'carrier_api_')
CREATE POLICY "Allow authenticated users to manage carrier tracking"
ON public.app_settings
FOR ALL
TO authenticated
USING (setting_key LIKE 'carrier_api_%')
WITH CHECK (setting_key LIKE 'carrier_api_%');

-- Add comment for documentation
COMMENT ON POLICY "Allow authenticated users to manage carrier tracking" ON public.app_settings IS
'Allows any authenticated user to read/write carrier API settings (USPS, UPS, FedEx credentials)';
