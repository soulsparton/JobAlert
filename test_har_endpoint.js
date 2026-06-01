async function main() {
  console.log('Querying Amazon Canada hiring GraphQL endpoint with exact HAR coordinates...');
  
  // Coordinates from the HAR file for Ontario ("ON, CAN"): lat: 50.926163435, lng: -84.74493
  // Or Toronto ("Toronto, ON, CAN"): lat: 43.6532, lng: -79.3832 (let's use Toronto area for a better test!)
  const payload = {
    "operationName": "searchJobCardsByLocation",
    "variables": {
      "searchJobRequest": {
        "locale": "en-CA",
        "country": "Canada",
        "pageSize": 100,
        "geoQueryClause": {
          "lat": 43.6532,
          "lng": -79.3832,
          "unit": "km",
          "distance": 100
        },
        "dateFilters": [
          {
            "key": "firstDayOnSite",
            "range": {
              "startDate": new Date().toISOString().split('T')[0]
            }
          }
        ]
      }
    },
    "query": "query searchJobCardsByLocation($searchJobRequest: SearchJobRequest!) {\n  searchJobCardsByLocation(searchJobRequest: $searchJobRequest) {\n    nextToken\n    jobCards {\n      jobId\n      language\n      dataSource\n      requisitionType\n      jobTitle\n      jobType\n      employmentType\n      city\n      state\n      postalCode\n      locationName\n      totalPayRateMin\n      totalPayRateMax\n      tagLine\n      bannerText\n      image\n      jobPreviewVideo\n      distance\n      featuredJob\n      bonusJob\n      bonusPay\n      scheduleCount\n      currencyCode\n      geoClusterDescription\n      surgePay\n      jobTypeL10N\n      employmentTypeL10N\n      bonusPayL10N\n      surgePayL10N\n      totalPayRateMinL10N\n      totalPayRateMaxL10N\n      distanceL10N\n      monthlyBasePayMin\n      monthlyBasePayMinL10N\n      monthlyBasePayMax\n      monthlyBasePayMaxL10N\n      jobContainerJobMetaL1\n      virtualLocation\n      poolingEnabled\n      payFrequency\n      jobLocationType\n      internalStaffingOrgId\n      agencyName\n      advertisedBasePay\n      advertisedBasePayL10N\n      advertisedPayFrequency\n      advertisedPayFrequencyL10N\n      __typename\n    }\n    __typename\n  }\n}\n"
  };

  const headers = {
    'accept': '*/*',
    'accept-language': 'en-US,en;q=0.9',
    'content-type': 'application/json',
    'country': 'Canada',
    'iscanary': 'false',
    'authorization': 'Bearer Status|unauthenticated|Session|',
    'referer': 'https://hiring.amazon.ca/app',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  };

  try {
    const response = await fetch('https://hiring.amazon.ca/graphql', {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(payload)
    });
    
    console.log(`Response Status: ${response.status} ${response.statusText}`);
    const resBody = await response.json();
    
    const jobs = resBody.data?.searchJobCardsByLocation?.jobCards || [];
    console.log(`Successfully fetched ${jobs.length} jobs near Toronto, Ontario!`);
    
    if (jobs.length > 0) {
      jobs.forEach(job => {
        console.log(`-> [${job.jobId}] ${job.jobTitle} at ${job.locationName} (${job.city}, ${job.state}) | Pay: $${job.totalPayRateMin}-$${job.totalPayRateMax} | Schedules: ${job.scheduleCount}`);
      });
    } else {
      console.log('No jobs are currently active in this coordinate range on the server.');
    }
  } catch (error) {
    console.error('Fetch Error:', error);
  }
}

main();
