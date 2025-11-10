// Check what tables exist and their data
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://mpuevsmtowyexhsqugkm.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1wdWV2c210b3d5ZXhoc3F1Z2ttIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE3NDA3MzYsImV4cCI6MjA3NzMxNjczNn0.ewucknfYUMY-unX6tuu-s9iDO6uQykKqM7klOPDE27I'
);

async function checkTables() {
  // Try different table names
  const tables = ['inventory_items', 'inventory', 'items', 'boms', 'vendors'];
  
  for (const tableName of tables) {
    try {
      const { count, error } = await supabase
        .from(tableName)
        .select('*', { count: 'exact', head: true });
      
      if (!error) {
        console.log(`✓ Table '${tableName}' exists with ${count} rows`);
        
        // Get sample data
        const { data } = await supabase
          .from(tableName)
          .select('*')
          .limit(1);
        
        if (data && data.length > 0) {
          console.log(`  Sample columns:`, Object.keys(data[0]).join(', '));
        }
      }
    } catch (e) {
      // Table doesn't exist
    }
  }
}

checkTables();
