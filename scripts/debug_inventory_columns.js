import https from 'https';
import { parse } from 'csv-parse/sync';

const url = process.env.FINALE_INVENTORY_REPORT_URL;
const creds = `${process.env.FINALE_API_KEY}:${process.env.FINALE_API_SECRET}`;
const auth = Buffer.from(creds).toString('base64');

https.get(url, { headers: { Authorization: `Basic ${auth}` } }, (res) => {
  let raw = '';
  res.on('data', (chunk) => raw += chunk);
  res.on('end', () => {
    const records = parse(raw, { columns: true });
    console.log(records[0]);
    console.log(Object.keys(records[0] || {}));
  });
}).on('error', (err) => {
  console.error('Failed to download CSV', err);
  process.exit(1);
});
