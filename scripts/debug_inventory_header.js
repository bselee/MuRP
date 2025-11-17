import https from 'https';

const url = process.env.FINALE_INVENTORY_REPORT_URL.replace('/pivotTableStream/', '/pivotTable/');
const creds = `${process.env.FINALE_API_KEY}:${process.env.FINALE_API_SECRET}`;
const auth = Buffer.from(creds).toString('base64');

https.get(url, { headers: { Authorization: `Basic ${auth}` } }, (res) => {
  let raw = '';
  res.on('data', (chunk) => raw += chunk);
  res.on('end', () => {
    const lines = raw.split(/\r?\n/).filter(Boolean).slice(0, 5);
    console.log(lines);
  });
}).on('error', (err) => {
  console.error('Failed to download CSV', err);
  process.exit(1);
});
