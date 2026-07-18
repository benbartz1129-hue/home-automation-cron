// /functions/_middleware.js
//
// Gates the ENTIRE site (including /api/* routes and index.html) behind a
// simple 4-digit PIN. This runs before every request.
//
// How it works:
// - If the request has a valid "ha_pin_ok" cookie, let it through.
// - Otherwise, if it's a POST to /_pin_check with the correct PIN, set the
//   cookie and redirect to the homepage.
// - Otherwise, serve a small PIN-entry page instead of the real site.
//
// The PIN itself lives in an environment variable / secret called HA_PIN
// (set this in Cloudflare dashboard -> Settings -> Environment variables).
// It is NEVER hardcoded here, so it's not visible in your GitHub repo.

const COOKIE_NAME = "ha_pin_ok";
const COOKIE_MAX_AGE_DAYS = 30;

function pinPageHtml(error) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="default" />
<meta name="apple-mobile-web-app-title" content="Bartz" />
<title>Bartz — Enter PIN</title>
<link rel="apple-touch-icon" sizes="180x180" href="/icons/apple-touch-icon.png" />
<link rel="apple-touch-icon" sizes="152x152" href="/icons/apple-touch-icon-152.png" />
<link rel="apple-touch-icon" sizes="120x120" href="/icons/apple-touch-icon-120.png" />
<link rel="icon" type="image/png" sizes="192x192" href="/icons/icon-192.png" />
<link rel="icon" type="image/png" sizes="512x512" href="/icons/icon-512.png" />
<link rel="icon" type="image/png" sizes="32x32" href="/icons/favicon-32.png" />
<link rel="icon" type="image/png" sizes="16x16" href="/icons/favicon-16.png" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: #f5f5f3;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
  }
  @media (prefers-color-scheme: dark) {
    body { background: #111110; }
    .card { background: #1c1c1a !important; }
    h1 { color: #f0eeea !important; }
    p { color: #a0a09a !important; }
  }
  .card {
    background: #ffffff;
    border-radius: 16px;
    padding: 2rem 1.75rem;
    max-width: 320px;
    width: 100%;
    text-align: center;
    box-shadow: 0 4px 24px rgba(0,0,0,0.08);
  }
  .icon { font-size: 32px; margin-bottom: 8px; }
  h1 { font-size: 18px; font-weight: 600; color: #1a1a1a; margin-bottom: 4px; }
  p { font-size: 13px; color: #5a5a5a; margin-bottom: 1.5rem; }
  .pin-inputs { display: flex; gap: 10px; justify-content: center; margin-bottom: 1.25rem; }
  .pin-inputs input {
    width: 48px; height: 56px;
    text-align: center;
    font-size: 24px;
    font-weight: 600;
    border: 1.5px solid rgba(0,0,0,0.15);
    border-radius: 10px;
    outline: none;
    background: #f0efed;
    color: #1a1a1a;
  }
  .pin-inputs input:focus { border-color: #1D9E75; }
  .error { color: #A32D2D; font-size: 13px; margin-bottom: 12px; min-height: 16px; }
  button {
    width: 100%;
    padding: 12px;
    background: #1D9E75;
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
  }
  button:active { background: #0F6E56; }
</style>
</head>
<body>
  <form class="card" method="POST" action="/_pin_check" id="pin-form">
    <div class="icon">🔒</div>
    <h1>Home Lights</h1>
    <p>Enter the 4-digit code to continue</p>
    <div class="error">${error ? "Incorrect code — try again" : ""}</div>
    <div class="pin-inputs">
      <input type="tel" inputmode="numeric" maxlength="1" pattern="[0-9]*" required autofocus />
      <input type="tel" inputmode="numeric" maxlength="1" pattern="[0-9]*" required />
      <input type="tel" inputmode="numeric" maxlength="1" pattern="[0-9]*" required />
      <input type="tel" inputmode="numeric" maxlength="1" pattern="[0-9]*" required />
    </div>
    <input type="hidden" name="pin" id="pin-hidden" />
    <button type="submit">Unlock</button>
  </form>
  <script>
    const inputs = document.querySelectorAll('.pin-inputs input');
    const hidden = document.getElementById('pin-hidden');
    const form = document.getElementById('pin-form');

    inputs.forEach((input, idx) => {
      input.addEventListener('input', () => {
        input.value = input.value.replace(/[^0-9]/g, '');
        if (input.value && idx < inputs.length - 1) inputs[idx + 1].focus();
        updateHidden();
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !input.value && idx > 0) inputs[idx - 1].focus();
      });
    });

    function updateHidden() {
      hidden.value = Array.from(inputs).map(i => i.value).join('');
    }

    form.addEventListener('submit', (e) => {
      updateHidden();
      if (hidden.value.length !== 4) e.preventDefault();
    });
  </script>
</body>
</html>`;
}

async function hashPin(pin, secret) {
  const enc = new TextEncoder();
  const data = enc.encode(pin + ":" + secret);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function getCookie(request, name) {
  const cookieHeader = request.headers.get("Cookie") || "";
  const match = cookieHeader.match(new RegExp(`${name}=([^;]+)`));
  return match ? match[1] : null;
}

export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);

  // Always allow icon/static assets through, no PIN required. These are
  // just generic image files (not app data or controls), and Safari's
  // "Add to Home Screen" feature fetches them in the background without
  // necessarily carrying your PIN cookie — if these were blocked, the
  // home screen icon would silently fail and iOS would fall back to a
  // plain letter icon instead.
  if (url.pathname.startsWith("/icons/")) {
    return next();
  }

  // Allow the cron Worker to ping /api/timers without the PIN cookie.
  // It authenticates with a shared secret header instead (CRON_SECRET),
  // so random people hitting this URL directly still can't trigger cleanup
  // without knowing that token. If CRON_SECRET isn't configured, this
  // bypass is disabled entirely and the cron ping will just hit the PIN wall
  // (harmless, but auto-off won't work — configure CRON_SECRET to fix it).
  if (
    url.pathname === "/api/timers" &&
    env.CRON_SECRET &&
    request.headers.get("x-cron-secret") === env.CRON_SECRET
  ) {
    return next();
  }

  // If the PIN isn't configured, fail safe by blocking everything with a
  // clear message, rather than silently leaving the site open.
  if (!env.HA_PIN) {
    return new Response(
      "Site is not yet configured: HA_PIN environment variable is missing. Set it in Cloudflare Settings > Environment variables.",
      { status: 500 }
    );
  }

  const expectedHash = await hashPin(env.HA_PIN, env.HA_PIN_SALT || "home-automation-salt");

  // Handle the PIN submission.
  if (url.pathname === "/_pin_check" && request.method === "POST") {
    const form = await request.formData();
    const submitted = (form.get("pin") || "").toString();
    if (submitted === env.HA_PIN) {
      const headers = new Headers();
      headers.set("Location", "/");
      headers.append(
        "Set-Cookie",
        `${COOKIE_NAME}=${expectedHash}; Max-Age=${COOKIE_MAX_AGE_DAYS * 86400}; Path=/; HttpOnly; Secure; SameSite=Lax`
      );
      return new Response(null, { status: 302, headers });
    }
    return new Response(pinPageHtml(true), {
      status: 401,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  // Check existing cookie.
  const cookieVal = getCookie(request, COOKIE_NAME);
  if (cookieVal === expectedHash) {
    return next();
  }

  // Not authenticated — show the PIN page instead of the real site.
  return new Response(pinPageHtml(false), {
    status: 401,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
