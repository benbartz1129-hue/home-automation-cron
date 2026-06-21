// Standalone Cloudflare Worker (NOT part of the Pages project).
//
// Its only job: every minute, call GET /api/timers on your Home Automation
// site. That endpoint already contains the cleanup logic that turns off any
// Govee bulb whose timer has expired — this Worker just makes sure that
// check happens on a schedule, even if nobody has the app open.

const SITE_URL = "https://home-automation-88w.pages.dev/api/timers";

export default {
  async fetch(request) {
    // Not meant to serve web traffic, but respond simply if visited directly.
    return new Response("This worker only runs on a schedule. It has no web UI.");
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(pingTimers());
  },
};

async function pingTimers() {
  try {
    const res = await fetch(SITE_URL, { method: "GET" });
    console.log("Cron ping to /api/timers:", res.status);
  } catch (err) {
    console.error("Cron ping failed:", err);
  }
}
