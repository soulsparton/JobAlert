require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// ==========================================
// CONFIGURATION (Loaded from Environment)
// ==========================================
const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS, 10) || 30000;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

// TARGET SCANS SPECIFIC TO ONTARIO DEMANDS (100km covers entire regions comprehensively)
const SCAN_LOCATIONS = [
  { name: 'Brampton (GTA)', lat: 43.7315, lng: -79.7624, radius: 100 },
  { name: 'Ottawa', lat: 45.4215, lng: -75.6972, radius: 100 }
];


// Cloudflare Workers Proxy Gateway URL (Fallback to direct querying if empty)
const PROXY_URL = process.env.PROXY_URL || 'https://hiring.amazon.ca/graphql';


// ==========================================
// INITIALIZE SUPABASE
// ==========================================
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('[CRITICAL] Missing SUPABASE_URL or SUPABASE_KEY in .env file!');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
let seenJobs = new Set();

// Fetch previously recorded job IDs from Supabase to prevent duplicate alerts on restarts
async function loadSeenJobsFromSupabase() {
  console.log('[SYSTEM] Connecting to Supabase and loading tracked jobs...');
  try {
    const { data, error } = await supabase
      .from('amazon_jobs')
      .select('id');

    if (error) {
      throw error;
    }

    if (data) {
      seenJobs = new Set(data.map(j => j.id));
      console.log(`[SYSTEM] Successfully loaded ${seenJobs.size} previously tracked job IDs from Supabase.`);
    }
  } catch (err) {
    console.error('[SYSTEM] Error loading jobs from Supabase. Ensure table "amazon_jobs" exists in your DB.', err.message);
  }
}

// ==========================================
// NOTIFICATION CHANNELS (Using Native Fetch)
// ==========================================
async function sendAlert(job) {
  console.log(`\n🚨 [ALERT] NEW JOB POSTING FOUND: ${job.title} at ${job.location_name} ($${job.pay_rate_min}-$${job.pay_rate_max}/hr)`);

  const jobUrl = `https://hiring.amazon.ca/app#/jobDetail?jobId=${job.id}`;

  // 1. TELEGRAM ALERT
  if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
    const telegramMessage = `🚨 *NEW AMAZON CANADA JOB!*\n\n` +
      `*Position:* ${job.title}\n` +
      `*Location:* ${job.location_name} (${job.city}, ${job.state})\n` +
      `*Pay Rate:* $${job.pay_rate_min.toFixed(2)} - $${job.pay_rate_max.toFixed(2)}/hr\n` +
      `*Shifts Available:* ${job.schedule_count}\n\n` +
      `[Apply to Job Now](${jobUrl})`;

    const telegramUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

    try {
      const response = await fetch(telegramUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          chat_id: TELEGRAM_CHAT_ID,
          text: telegramMessage,
          parse_mode: 'Markdown',
          disable_web_page_preview: true
        })
      });
      if (response.ok) {
        console.log('  [ALERT] Telegram notification sent successfully.');
      } else {
        console.error(`  [ERROR] Telegram API failed: ${response.status} ${response.statusText}`);
      }
    } catch (err) {
      console.error('  [ERROR] Failed to send Telegram alert:', err.message);
    }
  }

  // 2. DISCORD ALERT (OPTIONAL)
  if (DISCORD_WEBHOOK_URL) {
    const discordPayload = {
      embeds: [{
        title: `🚨 NEW AMAZON CANADA JOB POSTED!`,
        description: `**${job.title}** is now available in Ontario!`,
        url: jobUrl,
        color: 16753920,
        fields: [
          { name: "Location", value: `${job.location_name} (${job.city}, ${job.state})`, inline: true },
          { name: "Pay Rate", value: `$${job.pay_rate_min.toFixed(2)} - $${job.pay_rate_max.toFixed(2)}/hr`, inline: true },
          { name: "Available Shifts", value: `${job.schedule_count}`, inline: true }
        ],
        footer: { text: "Amazon Ontario Job Monitor" },
        timestamp: new Date().toISOString()
      }]
    };

    try {
      const response = await fetch(DISCORD_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(discordPayload)
      });
      if (response.ok) {
        console.log('  [ALERT] Discord notification sent successfully.');
      } else {
        console.error(`  [ERROR] Discord webhook failed: ${response.status} ${response.statusText}`);
      }
    } catch (err) {
      console.error('  [ERROR] Failed to send Discord alert:', err.message);
    }
  }
}

// ==========================================
// SYSTEM ALERTS (Sends warning if API fails/changes)
// ==========================================
let lastSystemAlertTime = 0;
const SYSTEM_ALERT_COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes cooldown to avoid spamming

async function sendSystemAlert(errorMsg) {
  const now = Date.now();
  if (now - lastSystemAlertTime < SYSTEM_ALERT_COOLDOWN_MS) {
    return; // Skip sending to avoid spamming
  }
  lastSystemAlertTime = now;

  console.error(`\n⚠️ [SYSTEM ERROR ALERT]: ${errorMsg}`);

  // 1. TELEGRAM ERROR ALERT
  if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
    const telegramMessage = `⚠️ *AMAZON MONITOR CRITICAL ALERT*\n\n` +
      `The job monitor has encountered a critical query or connection error. Amazon may have updated their API structure or the proxy is down.\n\n` +
      `*Error Details:* \`${errorMsg}\`\n\n` +
      `_Action Required: Check the server logs and verify if Amazon changed its GraphQL endpoint or HAR structure._`;

    const telegramUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    try {
      await fetch(telegramUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          chat_id: TELEGRAM_CHAT_ID,
          text: telegramMessage,
          parse_mode: 'Markdown'
        })
      });
    } catch (err) {
      console.error('Failed to send Telegram system alert:', err.message);
    }
  }

  // 2. DISCORD ERROR ALERT
  if (DISCORD_WEBHOOK_URL) {
    const discordPayload = {
      embeds: [{
        title: `⚠️ AMAZON MONITOR CRITICAL ALERT`,
        description: `The job monitor has encountered a critical error. Amazon may have updated their API or the proxy is down.`,
        color: 16711680, // Red
        fields: [
          { name: "Error Message", value: `\`\`\`${errorMsg}\`\`\``, inline: false }
        ],
        timestamp: new Date().toISOString()
      }]
    };
    try {
      await fetch(DISCORD_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(discordPayload)
      });
    } catch (err) {
      console.error('Failed to send Discord system alert:', err.message);
    }
  }
}


// ==========================================
// HELPER: FETCH ACTIVE JOBS BY LOCATION
// ==========================================
async function fetchJobsForLocation(location) {
  const payload = {
    operationName: "searchJobCardsByLocation",
    variables: {
      searchJobRequest: {
        locale: "en-CA",
        country: "Canada",
        pageSize: 100,
        geoQueryClause: {
          lat: location.lat,
          lng: location.lng,
          unit: "km",
          distance: location.radius
        }
      }
    },
    query: `query searchJobCardsByLocation($searchJobRequest: SearchJobRequest!) {
      searchJobCardsByLocation(searchJobRequest: $searchJobRequest) {
        jobCards {
          jobId
          jobTitle
          city
          state
          postalCode
          locationName
          totalPayRateMin
          totalPayRateMax
          scheduleCount
          employmentTypeL10N
        }
      }
    }`
  };

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

  const response = await fetch(PROXY_URL, {
    method: 'POST',
    headers: headers,
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`HTTP Error ${response.status} ${response.statusText}`);
  }

  const resJson = await response.json();
  return resJson.data?.searchJobCardsByLocation?.jobCards || [];
}

// ==========================================
// CORE MONITORING DAEMON (Deduplicated Multi-Region)
// ==========================================
async function monitorJobs() {
  try {
    // Run Brampton and Ottawa queries in parallel
    const scanPromises = SCAN_LOCATIONS.map(async (loc) => {
      try {
        const jobs = await fetchJobsForLocation(loc);
        console.log(`[${new Date().toLocaleTimeString()}] Scanned ${loc.name}. Found ${jobs.length} active jobs.`);
        return jobs;
      } catch (err) {
        console.error(`[ERROR] Failed to scan ${loc.name}:`, err.message);
        await sendSystemAlert(`Failed to scan ${loc.name}: ${err.message}`);
        return [];
      }
    });

    const results = await Promise.all(scanPromises);

    // Merge all jobs from all active scans
    const rawJobCards = results.flat();

    // Deduplicate by jobId to handle potential geographic overlaps
    const jobCardsMap = new Map();
    for (const job of rawJobCards) {
      jobCardsMap.set(job.jobId, job);
    }
    const jobCards = Array.from(jobCardsMap.values());

    console.log(`[${new Date().toLocaleTimeString()}] Total unique active jobs across Brampton & Ottawa: ${jobCards.length}`);

    // Process all active jobs returned from the server
    for (const job of jobCards) {
      const isNew = !seenJobs.has(job.jobId);

      if (isNew) {
        seenJobs.add(job.jobId);

        // Define the row payload (Perfect mapping of all Amazon fields)
        const newJobRow = {
          id: job.jobId,
          title: job.jobTitle,
          location_name: job.locationName,
          city: job.city,
          state: job.state,
          postal_code: job.postalCode,
          employment_type: job.employmentTypeL10N,
          pay_rate_min: job.totalPayRateMin,
          pay_rate_max: job.totalPayRateMax,
          schedule_count: job.scheduleCount,
          status: 'active',
          last_seen_at: new Date().toISOString()
        };

        // Insert into Supabase
        const { error } = await supabase
          .from('amazon_jobs')
          .insert([newJobRow]);

        if (error) {
          console.error(`[SUPABASE ERROR] Failed to save job ${job.jobId}:`, error.message);
        } else {
          console.log(`[SUPABASE] Saved new job: ${job.jobId}`);
          // Trigger the Telegram alert
          await sendAlert(newJobRow);
        }
      } else {
        // If it already exists, update its status back to 'active' and refresh details
        await supabase
          .from('amazon_jobs')
          .update({
            status: 'active',
            last_seen_at: new Date().toISOString(),
            schedule_count: job.scheduleCount,
            pay_rate_min: job.totalPayRateMin,
            pay_rate_max: job.totalPayRateMax,
            employment_type: job.employmentTypeL10N,
            postal_code: job.postalCode
          })
          .eq('id', job.jobId);
      }
    }

    // Check for "filled" jobs:
    const activeJobIds = jobCards.map(j => j.jobId);

    // Fetch all active job records currently inside Supabase
    const { data: dbActiveJobs, error: dbError } = await supabase
      .from('amazon_jobs')
      .select('id, title')
      .eq('status', 'active');

    if (!dbError && dbActiveJobs) {
      for (const dbJob of dbActiveJobs) {
        if (!activeJobIds.includes(dbJob.id)) {
          // Job has disappeared from both target regions -> Mark as filled!
          const { error: patchError } = await supabase
            .from('amazon_jobs')
            .update({
              status: 'filled',
              filled_at: new Date().toISOString()
            })
            .eq('id', dbJob.id);

          if (!patchError) {
            console.log(`[SYSTEM] Job ${dbJob.id} (${dbJob.title}) is now FILLED.`);
          }
        }
      }
    }

  } catch (error) {
    console.error(`[${new Date().toLocaleTimeString()}] Query Error:`, error.message);
    await sendSystemAlert(`Global Query Error: ${error.message}`);
  }
}


// ==========================================
// START THE MONITOR SERVICE & PORT BINDER
// ==========================================
async function start() {
  console.log('==========================================');
  console.log('  AMAZON CANADA JOB MONITOR (SUPABASE PRO) ');
  console.log('==========================================');

  // Wait to load seen job list from Supabase
  await loadSeenJobsFromSupabase();

  // Run once immediately
  monitorJobs();

  // Poll at the specified interval
  setInterval(monitorJobs, POLL_INTERVAL_MS);

  // Bind to HTTP port (Required for Render to deploy successfully)
  const http = require('http');
  const PORT = process.env.PORT || 8080;

  http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Amazon Canada Job Monitor is running live!');
  }).listen(PORT, () => {
    console.log(`[RENDER] Port binder active on port ${PORT}. Ready for cloud scaling.`);
  });
}

start();

