import React, { useState, useEffect, useMemo } from 'react';
import Button from '@/components/ui/Button';
import type { User } from '../types';
import { KeyIcon, MailIcon, GmailIcon, LightBulbIcon, CheckCircleIcon, ChevronRightIcon, DocumentTextIcon, CloudUploadIcon, TruckIcon, PackageIcon, CalculatorIcon, ChartBarIcon, SparklesIcon } from '../components/icons';
import { supabase } from '../lib/supabase/client';
import { useTheme, type ThemePreference } from '../components/ThemeProvider';
import { useUserPreferences, type RowDensity } from '../components/UserPreferencesProvider';
import { getGoogleAuthService } from '../services/googleAuthService';
import { getGoogleSheetsSyncService } from '../services/googleSheetsSyncService';

interface EnhancedNewUserSetupProps {
    user: User;
    onSetupComplete: () => void;
}

const roleCopy: Record<User['role'], { headline: string; blurb: string }> = {
  Admin: {
    headline: 'You keep the whole orchestra in sync.',
    blurb: 'Invite your team, wire up integrations, and keep MuRP humming across purchasing, production, and compliance.',
  },
  Manager: {
    headline: 'You steer the day-to-day.',
    blurb: 'Review requisitions, monitor builds, and make sure nothing slips through the cracks.',
  },
  Staff: {
    headline: 'You make the magic tangible.',
    blurb: 'Log builds, receive goods, and keep the floor informed with real-time data.',
  },
};

const themeOptions: Array<{ label: string; value: ThemePreference; description: string }> = [
  { label: 'System', value: 'system', description: 'Match OS setting automatically' },
  { label: 'Light', value: 'light', description: 'Bright and warm for airy spaces' },
  { label: 'Dark', value: 'dark', description: 'Stealth mode for late nights' },
];

const densityOptions: Array<{ label: string; value: RowDensity; blurb: string }> = [
  { label: 'Comfortable', value: 'comfortable', blurb: 'Tall rows, extra breathing room' },
  { label: 'Compact', value: 'compact', blurb: 'Balanced density (default)' },
  { label: 'Ultra', value: 'ultra', blurb: 'Tight rows, max data per screen' },
];

const departmentPlaybooks: Record<User['department'], { title: string; highlights: string[] }> = {
  Purchasing: {
    title: 'Your day starts in Requisitions + PO Tracking.',
    highlights: [
      'Review incoming requests, approve or clarify',
      'Keep vendors honest with automated follow-ups',
      'Watch shipments via the PO Tracking timeline',
    ],
  },
  Operations: {
    title: 'Ops keeps every team unblocked.',
    highlights: [
      'Scan dashboards for blockers',
      'Balance demand between production + purchasing',
      'Coordinate with receiving on urgent inbound freight',
    ],
  },
  'MFG 1': {
    title: 'Production is your canvas.',
    highlights: [
      'Check todays build schedule',
      'Verify inventory sufficiency before batching',
      'Log completions so fulfillment stays ahead',
    ],
  },
  'MFG 2': {
    title: 'Production is your canvas.',
    highlights: [
      'Monitor component health from Inventory',
      'Coordinate with Purchasing when stocks dip',
      'Feed status updates back to Ops',
    ],
  },
  Fulfillment: {
    title: 'Turn finished goods into customer delight.',
    highlights: [
      'Peek at Inventory to reserve units',
      'Use Label Scanner to keep paperwork airtight',
      'Flag shortages early so Purchasing can react',
    ],
  },
  'SHP/RCV': {
    title: 'You are the gatekeeper of inbound & outbound.',
    highlights: [
      'Use the Receiving view + Label Scanner',
      'Validate paperwork before anything hits shelves',
      'Log exceptions right away for Ops & Purchasing',
    ],
  },
};

const SAMPLE_INVENTORY_DATA = [
  // Header row with instructions
  ['INSTRUCTIONS: Fill out your inventory below. Required fields: SKU, Name, Category, Quantity. Optional: Description, Reorder Point, Cost/Price, Supplier, UPC. Delete this row before importing.'],
  [],
  // Main header
  ['SKU', 'Name', 'Description', 'Category', 'Quantity', 'Reorder Point', 'Unit Cost', 'Unit Price', 'Supplier', 'UPC', 'Location', 'Notes'],
  // Sample data - Electronics
  ['ELEC-001', 'Arduino Uno R3', 'Microcontroller board for prototyping', 'Electronics', '25', '5', '18.50', '29.99', 'Adafruit', '123456789012', 'Shelf A1', 'Popular for IoT projects'],
  ['ELEC-002', 'Raspberry Pi 4', 'Single-board computer with WiFi', 'Electronics', '12', '3', '35.00', '59.99', 'Raspberry Pi Foundation', '123456789013', 'Shelf A2', 'Model B 4GB RAM'],
  ['ELEC-003', 'LED Strip 5M', 'RGB LED strip lighting, 5 meters', 'Electronics', '8', '2', '12.99', '24.99', 'Amazon Basics', '123456789014', 'Shelf B1', 'Waterproof IP65'],
  ['ELEC-004', 'Servo Motor MG996R', 'High-torque servo motor', 'Electronics', '15', '4', '8.50', '14.99', 'Tower Pro', '123456789015', 'Shelf B2', '180 degree rotation'],
  // Sample data - Hardware
  ['HW-001', 'M3 Machine Screws', 'Stainless steel M3x10mm screws, pack of 100', 'Hardware', '45', '10', '0.08', '0.25', 'McMaster-Carr', '123456789016', 'Bin H1', 'Phillips head'],
  ['HW-002', 'Nylon Spacers', 'M3 nylon spacers, 10mm length, pack of 50', 'Hardware', '30', '8', '0.15', '0.45', 'Amazon', '123456789017', 'Bin H2', 'Black nylon'],
  ['HW-003', 'Heat Shrink Tubing', 'Assorted heat shrink tubing kit', 'Hardware', '20', '5', '4.99', '12.99', 'SparkFun', '123456789018', 'Bin H3', 'Various diameters'],
  ['HW-004', 'Wire Strippers', 'Professional wire stripping tool', 'Hardware', '6', '2', '15.99', '29.99', 'Klein Tools', '123456789019', 'Tool Box', 'Automatic stripping'],
  // Sample data - Raw Materials
  ['MAT-001', 'PLA Filament 1.75mm', 'White PLA filament for 3D printing, 1kg spool', 'Raw Materials', '18', '3', '22.99', '39.99', 'Prusa', '123456789020', 'Filament Rack', '2.85mm compatible'],
  ['MAT-002', 'Acrylic Sheet 1/8"', 'Clear acrylic sheet, 12x12 inches', 'Raw Materials', '22', '4', '8.50', '16.99', 'TAP Plastics', '123456789021', 'Sheet Storage', 'Cast acrylic'],
  ['MAT-003', 'Copper Wire 22AWG', 'Solid copper wire, 100ft spool', 'Raw Materials', '12', '3', '6.99', '14.99', 'Belden', '123456789022', 'Wire Rack', 'Stranded'],
  ['MAT-004', 'Solder Paste', 'Lead-free solder paste, 10cc syringe', 'Raw Materials', '8', '2', '12.99', '24.99', 'Chip Quik', '123456789023', 'Refrigerator', 'Type 4'],
  // Sample data - Consumables
  ['CONS-001', 'Isopropyl Alcohol 99%', 'Electronic cleaning alcohol, 16oz', 'Consumables', '14', '4', '7.99', '15.99', 'Amazon', '123456789024', 'Chemicals Cabinet', 'Pure grade'],
  ['CONS-002', 'Thermal Paste', 'CPU thermal compound, 2g syringe', 'Consumables', '9', '3', '4.99', '9.99', 'Arctic Silver', '123456789025', 'Thermal Supplies', 'Ceramic based'],
  ['CONS-003', 'Anti-Static Bags', 'ESD protective bags, 6x8 inches, pack of 100', 'Consumables', '25', '5', '0.05', '0.15', 'SCS', '123456789026', 'ESD Supplies', 'Pink anti-static'],
  ['CONS-004', 'Cable Ties', 'Nylon cable ties, 8 inch, pack of 100', 'Consumables', '40', '10', '0.03', '0.08', 'Panduit', '123456789027', 'Cable Organizer', 'Black nylon'],
  // Empty rows for user input
  ['', '', '', '', '', '', '', '', '', '', '', ''],
  ['', '', '', '', '', '', '', '', '', '', '', ''],
  ['', '', '', '', '', '', '', '', '', '', '', ''],
  ['', '', '', '', '', '', '', '', '', '', '', ''],
  ['', '', '', '', '', '', '', '', '', '', '', ''],
];

// Data source types
type DataSourceChoice = 'finale' | 'google_sheets' | 'csv' | 'skip' | null;

const EnhancedNewUserSetup: React.FC<EnhancedNewUserSetupProps> = ({ user, onSetupComplete }) => {
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [step, setStep] = useState(0);
    const totalSteps = 6; // 0: Preferences, 1: Data Source Choice, 2-4: Setup flow, 5: Password

    // Data source selection
    const [dataSource, setDataSource] = useState<DataSourceChoice>(null);

    // Finale API state
    const [finaleApiKey, setFinaleApiKey] = useState('');
    const [finaleApiSecret, setFinaleApiSecret] = useState('');
    const [finaleAccountPath, setFinaleAccountPath] = useState('');
    const [finaleConnected, setFinaleConnected] = useState(false);
    const [finaleTesting, setFinaleTesting] = useState(false);

    // Google integration state
    const [googleConnected, setGoogleConnected] = useState(false);
    const [googleEmail, setGoogleEmail] = useState('');
    const [sheetsTemplateUrl, setSheetsTemplateUrl] = useState('');
    const [importComplete, setImportComplete] = useState(false);

    const { theme, setTheme, resolvedTheme } = useTheme();
    const { rowDensity, setRowDensity } = useUserPreferences();

    const authService = getGoogleAuthService();
    const syncService = getGoogleSheetsSyncService();

    // Check Google auth status on mount and when URL changes (for OAuth callback)
    useEffect(() => {
        const checkGoogleAuth = async () => {
            try {
                const status = await authService.getAuthStatus();
                if (status.isAuthenticated && status.hasValidToken) {
                    setGoogleConnected(true);
                    setGoogleEmail(status.email || '');
                }
            } catch (error) {
                console.error('Error checking Google auth:', error);
            }
        };

        checkGoogleAuth();

        // Check again after a short delay in case we just returned from OAuth
        const timeoutId = setTimeout(checkGoogleAuth, 2000);

        return () => clearTimeout(timeoutId);
    }, [authService]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        if (!password || !confirmPassword) {
            setError('Please fill out both password fields.');
            return;
        }
        if (password.length < 12) {
            setError('Password must be at least 12 characters long for compliance.');
            return;
        }
        if (password !== confirmPassword) {
            setError('Passwords do not match.');
            return;
        }
        try {
            setLoading(true);
            const { error: updateError } = await supabase.auth.updateUser({ password });
            if (updateError) throw updateError;
            onSetupComplete();
        } catch (err: any) {
            setError(err.message ?? 'Failed to set password.');
        } finally {
            setLoading(false);
        }
    };

    const handleGoogleConnect = async () => {
        try {
            setLoading(true);

            // Get authorization URL from API
            const response = await fetch('/api/google-auth/authorize');
            if (!response.ok) {
                throw new Error('Failed to get authorization URL');
            }

            const data = await response.json();
            if (!data.authUrl) {
                throw new Error('No authorization URL received');
            }

            // Redirect to Google OAuth
            window.location.href = data.authUrl;
        } catch (error) {
            console.error('Error connecting Google:', error);
            setError('Failed to connect Google account. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleCreateSheetsTemplate = async () => {
        try {
            setLoading(true);

            // Create new Google Sheet with sample data
            const result = await syncService.createInventoryTemplate({
                title: `MuRP Inventory - ${user.name}`,
                data: SAMPLE_INVENTORY_DATA
            });

            if (result.spreadsheetUrl) {
                setSheetsTemplateUrl(result.spreadsheetUrl);
                // Open the new sheet in a new tab
                window.open(result.spreadsheetUrl, '_blank');
            }
        } catch (error) {
            console.error('Error creating template:', error);
            setError('Failed to create Google Sheets template. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleImportData = async () => {
        if (!sheetsTemplateUrl) {
            setError('Please create a Google Sheets template first.');
            return;
        }

        try {
            setLoading(true);

            // Import from the template sheet
            const result = await syncService.importInventory({
                spreadsheetId: sheetsTemplateUrl.split('/d/')[1]?.split('/')[0] || '',
                sheetName: 'Sheet1',
                mergeStrategy: 'replace', // Replace all for initial setup
                skipFirstRow: true
            });

            if (result.success) {
                setImportComplete(true);
            } else {
                throw new Error(result.errors.join(', '));
            }
        } catch (error) {
            console.error('Error importing data:', error);
            setError('Failed to import inventory data. Please check your Google Sheet and try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleDownloadTemplate = () => {
        try {
            // Convert sample data to CSV format
            // Skip the instruction rows and get the actual data rows
            const dataRows = SAMPLE_INVENTORY_DATA.slice(3); // Skip instructions, empty row, and header
            const sampleProducts = dataRows.filter(row => row[0] && row[0].startsWith && !row[0].startsWith('INSTRUCTIONS')); // Filter out empty rows and instructions

            const headers = [
                'SKU',
                'Name',
                'Description',
                'Category',
                'Quantity',
                'Reorder Point',
                'Unit Cost',
                'Unit Price',
                'Supplier',
                'UPC',
                'Location',
                'Notes'
            ];

            const csvContent = [
                headers.join(','),
                ...sampleProducts.map(row => [
                    row[0] || '', // SKU
                    `"${row[1] || ''}"`, // Name
                    `"${row[2] || ''}"`, // Description
                    row[3] || '', // Category
                    row[4] || '', // Quantity
                    row[5] || '', // Reorder Point
                    row[6] || '', // Unit Cost
                    row[7] || '', // Unit Price
                    `"${row[8] || ''}"`, // Supplier
                    row[9] || '', // UPC
                    `"${row[10] || ''}"`, // Location
                    `"${row[11] || ''}"` // Notes
                ].join(','))
            ].join('\n');

            // Create and download the file
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', `MuRP_Inventory_Template_${new Date().toISOString().split('T')[0]}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (error) {
            console.error('Error downloading template:', error);
            setError('Failed to download template. Please try again.');
        }
    };

    const handleEmailTemplate = () => {
        try {
            const subject = encodeURIComponent('MuRP Inventory Template - Getting Started');
            const body = encodeURIComponent(
                `Hi there!\n\nI've created a comprehensive inventory template for MuRP to help you get started with your inventory management.\n\n` +
                `Template includes:\n` +
                `• Professional 4-sheet Google Sheets workbook\n` +
                `• Sample products across 4 categories\n` +
                `• Step-by-step instructions\n` +
                `• Data validation and formatting\n\n` +
                `Access your template here: ${sheetsTemplateUrl || 'Please create template first'}\n\n` +
                `Next steps:\n` +
                `1. Review the Instructions sheet\n` +
                `2. Add your own inventory data\n` +
                `3. Import back into MuRP\n\n` +
                `Questions? Check out our documentation or reach out to support.\n\n` +
                `Best,\n${user.name}`
            );

            const mailtoUrl = `mailto:?subject=${subject}&body=${body}`;
            window.open(mailtoUrl, '_blank');
        } catch (error) {
            console.error('Error creating email:', error);
            setError('Failed to open email client. Please try again.');
        }
    };

    const navigateTo = (page: string) => {
        // Simple navigation - in a real app this would use React Router or similar
        window.location.href = `/${page.toLowerCase()}`;
    };

    // Handle Finale API connection test
    const handleFinaleTest = async () => {
        if (!finaleApiKey || !finaleApiSecret || !finaleAccountPath) {
            setError('Please fill in all Finale API fields.');
            return;
        }

        try {
            setFinaleTesting(true);
            setError('');

            // Save credentials to localStorage (for immediate use)
            localStorage.setItem('finale_api_key', finaleApiKey);
            localStorage.setItem('finale_api_secret', finaleApiSecret);
            localStorage.setItem('finale_account_path', finaleAccountPath);

            // Test connection via API proxy
            const response = await fetch('/api/finale/test-connection', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    apiKey: finaleApiKey,
                    apiSecret: finaleApiSecret,
                    accountPath: finaleAccountPath,
                }),
            });

            if (response.ok) {
                // Store credentials server-side for scheduled syncs
                try {
                    const { data: { session } } = await supabase.auth.getSession();
                    if (session?.access_token) {
                        const storeResponse = await fetch(
                            `${import.meta.env.VITE_SUPABASE_URL || 'https://mpuevsmtowyexhsqugkm.supabase.co'}/functions/v1/store-finale-credentials`,
                            {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                    'Authorization': `Bearer ${session.access_token}`,
                                },
                                body: JSON.stringify({
                                    apiKey: finaleApiKey,
                                    apiSecret: finaleApiSecret,
                                    accountPath: finaleAccountPath,
                                }),
                            }
                        );
                        const storeResult = await storeResponse.json();
                        console.log('[Onboarding] Credentials stored:', storeResult.message);
                    }
                } catch (storeError) {
                    // Non-critical error - credentials still work from localStorage
                    console.warn('[Onboarding] Could not store credentials server-side:', storeError);
                }

                setFinaleConnected(true);
            } else {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to connect to Finale');
            }
        } catch (err: any) {
            setError(err.message || 'Failed to test Finale connection. Check your credentials.');
            setFinaleConnected(false);
        } finally {
            setFinaleTesting(false);
        }
    };

    // Define roleMessaging based on user role
    const roleMessaging = roleCopy[user.role] ?? roleCopy.Staff;

    const handleNext = () => setStep((prev) => Math.min(prev + 1, totalSteps - 1));
    const handleBack = () => setStep((prev) => Math.max(prev - 1, 0));

    const canProceedToNext = () => {
        switch (step) {
            case 0: return true; // Preferences always allow next
            case 1: return dataSource !== null; // Must choose data source
            case 2: // Setup step depends on data source
                if (dataSource === 'finale') return finaleConnected;
                if (dataSource === 'google_sheets') return googleConnected;
                if (dataSource === 'csv' || dataSource === 'skip') return true;
                return false;
            case 3: // Import step
                if (dataSource === 'google_sheets') return !!sheetsTemplateUrl;
                return true; // Finale auto-syncs, CSV/skip proceed
            case 4: // Final data step
                if (dataSource === 'google_sheets') return importComplete;
                return true;
            case 5: return true; // Password step
            default: return false;
        }
    };

    const renderStep = () => {
      if (step === 0) {
        return (
          <div className="space-y-6">
            <div className="text-center space-y-3">
              <h1 className="text-3xl font-bold text-white">Hey {user.name.split(' ')[0]}, welcome to MuRP.</h1>
              <p className="text-sm text-gray-400">{roleMessaging.headline}</p>
              <p className="text-sm text-gray-400">{roleMessaging.blurb}</p>
            </div>
            <div className="bg-gray-900/50 border border-gray-700 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2 text-gray-200 font-semibold">
                <LightBulbIcon className="w-5 h-5 text-amber-300" />
                Make it feel like home
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                {themeOptions.map((option) => (
                  <Button
                    key={option.value}
                    variant={theme === option.value ? 'primary' : 'ghost'}
                    className="h-full flex flex-col items-start gap-1"
                    onClick={() => setTheme(option.value)}
                  >
                    <span className="text-sm font-semibold">
                      {option.label}
                      {theme === option.value && <span className="ml-2 text-xs text-emerald-300">Active</span>}
                    </span>
                    <span className="text-xs text-gray-400">{option.description}</span>
                  </Button>
                ))}
              </div>
              <div>
                <p className="text-xs uppercase text-gray-500 font-semibold mb-2">Table density</p>
                <div className="grid gap-3 sm:grid-cols-3">
                  {densityOptions.map((option) => (
                    <label
                      key={option.value}
                      className={`rounded-lg border px-3 py-2 text-sm cursor-pointer transition-colors ${
                        rowDensity === option.value
                          ? 'border-accent-400 bg-accent-500/10 text-white'
                          : 'border-gray-700 bg-gray-900/40 text-gray-300 hover:border-gray-500'
                      }`}
                    >
                      <input
                        type="radio"
                        name="density"
                        className="hidden"
                        checked={rowDensity === option.value}
                        onChange={() => setRowDensity(option.value)}
                      />
                      <span className="block font-semibold">{option.label}</span>
                      <span className="text-xs text-gray-400">{option.blurb}</span>
                    </label>
                  ))}
                </div>
              </div>
              <p className="text-xs text-gray-500">
                Current theme: <span className="text-gray-200">{resolvedTheme}</span> · Row density:{' '}
                <span className="text-gray-200 capitalize">{rowDensity}</span>
              </p>
            </div>
          </div>
        );
      }

      // Step 1: Choose Your Data Source
      if (step === 1) {
        return (
          <div className="space-y-6">
            <div className="text-center space-y-3">
              <h2 className="text-2xl font-bold text-white">Choose Your Data Source</h2>
              <p className="text-sm text-gray-400">
                How would you like to import your inventory data? You can always add more sources later.
              </p>
            </div>

            <div className="grid gap-4">
              {/* Finale API - Primary Option */}
              <button
                onClick={() => setDataSource('finale')}
                className={`w-full text-left rounded-xl border-2 p-5 transition-all ${
                  dataSource === 'finale'
                    ? 'border-blue-500 bg-blue-500/10'
                    : 'border-gray-700 bg-gray-900/50 hover:border-gray-600'
                }`}
              >
                <div className="flex items-start gap-4">
                  <div className={`rounded-full p-3 ${dataSource === 'finale' ? 'bg-blue-500/20' : 'bg-gray-800'}`}>
                    <TruckIcon className={`w-6 h-6 ${dataSource === 'finale' ? 'text-blue-400' : 'text-gray-400'}`} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-semibold text-white">Finale Inventory API</h3>
                      <span className="px-2 py-0.5 text-xs font-medium bg-blue-500/20 text-blue-300 rounded-full">Recommended</span>
                    </div>
                    <p className="text-sm text-gray-400 mt-1">
                      Connect directly to your Finale account for automatic sync of inventory, vendors, BOMs, and purchase orders.
                    </p>
                    <ul className="text-xs text-gray-500 mt-2 space-y-1">
                      <li>• Real-time sync every 5 minutes</li>
                      <li>• Import vendors, inventory, and BOMs</li>
                      <li>• Automatic PO tracking</li>
                    </ul>
                  </div>
                  {dataSource === 'finale' && <CheckCircleIcon className="w-6 h-6 text-blue-400" />}
                </div>
              </button>

              {/* Google Sheets */}
              <button
                onClick={() => setDataSource('google_sheets')}
                className={`w-full text-left rounded-xl border-2 p-5 transition-all ${
                  dataSource === 'google_sheets'
                    ? 'border-emerald-500 bg-emerald-500/10'
                    : 'border-gray-700 bg-gray-900/50 hover:border-gray-600'
                }`}
              >
                <div className="flex items-start gap-4">
                  <div className={`rounded-full p-3 ${dataSource === 'google_sheets' ? 'bg-emerald-500/20' : 'bg-gray-800'}`}>
                    <DocumentTextIcon className={`w-6 h-6 ${dataSource === 'google_sheets' ? 'text-emerald-400' : 'text-gray-400'}`} />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-white">Google Sheets</h3>
                    <p className="text-sm text-gray-400 mt-1">
                      Import from a Google spreadsheet. Great for starting fresh or migrating from Excel.
                    </p>
                    <ul className="text-xs text-gray-500 mt-2 space-y-1">
                      <li>• We'll create a template for you</li>
                      <li>• Add your data in familiar spreadsheet format</li>
                      <li>• One-click import back to MuRP</li>
                    </ul>
                  </div>
                  {dataSource === 'google_sheets' && <CheckCircleIcon className="w-6 h-6 text-emerald-400" />}
                </div>
              </button>

              {/* CSV Upload */}
              <button
                onClick={() => setDataSource('csv')}
                className={`w-full text-left rounded-xl border-2 p-5 transition-all ${
                  dataSource === 'csv'
                    ? 'border-purple-500 bg-purple-500/10'
                    : 'border-gray-700 bg-gray-900/50 hover:border-gray-600'
                }`}
              >
                <div className="flex items-start gap-4">
                  <div className={`rounded-full p-3 ${dataSource === 'csv' ? 'bg-purple-500/20' : 'bg-gray-800'}`}>
                    <CloudUploadIcon className={`w-6 h-6 ${dataSource === 'csv' ? 'text-purple-400' : 'text-gray-400'}`} />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-white">Upload CSV File</h3>
                    <p className="text-sm text-gray-400 mt-1">
                      Upload a CSV export from your existing inventory system.
                    </p>
                  </div>
                  {dataSource === 'csv' && <CheckCircleIcon className="w-6 h-6 text-purple-400" />}
                </div>
              </button>

              {/* Skip for now */}
              <button
                onClick={() => setDataSource('skip')}
                className={`w-full text-left rounded-xl border-2 p-4 transition-all ${
                  dataSource === 'skip'
                    ? 'border-gray-500 bg-gray-500/10'
                    : 'border-gray-700/50 bg-gray-900/30 hover:border-gray-600'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className={`text-sm ${dataSource === 'skip' ? 'text-gray-300' : 'text-gray-500'}`}>
                    Skip for now — I'll set this up later in Settings
                  </span>
                  {dataSource === 'skip' && <CheckCircleIcon className="w-5 h-5 text-gray-400" />}
                </div>
              </button>
            </div>
          </div>
        );
      }

      // Step 2: Connect chosen data source
      if (step === 2) {
        // Finale API Setup
        if (dataSource === 'finale') {
          return (
            <div className="space-y-6">
              <div className="text-center space-y-3">
                <h2 className="text-2xl font-bold text-white">Connect Finale Inventory</h2>
                <p className="text-sm text-gray-400">
                  Enter your Finale API credentials to sync your data automatically.
                </p>
              </div>

              <div className="bg-gray-900/50 border border-gray-700 rounded-xl p-6 space-y-4">
                {finaleConnected ? (
                  <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-4">
                    <div className="flex items-center gap-2">
                      <CheckCircleIcon className="w-5 h-5 text-emerald-400" />
                      <span className="text-sm font-semibold text-emerald-200">Connected to Finale!</span>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">
                      Your credentials have been verified. Data will sync automatically.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">API Key</label>
                        <input
                          type="text"
                          value={finaleApiKey}
                          onChange={(e) => setFinaleApiKey(e.target.value)}
                          placeholder="Your Finale API key"
                          className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">API Secret</label>
                        <input
                          type="password"
                          value={finaleApiSecret}
                          onChange={(e) => setFinaleApiSecret(e.target.value)}
                          placeholder="Your Finale API secret"
                          className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">Account Path</label>
                        <input
                          type="text"
                          value={finaleAccountPath}
                          onChange={(e) => setFinaleAccountPath(e.target.value)}
                          placeholder="account/12345/facility/67890"
                          className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          Find this in Finale under Settings → API Access
                        </p>
                      </div>
                    </div>

                    <Button
                      onClick={handleFinaleTest}
                      loading={finaleTesting}
                      className="w-full bg-blue-600 text-white font-semibold py-3 px-4 rounded-md hover:bg-blue-700 transition-colors"
                    >
                      {finaleTesting ? 'Testing Connection...' : 'Test & Connect'}
                    </Button>
                  </>
                )}
              </div>
            </div>
          );
        }

        // Google Sheets Setup (moved from old step 1)
        if (dataSource === 'google_sheets') {
          return (
            <div className="space-y-6">
              <div className="text-center space-y-3">
                <h2 className="text-2xl font-bold text-white">Connect Your Google Account</h2>
                <p className="text-sm text-gray-400">
                  Let's get you set up with working inventory data. Start by connecting Google Workspace.
                </p>
              </div>

              <div className="bg-gray-900/50 border border-gray-700 rounded-xl p-6 space-y-4">
                {googleConnected ? (
                  <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-4">
                    <div className="flex items-center gap-2">
                      <CheckCircleIcon className="w-5 h-5 text-emerald-400" />
                      <span className="text-sm font-semibold text-emerald-200">Connected to Google Workspace</span>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">{googleEmail}</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="rounded-lg border border-gray-600 bg-gray-800/50 p-4">
                      <h4 className="text-sm font-semibold text-white mb-2">What you'll get:</h4>
                      <ul className="text-xs text-gray-400 space-y-1">
                        <li>• Import inventory from Google Sheets</li>
                        <li>• Export data for sharing and backups</li>
                        <li>• Automatic backups after syncs</li>
                      </ul>
                    </div>

                    <Button
                      onClick={handleGoogleConnect}
                    className="w-full flex items-center justify-center gap-3 bg-white text-gray-800 font-semibold py-3 px-4 rounded-md hover:bg-gray-200 transition-colors"
                    loading={loading}
                  >
                    <GmailIcon className="w-5 h-5 text-[#DB4437]" />
                    Connect Google Workspace
                  </Button>
                </div>
              )}
            </div>
          </div>
        );
      }

        // CSV upload path - show simple message
        if (dataSource === 'csv' || dataSource === 'skip') {
          return (
            <div className="space-y-6">
              <div className="text-center space-y-3">
                <h2 className="text-2xl font-bold text-white">
                  {dataSource === 'csv' ? 'CSV Upload Ready' : 'Setup Data Source Later'}
                </h2>
                <p className="text-sm text-gray-400">
                  {dataSource === 'csv'
                    ? 'You can upload your inventory CSV file from the Settings page after completing setup.'
                    : "No problem! You can connect your data source anytime from Settings → Integrations."
                  }
                </p>
              </div>

              <div className="bg-gray-900/50 border border-gray-700 rounded-xl p-6">
                <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-4">
                  <div className="flex items-center gap-2">
                    <CheckCircleIcon className="w-5 h-5 text-emerald-400" />
                    <span className="text-sm font-semibold text-emerald-200">
                      {dataSource === 'csv' ? 'CSV import will be available in Settings' : 'You can set up data sources later'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        }

        return null;
      }

      // Step 3: Different flows for different data sources
      if (step === 3) {
        // Finale API: Show sync confirmation
        if (dataSource === 'finale') {
          return (
            <div className="space-y-6">
              <div className="text-center space-y-3">
                <h2 className="text-2xl font-bold text-white">Your Data is Syncing</h2>
                <p className="text-sm text-gray-400">
                  MuRP is now connected to your Finale account. Your inventory data will sync automatically.
                </p>
              </div>

              <div className="bg-gray-900/50 border border-gray-700 rounded-xl p-6 space-y-4">
                <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-4">
                  <div className="flex items-center gap-2">
                    <CheckCircleIcon className="w-5 h-5 text-emerald-400" />
                    <span className="text-sm font-semibold text-emerald-200">Finale API Connected</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-2">
                    Your inventory, vendors, BOMs, and purchase orders will sync automatically every 5 minutes.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-lg border border-gray-600 bg-gray-800/50 p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <PackageIcon className="w-4 h-4 text-blue-400" />
                      <span className="text-sm font-medium text-white">Inventory</span>
                    </div>
                    <p className="text-xs text-gray-400">SKUs, stock levels, costs</p>
                  </div>
                  <div className="rounded-lg border border-gray-600 bg-gray-800/50 p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <TruckIcon className="w-4 h-4 text-purple-400" />
                      <span className="text-sm font-medium text-white">Vendors</span>
                    </div>
                    <p className="text-xs text-gray-400">Suppliers and contacts</p>
                  </div>
                  <div className="rounded-lg border border-gray-600 bg-gray-800/50 p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <DocumentTextIcon className="w-4 h-4 text-emerald-400" />
                      <span className="text-sm font-medium text-white">Purchase Orders</span>
                    </div>
                    <p className="text-xs text-gray-400">Open and historical POs</p>
                  </div>
                  <div className="rounded-lg border border-gray-600 bg-gray-800/50 p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <CalculatorIcon className="w-4 h-4 text-amber-400" />
                      <span className="text-sm font-medium text-white">BOMs</span>
                    </div>
                    <p className="text-xs text-gray-400">Bills of materials</p>
                  </div>
                </div>

                <p className="text-xs text-gray-500 text-center">
                  Initial sync may take a few minutes depending on your data volume.
                </p>
              </div>
            </div>
          );
        }

        // Google Sheets: Create template
        if (dataSource === 'google_sheets') {
          return (
            <div className="space-y-6">
              <div className="text-center space-y-3">
                <h2 className="text-2xl font-bold text-white">Create Your Inventory Template</h2>
                <p className="text-sm text-gray-400">
                  We'll create a comprehensive Google Sheet with sample data, instructions, and formatting to get you started.
                </p>
              </div>

              <div className="bg-gray-900/50 border border-gray-700 rounded-xl p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-full bg-blue-500/20 p-3">
                    <DocumentTextIcon className="w-6 h-6 text-blue-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-white">Professional Inventory Template</h3>
                    <p className="text-sm text-gray-400">4-sheet workbook with samples, instructions, and validation</p>
                  </div>
                </div>

                {sheetsTemplateUrl ? (
                  <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-4">
                    <div className="flex items-center gap-2">
                      <CheckCircleIcon className="w-5 h-5 text-emerald-400" />
                      <span className="text-sm font-semibold text-emerald-200">Template Created!</span>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">
                      Your comprehensive template is ready with sample data and instructions.
                    </p>
                    <div className="flex gap-2 mt-3">
                      <a
                        href={sheetsTemplateUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded-md transition-colors"
                      >
                        Open in Google Sheets
                      </a>
                      <button
                        onClick={() => navigator.clipboard.writeText(sheetsTemplateUrl)}
                        className="text-xs bg-gray-600 hover:bg-gray-700 text-white px-3 py-1 rounded-md transition-colors"
                      >
                        Copy Link
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="rounded-lg border border-gray-600 bg-gray-800/50 p-4">
                        <h4 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
                          <DocumentTextIcon className="w-4 h-4 text-blue-400" />
                          Inventory Sheet
                        </h4>
                        <ul className="text-xs text-gray-400 space-y-1">
                          <li>• 12-column format with validation</li>
                          <li>• Sample products across 4 categories</li>
                          <li>• 20+ empty rows for your data</li>
                          <li>• Frozen headers and auto-sizing</li>
                        </ul>
                      </div>
                      <div className="rounded-lg border border-gray-600 bg-gray-800/50 p-4">
                        <h4 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
                          <LightBulbIcon className="w-4 h-4 text-yellow-400" />
                          Instructions & Help
                        </h4>
                        <ul className="text-xs text-gray-400 space-y-1">
                          <li>• Step-by-step import guide</li>
                          <li>• Field descriptions and tips</li>
                          <li>• Troubleshooting section</li>
                          <li>• Category suggestions</li>
                        </ul>
                      </div>
                    </div>

                    <Button
                      onClick={handleCreateSheetsTemplate}
                      className="w-full bg-blue-600 text-white font-semibold py-3 px-4 rounded-md hover:bg-blue-700 transition-colors"
                      loading={loading}
                    >
                      {loading ? 'Creating template...' : 'Create Professional Template'}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          );
        }

        // CSV or Skip: Feature showcase (general features)
        if (dataSource === 'csv' || dataSource === 'skip') {
        return (
          <div className="space-y-6">
            <div className="text-center space-y-3">
              <h2 className="text-2xl font-bold text-white">Discover MuRP's Full Potential</h2>
              <p className="text-sm text-gray-400">
                You're getting started with our powerful free tier. Here's what's available when you upgrade.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-gradient-to-br from-purple-500/10 to-pink-500/10 border border-purple-500/20 rounded-xl p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="rounded-full bg-purple-500/20 p-2">
                    <TruckIcon className="w-5 h-5 text-purple-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-white">Shopify Integration</h3>
                </div>
                <p className="text-sm text-gray-300 mb-3">
                  Sync inventory with your online store automatically. Orders update stock levels in real-time.
                </p>
                <div className="text-xs text-purple-300">
                  • Automatic stock sync • Order fulfillment • Multi-channel sales tracking
                </div>
              </div>

              <div className="bg-gradient-to-br from-blue-500/10 to-cyan-500/10 border border-blue-500/20 rounded-xl p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="rounded-full bg-blue-500/20 p-2">
                    <PackageIcon className="w-5 h-5 text-blue-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-white">Carrier Tracking (Free)</h3>
                </div>
                <p className="text-sm text-gray-300 mb-3">
                  Free shipment tracking using direct carrier APIs (USPS, UPS, FedEx).
                </p>
                <div className="text-xs text-blue-300">
                  • Direct carrier APIs • No subscription fees • Email-based tracking
                </div>
              </div>

              <div className="bg-gradient-to-br from-green-500/10 to-emerald-500/10 border border-green-500/20 rounded-xl p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="rounded-full bg-green-500/20 p-2">
                    <CalculatorIcon className="w-5 h-5 text-green-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-white">QuickBooks Sync</h3>
                </div>
                <p className="text-sm text-gray-300 mb-3">
                  Seamless integration with QuickBooks for accounting and financial reporting.
                </p>
                <div className="text-xs text-green-300">
                  • Invoice automation • Expense tracking • Financial dashboards
                </div>
              </div>

              <div className="bg-gradient-to-br from-orange-500/10 to-red-500/10 border border-orange-500/20 rounded-xl p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="rounded-full bg-orange-500/20 p-2">
                    <ChartBarIcon className="w-5 h-5 text-orange-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-white">Advanced Analytics</h3>
                </div>
                <p className="text-sm text-gray-300 mb-3">
                  Deep insights into inventory turnover, profitability, and demand forecasting.
                </p>
                <div className="text-xs text-orange-300">
                  • Predictive analytics • Custom reports • Performance dashboards
                </div>
              </div>
            </div>

            <div className="bg-gray-900/50 border border-gray-700 rounded-xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="rounded-full bg-accent-500/20 p-2">
                  <SparklesIcon className="w-5 h-5 text-accent-400" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white">Free Tier is Powerful Too</h3>
                  <p className="text-sm text-gray-400">You're already getting enterprise-grade inventory management</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="flex items-center gap-2">
                  <CheckCircleIcon className="w-4 h-4 text-green-400" />
                  <span className="text-gray-300">Google Sheets sync</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircleIcon className="w-4 h-4 text-green-400" />
                  <span className="text-gray-300">Real-time dashboards</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircleIcon className="w-4 h-4 text-green-400" />
                  <span className="text-gray-300">Purchase order tracking</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircleIcon className="w-4 h-4 text-green-400" />
                  <span className="text-gray-300">Automated backups</span>
                </div>
              </div>
            </div>

            <div className="text-center">
              <p className="text-sm text-gray-400 mb-4">
                Ready to import your sample inventory and start exploring?
              </p>
              <Button
                onClick={() => setStep(4)}
                className="bg-accent-500 text-white px-8 py-3 rounded-md hover:bg-accent-500 transition-colors"
              >
                Continue to Import
              </Button>
            </div>
          </div>
        );
        }

        // Fallback for step 3
        return null;
      }

      if (step === 4) {
        // Finale: Ready to go
        if (dataSource === 'finale') {
          return (
            <div className="space-y-6">
              <div className="text-center space-y-3">
                <h2 className="text-2xl font-bold text-white">You're All Set!</h2>
                <p className="text-sm text-gray-400">
                  Your Finale data is syncing. Just one more step to secure your account.
                </p>
              </div>

              <div className="bg-gray-900/50 border border-gray-700 rounded-xl p-6 space-y-4">
                <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-4">
                  <div className="flex items-center gap-2">
                    <CheckCircleIcon className="w-5 h-5 text-emerald-400" />
                    <span className="text-sm font-semibold text-emerald-200">Setup Nearly Complete</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-2">
                    Your inventory, vendors, and purchase orders will appear in MuRP as the sync completes.
                  </p>
                </div>

                <div className="text-center">
                  <p className="text-sm text-gray-400 mb-2">What you'll be able to do:</p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="flex items-center gap-2 text-gray-300">
                      <CheckCircleIcon className="w-4 h-4 text-emerald-400" />
                      View real-time inventory
                    </div>
                    <div className="flex items-center gap-2 text-gray-300">
                      <CheckCircleIcon className="w-4 h-4 text-emerald-400" />
                      Track purchase orders
                    </div>
                    <div className="flex items-center gap-2 text-gray-300">
                      <CheckCircleIcon className="w-4 h-4 text-emerald-400" />
                      Manage vendor contacts
                    </div>
                    <div className="flex items-center gap-2 text-gray-300">
                      <CheckCircleIcon className="w-4 h-4 text-emerald-400" />
                      Get stock intelligence
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        }

        // CSV or Skip: Ready to finish
        if (dataSource === 'csv' || dataSource === 'skip') {
          return (
            <div className="space-y-6">
              <div className="text-center space-y-3">
                <h2 className="text-2xl font-bold text-white">Almost Done!</h2>
                <p className="text-sm text-gray-400">
                  {dataSource === 'csv'
                    ? 'You can upload your CSV file from Settings after completing setup.'
                    : 'You can connect a data source anytime from Settings.'}
                </p>
              </div>

              <div className="bg-gray-900/50 border border-gray-700 rounded-xl p-6 space-y-4">
                <div className="rounded-lg border border-blue-500/40 bg-blue-500/10 p-4">
                  <div className="flex items-center gap-2">
                    <LightBulbIcon className="w-5 h-5 text-blue-400" />
                    <span className="text-sm font-semibold text-blue-200">Next Steps After Setup</span>
                  </div>
                  <ul className="text-xs text-gray-400 mt-2 space-y-1">
                    <li>• Go to Settings → Integrations to connect your data source</li>
                    <li>• Upload CSV files or connect Google Sheets</li>
                    <li>• Start tracking inventory and purchase orders</li>
                  </ul>
                </div>
              </div>
            </div>
          );
        }

        // Google Sheets: Import data
        return (
          <div className="space-y-6">
            <div className="text-center space-y-3">
              <h2 className="text-2xl font-bold text-white">Import Your Inventory Data</h2>
              <p className="text-sm text-gray-400">
                Let's bring that sample data into MuRP so you have working inventory to explore.
              </p>
            </div>

            <div className="bg-gray-900/50 border border-gray-700 rounded-xl p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-purple-500/20 p-3">
                  <ChevronRightIcon className="w-6 h-6 text-purple-400" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white">One-Click Import</h3>
                  <p className="text-sm text-gray-400">Import the sample data from your Google Sheet</p>
                </div>
              </div>

              {importComplete ? (
                <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-4">
                  <div className="flex items-center gap-2">
                    <CheckCircleIcon className="w-5 h-5 text-emerald-400" />
                    <span className="text-sm font-semibold text-emerald-200">Inventory Imported!</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    16 products successfully imported. You now have working inventory data in MuRP!
                  </p>
                  <div className="flex gap-2 mt-3">
                    <Button
                      onClick={() => navigateTo('Inventory')}
                      className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1 rounded-md transition-colors"
                    >
                      View Inventory
                    </Button>
                    <Button
                      onClick={() => navigateTo('Dashboard')}
                      className="text-xs bg-gray-600 hover:bg-gray-700 text-white px-3 py-1 rounded-md transition-colors"
                    >
                      Open Dashboard
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-lg border border-gray-600 bg-gray-800/50 p-4">
                    <h4 className="text-sm font-semibold text-white mb-2">What happens next:</h4>
                    <ul className="text-xs text-gray-400 space-y-1">
                      <li>• MuRP reads your Google Sheet</li>
                      <li>• Validates the data format</li>
                      <li>• Imports 16 sample products</li>
                      <li>• Creates working inventory you can explore</li>
                    </ul>
                  </div>

                  <div className="flex gap-3">
                    <Button
                      onClick={handleDownloadTemplate}
                      variant="ghost"
                      className="flex-1 border border-gray-600 text-gray-300 hover:bg-gray-700"
                    >
                      Download Template
                    </Button>
                    <Button
                      onClick={handleEmailTemplate}
                      variant="ghost"
                      className="flex-1 border border-gray-600 text-gray-300 hover:bg-gray-700"
                    >
                      Email Template
                    </Button>
                  </div>

                  <Button
                    onClick={handleImportData}
                    className="w-full bg-purple-600 text-white font-semibold py-3 px-4 rounded-md hover:bg-purple-700 transition-colors"
                    loading={loading}
                    disabled={!sheetsTemplateUrl}
                  >
                    {loading ? 'Importing data...' : 'Import Inventory from Google Sheets'}
                  </Button>

                  {!sheetsTemplateUrl && (
                    <p className="text-xs text-amber-400 text-center">
                      Please create a Google Sheets template first
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      }

      return (
        <div className="space-y-6">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-white">Secure your account</h2>
            <p className="text-sm text-gray-400 mt-1">Use a strong passphrase (12+ characters) to unlock MuRP.</p>
          </div>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <MailIcon className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="email"
              value={user.email}
              readOnly
              className="w-full bg-gray-700/50 text-gray-300 rounded-md p-3 pl-10 cursor-not-allowed"
            />
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <KeyIcon className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="password"
                placeholder="Create Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-gray-700 text-white rounded-md p-3 pl-10"
                required
              />
            </div>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <KeyIcon className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="password"
                placeholder="Confirm Password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full bg-gray-700 text-white rounded-md p-3 pl-10"
                required
              />
            </div>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <Button
              type="submit"
              className="w-full bg-accent-500 text-white font-semibold py-3 px-4 rounded-md hover:bg-accent-600 transition-colors"
            >
              {loading ? 'Saving…' : 'Complete Setup'}
            </Button>
          </form>
        </div>
      );
    };

    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900/95 p-4">
        <div className="w-full max-w-3xl bg-gray-800/70 border border-gray-700 rounded-3xl shadow-2xl p-8 space-y-6">
          <div className="flex items-center justify-between text-gray-400 text-sm">
            <span>Step {step + 1} of {totalSteps}</span>
            <div className="flex gap-1">
              {Array.from({ length: totalSteps }).map((_, index) => (
                <span
                  key={index}
                  className={`h-1.5 w-10 rounded-full ${
                    index <= step ? 'bg-accent-400' : 'bg-gray-700'
                  }`}
                />
              ))}
            </div>
          </div>
          {renderStep()}
          <div className="flex flex-wrap gap-3 justify-between pt-4 border-t border-gray-700/60">
            <Button
              onClick={handleBack}
              disabled={step === 0}
              className="text-sm text-gray-300 hover:text-white disabled:opacity-40"
            >
              Back
            </Button>
            {step < totalSteps - 1 && (
              <Button
                onClick={handleNext}
                disabled={!canProceedToNext()}
                className="bg-accent-500 text-white px-6 py-2 rounded-md hover:bg-accent-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Continue
              </Button>
            )}
          </div>
        </div>
      </div>
    );
};

export default EnhancedNewUserSetup;