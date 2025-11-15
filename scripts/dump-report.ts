import { readFileSync } from 'fs';

const env = readFileSync('.env.local','utf8');
const get = (key:string)=>env.match(new RegExp(`${key}="?([^"\n]+)"?`))?.[1] || '';
const urls = {
  inventory: get('FINALE_INVENTORY_REPORT_URL'),
  vendors: get('FINALE_VENDORS_REPORT_URL'),
  boms: get('FINALE_BOM_REPORT_URL'),
};

for (const [label,url] of Object.entries(urls)){
  if(!url){
    console.log(`No URL for ${label}`);
    continue;
  }
  console.log(`\n=== ${label.toUpperCase()} REPORT SAMPLE ===`);
  try{
    const res = await fetch(url);
    if(!res.ok){
      console.log(`Failed: ${res.status} ${res.statusText}`);
      continue;
    }
    const text = await res.text();
    const lines = text.split('\n').slice(0,5);
    lines.forEach((line,idx)=>console.log(`${idx}: ${line}`));
  }catch(err){
    console.error(`Error fetching ${label}:`,err);
  }
}
