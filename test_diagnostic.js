require('dotenv').config();

async function diagnose() {
  const PROXY_URL = process.env.PROXY_URL || 'https://hiring.amazon.ca/graphql';

  const headers = {
    'accept': '*/*',
    'content-type': 'application/json',
    'country': 'Canada',
    'iscanary': 'false',
    'authorization': 'Bearer Status|unauthenticated|Session|',
    'origin': 'https://hiring.amazon.ca',
    'referer': 'https://hiring.amazon.ca/app',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36'
  };

  const query = `query searchJobCardsByLocation($searchJobRequest: SearchJobRequest!) {
    searchJobCardsByLocation(searchJobRequest: $searchJobRequest) {
      jobCards { jobId jobTitle city state postalCode locationName totalPayRateMin totalPayRateMax scheduleCount }
    }
  }`;

  const utcDate  = new Date().toISOString().split('T')[0];
  const canadaDate = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Toronto' });

  console.log('=== TIMEZONE CHECK ===');
  console.log('UTC date (what monitor.js sends)   :', utcDate);
  console.log('Canada/Toronto date (actual today) :', canadaDate);
  console.log('Dates match?', utcDate === canadaDate ? 'YES ✅' : 'NO ❌ — this is the bug!');
  console.log('');

  const tests = [
    {
      label: 'TEST 1: With dateFilter = UTC today (current monitor.js behavior)',
      req: { locale: 'en-CA', country: 'Canada', pageSize: 100, geoQueryClause: { lat: 43.7315, lng: -79.7624, unit: 'km', distance: 100 }, dateFilters: [{ key: 'firstDayOnSite', range: { startDate: utcDate } }] }
    },
    {
      label: 'TEST 2: With dateFilter = Canada today (timezone-corrected)',
      req: { locale: 'en-CA', country: 'Canada', pageSize: 100, geoQueryClause: { lat: 43.7315, lng: -79.7624, unit: 'km', distance: 100 }, dateFilters: [{ key: 'firstDayOnSite', range: { startDate: canadaDate } }] }
    },
    {
      label: 'TEST 3: NO dateFilter at all — Brampton (shows ALL active jobs)',
      req: { locale: 'en-CA', country: 'Canada', pageSize: 100, geoQueryClause: { lat: 43.7315, lng: -79.7624, unit: 'km', distance: 100 } }
    },
    {
      label: 'TEST 4: NO dateFilter — Ottawa (shows ALL active jobs)',
      req: { locale: 'en-CA', country: 'Canada', pageSize: 100, geoQueryClause: { lat: 45.4215, lng: -75.6972, unit: 'km', distance: 100 } }
    },
    {
      label: 'TEST 5: NO geo, NO date — ALL Canada jobs (sanity check)',
      req: { locale: 'en-CA', country: 'Canada', pageSize: 100 }
    }
  ];

  for (const t of tests) {
    try {
      const payload = { operationName: 'searchJobCardsByLocation', variables: { searchJobRequest: t.req }, query };
      const r = await fetch(PROXY_URL, { method: 'POST', headers, body: JSON.stringify(payload) });
      const j = await r.json();
      const jobs = j.data?.searchJobCardsByLocation?.jobCards || [];
      console.log(`[${t.label}]`);
      console.log(`  Status: ${r.status} | Jobs found: ${jobs.length}`);
      if (jobs.length > 0) {
        jobs.forEach(j => console.log(`  -> ${j.jobTitle} | ${j.city}, ${j.state} | $${j.totalPayRateMin}-$${j.totalPayRateMax}/hr`));
      }
      console.log('');
    } catch (err) {
      console.log(`[${t.label}] ERROR:`, err.message, '\n');
    }
  }
}

diagnose();
