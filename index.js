// Standalone Cloudflare Worker (NOT part of the Pages project).
//
// Its only job: every minute, call GET /api/timers on your Home Automation
// site. That endpoint already contains the cleanup logic that turns off any
// Govee/Leviton device whose timer has expired — this Worker just makes
// sure that check happens on a schedule, even if nobody has the app open.
//
// CRON_SECRET: a shared secret that lets this Worker bypass the PIN
// middleware on the Home Automation site. Set it as an environment variable
// on BOTH this Worker AND the Home Automation Pages project (same value).
// Pick any random string, e.g. "cron-abc123xyz" — it never needs to be
// typed by a human, just copy-pasted into both Cloudflare secret fields.

const SITE_URL = "https://home-automation-88w.pages.dev/api/timers";

export default {
  async fetch(request) {
    return new Response("This worker only runs on a schedule. It has no web UI.");
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(pingTimers(env));
  },
};

async function pingTimers(env) {
  const headers = { "Content-Type": "application/json" };
  if (env.CRON_SECRET) {
    headers["x-cron-secret"] = env.CRON_SECRET;
  }
  try {
    const res = await fetch(SITE_URL, { method: "GET", headers });
    console.log("Cron ping to /api/timers:", res.status);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("Cron ping got non-OK response:", res.status, body.slice(0, 200));
    }
  } catch (err) {
    console.error("Cron ping failed:", err);
  }
}
