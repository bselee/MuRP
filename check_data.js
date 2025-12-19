const { createClient } = require('./node_modules/@supabase/supabase-js/dist/main/index.js');
require('dotenv').config({ path: '.env.local' });

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_ANON_KEY;
console.log('URL found:', !!url);
console.log('Key found:', !!key);

if (!url || !key) process.exit(1);

const supabase = createClient(url, key);

(async () => {
  // Check classification context
  const { data: classData, error } = await supabase
    .from('agent_classification_context')
    .select('sku, flow_type, should_trigger_reorder_alerts, reorder_method, stock_intel_exclude')
    .limit(50);
  
  if (error) {
    console.log('Classification context error:', error.message);
  } else {
    console.log('\nClassification context items:', classData?.length);
    const trigger = classData?.filter(c => c.should_trigger_reorder_alerts === true) || [];
    const noTrigger = classData?.filter(c => c.should_trigger_reorder_alerts !== true) || [];
    console.log('  should_trigger_reorder_alerts=true:', trigger.length);
    console.log('  should_trigger_reorder_alerts!=true:', noTrigger.length);
    
    // Group by flow_type
    const byFlow = {};
    classData?.forEach(c => { byFlow[c.flow_type || 'null'] = (byFlow[c.flow_type || 'null'] || 0) + 1; });
    console.log('  By flow_type:', JSON.stringify(byFlow));
  }

  // Check reorder analytics
  const { data: reorder, error: rerr } = await supabase
    .from('product_reorder_analytics')
    .select('sku, reorder_status, available_quantity')
    .in('reorder_status', ['OUT_OF_STOCK', 'CRITICAL', 'REORDER_NOW'])
    .limit(20);
    
  if (rerr) {
    console.log('\nReorder analytics error:', rerr.message);
  } else {
    console.log('\nCritical reorder items:', reorder?.length);
    reorder?.slice(0,5).forEach(r => console.log(' ', r.sku, r.reorder_status, 'qty:', r.available_quantity));
  }
})();
