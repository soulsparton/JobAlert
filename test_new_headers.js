async function test() {
  const PROXY_URL = 'https://dawn-breeze-ed44.supersparton04.workers.dev/';
  const today = new Date().toISOString().split('T')[0];
  const payload = {
    operationName: 'searchJobCardsByLocation',
    variables: {
      searchJobRequest: {
        locale: 'en-CA', country: 'Canada', pageSize: 10,
        geoQueryClause: { lat: 43.7315, lng: -79.7624, unit: 'km', distance: 100 },
        dateFilters: [{ key: 'firstDayOnSite', range: { startDate: today } }]
      }
    },
    query: 'query searchJobCardsByLocation($searchJobRequest: SearchJobRequest!) { searchJobCardsByLocation(searchJobRequest: $searchJobRequest) { jobCards { jobId jobTitle city state } } }'
  };

  // Test with new headers but WITHOUT sec-ch-ua (the problematic header) and check if origin matters
  const tests = [
    {
      name: 'NEW headers (no auth, no sec-ch-ua)',
      headers: { 'accept': '*/*', 'content-type': 'application/json', 'country': 'Canada', 'iscanary': 'false', 'origin': 'https://hiring.amazon.ca', 'referer': 'https://hiring.amazon.ca/app', 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36' }
    },
    {
      name: 'OLD headers + iscanary: false',
      headers: { 'content-type': 'application/json', 'country': 'Canada', 'iscanary': 'false', 'authorization': 'Bearer Status|unauthenticated|Session|', 'referer': 'https://hiring.amazon.ca/app', 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36' }
    },
    {
      name: 'OLD headers ONLY (baseline)',
      headers: { 'content-type': 'application/json', 'country': 'Canada', 'authorization': 'Bearer Status|unauthenticated|Session|', 'referer': 'https://hiring.amazon.ca/app', 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
    },
    {
      name: 'OLD headers + origin: same-origin',
      headers: { 'content-type': 'application/json', 'country': 'Canada', 'authorization': 'Bearer Status|unauthenticated|Session|', 'origin': 'https://hiring.amazon.ca', 'referer': 'https://hiring.amazon.ca/app', 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36' }
    },
    {
      name: 'NO dateFilters + OLD headers (are there any jobs at all?)',
      headers: { 'content-type': 'application/json', 'country': 'Canada', 'authorization': 'Bearer Status|unauthenticated|Session|', 'referer': 'https://hiring.amazon.ca/app', 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36' },
      noDate: true
    }
  ];

  for (const t of tests) {
    const body = t.noDate ? { ...payload, variables: { searchJobRequest: { ...payload.variables.searchJobRequest, dateFilters: [] } } } : payload;
    try {
      const r = await fetch(PROXY_URL, { method: 'POST', headers: t.headers, body: JSON.stringify(body) });
      const text = await r.text();
      let jobs = 'parse error';
      try { jobs = JSON.parse(text)?.data?.searchJobCardsByLocation?.jobCards?.length ?? 'null'; } catch(e) {}
      console.log('[' + t.name + '] Status:', r.status, '| Jobs:', jobs);
      if (r.status !== 200) console.log('  Body:', text.substring(0, 200));
    } catch(err) {
      console.log('[' + t.name + '] Error:', err.message);
    }
  }
}

test().catch(console.error);
