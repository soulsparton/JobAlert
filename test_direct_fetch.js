async function main() {
  console.log('Making direct fetch request to Amazon Hiring GraphQL endpoint...');
  
  const payload = {
    "operationName": "searchJobCardsByLocation",
    "variables": {
      "searchJobRequest": {
        "locale": "en-CA",
        "country": "Canada",
        "pageSize": 100,
        "sorters": [
          {
            "fieldName": "totalPayRateMax",
            "ascending": "false"
          }
        ],
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
    console.log('Response Headers:', Object.fromEntries(response.headers.entries()));
    
    const text = await response.text();
    console.log(`Response Body (first 1000 chars):\n${text.substring(0, 1000)}`);
  } catch (error) {
    console.error('Fetch Error:', error);
  }
}

main();
