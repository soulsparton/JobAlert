async function testWorker() {
  const url = 'https://dawn-breeze-ed44.supersparton04.workers.dev/';
  
  console.log('Sending test POST request with realistic headers to:', url);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'country': 'Canada',
        'authorization': 'Bearer Status|unauthenticated|Session|',
        'referer': 'https://hiring.amazon.ca/app',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      body: JSON.stringify({
        operationName: "searchJobCardsByLocation",
        variables: {
          searchJobRequest: {
            locale: "en-CA",
            country: "Canada",
            pageSize: 10,
            geoQueryClause: {
              lat: 43.7315,
              lng: -79.7624,
              unit: "km",
              distance: 50
            },
            dateFilters: [{
              key: "firstDayOnSite",
              range: { startDate: new Date().toISOString().split('T')[0] }
            }]
          }
        },
        query: `query searchJobCardsByLocation($searchJobRequest: SearchJobRequest!) {
          searchJobCardsByLocation(searchJobRequest: $searchJobRequest) {
            jobCards {
              jobId
              jobTitle
              city
            }
          }
        }`
      })
    });
    
    console.log('Status Code:', response.status);
    console.log('Status Text:', response.statusText);
    
    const headers = {};
    response.headers.forEach((value, name) => {
      headers[name] = value;
    });
    console.log('Response Headers:', JSON.stringify(headers, null, 2));
    
    const text = await response.text();
    console.log('Response Body:', text.substring(0, 1000));
  } catch (err) {
    console.error('Fetch error:', err.message);
  }
}

testWorker();
