// Standalone Cloudflare Worker (NOT part of the Pages project).
//
// Its only job: every minute, call GET /api/timers on your Home Automation
// site, which runs the timer-cleanup / auto-off logic.

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
  // Diagnostic: report whether this Worker can see its own CRON_SECRET.
  const secret = env.CRON_SECRET;
  console.log(
    "CRON_SECRET present:", secret !== undefined && secret !== null,
    "length:", typeof secret === "string" ? secret.length : "n/a"
  );

  const headers = { "Content-Type": "application/json" };
  if (secret) {
    headers["x-cron-secret"] = secret;
  }
  try {
    const res = await fetch(SITE_URL, { method: "GET", headers });
    console.log("Cron ping to /api/timers:", res.status);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("Cron ping got non-OK response:", res.status, body.slice(0, 120));
    }
  } catch (err) {
    console.error("Cron ping failed:", err);
  }
}
