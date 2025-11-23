/**
 * Example: Using the new useData hook for cleaner data fetching
 * 
 * Context7 Pattern: Generic reusable hook extracted from repetitive code
 * This replaces the verbose useEffect + useState + fetch pattern
 */

import React from 'react';
import { useData } from './useSupabaseData';

/**
 * Example 1: Simple data fetching
 */
export function SimpleDataExample() {
  const { data, loading, error } = useData<{ name: string; value: number }[]>(
    '/api/some-endpoint'
  );

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <ul>
      {data?.map((item, i) => (
        <li key={i}>{item.name}: {item.value}</li>
      ))}
    </ul>
  );
}

/**
 * Example 2: Conditional fetching with cascading dependencies
 * Mimics the Context7 pattern for ShippingForm
 */
export function CascadingDataExample({ country }: { country: string }) {
  const { data: cities } = useData<Array<{ id: string; name: string }>>(
    `/api/cities?country=${country}`
  );
  
  const [selectedCity, setSelectedCity] = React.useState<string | null>(null);
  
  const { data: areas } = useData<Array<{ id: string; name: string }>>(
    selectedCity ? `/api/areas?city=${selectedCity}` : null
  );

  return (
    <div>
      <select onChange={(e) => setSelectedCity(e.target.value)}>
        <option value="">Select a city</option>
        {cities?.map(city => (
          <option key={city.id} value={city.id}>{city.name}</option>
        ))}
      </select>
      
      {areas && (
        <select>
          <option value="">Select an area</option>
          {areas.map(area => (
            <option key={area.id} value={area.id}>{area.name}</option>
          ))}
        </select>
      )}
    </div>
  );
}

/**
 * Example 3: Using with Supabase endpoints
 */
export function SupabaseDataExample({ vendorId }: { vendorId: string }) {
  // Fetch vendor-specific inventory
  const { data: inventory, loading, error } = useData(
    vendorId ? `/api/inventory?vendor=${vendorId}` : null
  );

  return (
    <div>
      {loading && <p>Loading inventory...</p>}
      {error && <p className="text-red-500">Failed to load: {error.message}</p>}
      {inventory && (
        <div className="space-y-2">
          {/* Render inventory items */}
        </div>
      )}
    </div>
  );
}
