// Test direct Finale CSV fetch
import { FinaleBasicAuthClient } from './services/finaleBasicAuthClient.js';

const client = new FinaleBasicAuthClient({
  apiKey: 'I9TVdRvblFod',
  apiSecret: '63h4TCI62vlQUYM3btEA7bycoIflGQUz',
  accountPath: 'buildasoilorganics',
  inventoryReportUrl: 'https://app.finaleinventory.com/buildasoilorganics/doc/report/pivotTableStream/1762466964588/Report.csv?format=csv&data=product&attrName=%23%23product001&rowDimensions=~3AAQms0CCMB_wMDAwMDAwJrNAf7Ay0Bz2AAAAAAAwMDAwMDAwJrNAhzAzP7AwMDAwMDAms0B1MDLQIHcAAAAAADAwADAwMDAms0BzcDLQG3YUeuFHrjAwMDAwMDAmrtwcm9kdWN0VW5pdmVyc2FsUHJvZHVjdENvZGXAy0BskzMzMzMzwMDAwMDAwJrZIXByb2R1Y3RJbnRlcm5hdGlvbmFsQXJ0aWNsZU51bWJlcsDLQGyTMzMzMzPAwMDAwMDAms0CCcDLQGfQAAAAAADAAMDAwMDAms0BdahBdmcgY29zdMtAZ9AAAAAAAMACwMDAwMCazQHlwMtAZ9AAAAAAAMDAwMDAwMCa2VNwcm9kdWN0U3RvY2tDb2x1bW5SZW1haW5pbmdBZnRlclJlc2VydmF0aW9uc1VuaXRzQnVpbGRhc29pbG9yZ2FuaWNzYXBpZmFjaWxpdHkxMDAwNcDLQGfQAAAAAADAwMDAwMDAmrNwcm9kdWN0VW5pdHNJblN0b2NrwMtAZ9AAAAAAAMDAwMDAwMCatnByb2R1Y3RTYWxlc0xhc3QzMERheXPAy0Bn0AAAAAAAwMDAwMDAwJq2cHJvZHVjdFNhbGVzTGFzdDYwRGF5c8DLQGfQAAAAAADAwMDAwMDAmrZwcm9kdWN0U2FsZXNMYXN0OTBEYXlzwMtAZ9AAAAAAAMDAwMDAwMCa2TZwcm9kdWN0U2FsZXNWZWxvY2l0eUJ1aWxkYXNvaWxvcmdhbmljc2FwaWZhY2lsaXR5MTAwMDDAy0Bn0AAAAAAAwMDAwMDAwA&filters=W1sicHJvZHVjdFN0YXR1cyIsWyJQUk9EVUNUX0FDVElWRSJdLG51bGxdLFsicHJvZHVjdENhdGVnb3J5IixbXSxudWxsXSxbInByb2R1Y3RIYXNCb20iLG51bGwsbnVsbF1d&reportTitle=Master%20product%20list',
});

async function testFetch() {
  console.log('Testing Finale CSV fetch...\n');
  
  try {
    const inventory = await client.getInventory();
    console.log(`✓ Fetched ${inventory.length} inventory items`);
    
    if (inventory.length > 0) {
      console.log('\nFirst item:');
      console.log(JSON.stringify(inventory[0], null, 2));
      
      console.log('\nItems with stock > 0:');
      const withStock = inventory.filter(item => (item.stock || item.quantityOnHand || 0) > 0);
      console.log(`${withStock.length} items have stock`);
      
      if (withStock.length > 0) {
        console.log('\nSample items with stock:');
        withStock.slice(0, 3).forEach(item => {
          console.log(`  ${item.sku}: ${item.name} - Stock: ${item.stock || item.quantityOnHand}`);
        });
      }
    } else {
      console.log('\n⚠️  WARNING: CSV returned 0 items!');
      console.log('This means the Finale report URL is not returning data.');
    }
  } catch (error) {
    console.error('ERROR fetching from Finale:');
    console.error(error);
  }
}

testFetch();
