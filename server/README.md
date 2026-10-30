# Personal CBT sync API

Cloudflare Workers Free + one D1 database. Worker source contains no API credentials, PIN, salt/pepper values or personal progress. Runtime bindings: `DB` (D1) and `AUTH_PEPPER` (secret). Preserve the existing secret binding during future uploads (`type: inherit`, strict inheritance). Never rotate pepper while users exist without an explicit migration/reset plan.

Public API: POST /login `{username,pin,remember}`, GET /state, PUT /state `{baseVersion,data}`, POST /logout. POST/PUT require JSON. Bearer sessions are random256-bit; only SHA256 token digests are stored in D1. No public signup, admin, recovery or diagnostic endpoint. PINs are six-digit strings (leading zero preserved), salted PBKDF2-SHA256100000 after a secret HMAC pepper. Both username and hashed source-IP login counters limit attempts to5 per15 minutes. Browser origin is restricted to the deployed GitHub Pages account; CORS does not replace authentication.

Learning state is a version3 progress export, not question data or live quiz input. Server update is atomic compare-and-swap, returns409 on a stale base version. Max request body1MB, bounded nesting/item count and forbidden prototype keys. Responses use no-store. Data is not end-to-end encrypted; the Cloudflare account owner can administer D1.

Local checks: `node server/test_worker.mjs` (Node24 node:sqlite + WebCrypto), `node e2e_cloud.js` (jsdom with a mock network). These differ from physical phone testing. Actual Workers/D1 integration was tested in a real browser with temporary synthetic accounts: login, two sessions, save/read, account isolation,409, invalid payload, logout401, rate limiting. Test-only routes/accounts/sessions/records were removed afterward; personal learning data was not used.

Account bootstrap/deploy helpers remain in the owner's private workflow library; never commit environment values or personal saves. No paid plan/billing/domain changes are made by this implementation. Back up D1 through the Cloudflare dashboard as appropriate; the app also retains local and manual JSON backups. A short PIN is convenience authentication, not appropriate protection for high-sensitivity data.
