require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// ==========================================
// CONFIGURATION (Loaded from Environment)
// ==========================================
const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS, 10) || 30000;
const HEARTBEAT_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

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
let isPolling = false; // Prevent concurrent poll cycles


// ==========================================
// HELPERS
// ==========================================
function indianTime() {
  return new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
}

// Fetch previously recorded job IDs from Supabase to prevent duplicate alerts on restarts
async function loadSeenJobsFromSupabase() {
  console.log('[SYSTEM] Connecting to Supabase and loading tracked jobs...');
  try {
    const { data, error } = await supabase
      .from('amazon_jobs')
      .select('id');

    if (error) throw error;

    if (data) {
      seenJobs = new Set(data.map(j => j.id));
      console.log(`[SYSTEM] Loaded ${seenJobs.size} previously tracked job IDs from Supabase.`);
    }
  } catch (err) {
    console.error('[SYSTEM] Error loading jobs from Supabase:', err.message);
  }
}

// Writes one row to monitor_heartbeat table every 24h to prevent Supabase free tier pause
async function pingSupabaseHeartbeat() {
  try {
    const { error } = await supabase
      .from('monitor_heartbeat')
      .upsert({ id: 1, last_ping_at: new Date().toISOString() }, { onConflict: 'id' });

    if (error) {
      console.error('[HEARTBEAT] Failed to ping Supabase:', error.message);
    } else {
      console.log(`[HEARTBEAT] Supabase keep-alive ping sent at ${indianTime()}`);
    }
  } catch (err) {
    console.error('[HEARTBEAT] Unexpected error:', err.message);
  }
}


// ==========================================
// NOTIFICATION CHANNELS (Using Native Fetch)
// ==========================================
async function sendAlert(job) {
  const jobUrl = `https://hiring.amazon.ca/app#/jobDetail?jobId=${job.id}`;
  console.log(`\n🚨 [ALERT] NEW JOB FOUND: ${job.title} at ${job.location_name} ($${job.pay_rate_min}-$${job.pay_rate_max}/hr)`);

  // 1. TELEGRAM ALERT
  if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
    const telegramMessage = `🚨 *NEW AMAZON CANADA JOB!*\n\n` +
      `*Position:* ${job.title}\n` +
      `*Location:* ${job.location_name} (${job.city}, ${job.state})\n` +
      `*Pay Rate:* $${job.pay_rate_min.toFixed(2)} - $${job.pay_rate_max.toFixed(2)}/hr\n` +
      `*Shifts Available:* ${job.schedule_count}\n\n` +
      `[Apply to Job Now](${jobUrl})`;

    try {
      const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
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
      if (!response.ok) {
        console.error(`  [ERROR] Discord webhook failed: ${response.status} ${response.statusText}`);
      }
    } catch (err) {
      console.error('  [ERROR] Failed to send Discord alert:', err.message);
    }
  }
}

// ==========================================
// SYSTEM ALERTS
// ==========================================
let lastSystemAlertTime = 0;
const SYSTEM_ALERT_COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes cooldown

async function sendSystemAlert(errorMsg) {
  const now = Date.now();
  if (now - lastSystemAlertTime < SYSTEM_ALERT_COOLDOWN_MS) return;
  lastSystemAlertTime = now;

  console.error(`\n⚠️ [SYSTEM ERROR ALERT]: ${errorMsg}`);

  if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
    try {
      await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          chat_id: TELEGRAM_CHAT_ID,
          text: `⚠️ *AMAZON MONITOR CRITICAL ALERT*\n\n` +
            `The monitor has encountered an error.\n\n` +
            `*Error:* \`${errorMsg}\`\n\n` +
            `_Action Required: Check the server logs._`,
          parse_mode: 'Markdown'
        })
      });
    } catch (err) {
      console.error('Failed to send Telegram system alert:', err.message);
    }
  }

  if (DISCORD_WEBHOOK_URL) {
    try {
      await fetch(DISCORD_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          embeds: [{
            title: `⚠️ AMAZON MONITOR CRITICAL ALERT`,
            description: `The monitor has encountered a critical error.`,
            color: 16711680,
            fields: [{ name: "Error Message", value: `\`\`\`${errorMsg}\`\`\``, inline: false }],
            timestamp: new Date().toISOString()
          }]
        })
      });
    } catch (err) {
      console.error('Failed to send Discord system alert:', err.message);
    }
  }
}


// ==========================================
// HELPER: FETCH ACTIVE JOBS BY LOCATION
// ==========================================
async function fetchJobsForLocation(location, signal) {
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
    headers,
    body: JSON.stringify(payload),
    signal // abort signal for timeout
  });

  if (!response.ok) {
    throw new Error(`HTTP Error ${response.status} ${response.statusText}`);
  }

  const resJson = await response.json();
  return resJson.data?.searchJobCardsByLocation?.jobCards || [];
}


// ==========================================
// CORE MONITORING DAEMON
// ==========================================
async function monitorJobs() {
  // Prevent concurrent poll cycles (if previous poll is still running, skip)
  if (isPolling) {
    console.log(`[${indianTime()}] Previous poll still running, skipping this cycle.`);
    return;
  }
  isPolling = true;

  // Hard timeout: abort all fetches after 25 seconds
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);

  try {
    // 1. Run Brampton and Ottawa queries in parallel
    const scanPromises = SCAN_LOCATIONS.map(async (loc) => {
      try {
        const jobs = await fetchJobsForLocation(loc, controller.signal);
        console.log(`[${indianTime()}] Scanned ${loc.name}. Found ${jobs.length} active jobs.`);
        return jobs;
      } catch (err) {
        console.error(`[ERROR] Failed to scan ${loc.name}:`, err.message);
        await sendSystemAlert(`Failed to scan ${loc.name}: ${err.message}`);
        return [];
      }
    });

    const results = await Promise.all(scanPromises);
    clearTimeout(timeout);

    // 2. Deduplicate by jobId (Brampton 100km and Ottawa 100km may overlap)
    const jobMap = new Map(results.flat().map(j => [j.jobId, j]));
    const jobCards = Array.from(jobMap.values());

    console.log(`[${indianTime()}] Total unique active jobs across Brampton & Ottawa: ${jobCards.length}`);

    // 3. Find genuinely new jobs
    const newJobs = jobCards.filter(job => !seenJobs.has(job.jobId));

    // 4. ALERT FIRST — do not wait for DB success to notify client
    for (const job of newJobs) {
      seenJobs.add(job.jobId); // Mark as seen immediately
      const alertPayload = {
        id: job.jobId,
        title: job.jobTitle,
        location_name: job.locationName,
        city: job.city,
        state: job.state,
        pay_rate_min: job.totalPayRateMin,
        pay_rate_max: job.totalPayRateMax,
        schedule_count: job.scheduleCount
      };
      await sendAlert(alertPayload);
    }

    // 5. Batch upsert ALL seen jobs in ONE DB call (not N individual writes)
    if (jobCards.length > 0) {
      const rows = jobCards.map(job => ({
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
        last_seen_at: new Date().toISOString()
      }));

      const { error } = await supabase
        .from('amazon_jobs')
        .upsert(rows, { onConflict: 'id' });

      if (error) {
        console.error('[SUPABASE ERROR] Batch upsert failed:', error.message);
      } else if (newJobs.length > 0) {
        console.log(`[SUPABASE] Saved ${newJobs.length} new job(s).`);
      }
    }

  } catch (error) {
    clearTimeout(timeout);
    console.error(`[${indianTime()}] Query Error:`, error.message);
    await sendSystemAlert(`Global Query Error: ${error.message}`);
  } finally {
    isPolling = false;
  }
}


// ==========================================
// START THE MONITOR SERVICE & PORT BINDER
// ==========================================
const http = require('http');
const PORT = process.env.PORT || 8080;

async function start() {
  console.log('==========================================');
  console.log('  AMAZON CANADA JOB MONITOR (SUPABASE PRO) ');
  console.log('==========================================');

  // Load seen jobs from Supabase on startup
  await loadSeenJobsFromSupabase();

  // Run first poll immediately
  await monitorJobs();

  // Poll at the specified interval
  setInterval(monitorJobs, POLL_INTERVAL_MS);

  // Heartbeat: ping Supabase once every 24h to prevent free tier project pause
  await pingSupabaseHeartbeat();
  setInterval(pingSupabaseHeartbeat, HEARTBEAT_INTERVAL_MS);

  // Bind to HTTP port (Required for Render to deploy successfully)
  http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Amazon Canada Job Monitor is running live!');
  }).listen(PORT, () => {
    console.log(`[RENDER] Port binder active on port ${PORT}.`);
  });
}

start();
