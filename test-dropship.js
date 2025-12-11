const supabase = require("@supabase/supabase-js");

async function checkDropship() {
  const sb = supabase.createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.VITE_SUPABASE_ANON_KEY
  );

  const { data, error } = await sb
    .from("inventory_items")
    .select("sku, name, custom_fields")
    .limit(20);

  if (error) {
    console.error("Error:", error);
    return;
  }

  console.log("Sample inventory items with custom_fields:");
  data.forEach((item) => {
    console.log(`\nSKU: ${item.sku}`);
    console.log(`Name: ${item.name}`);
    console.log(`custom_fields:`, JSON.stringify(item.custom_fields, null, 2));
  });
}

checkDropship().catch(console.error);
