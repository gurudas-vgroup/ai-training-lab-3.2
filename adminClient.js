// Load SHOPIFY_STORE_DOMAIN / SHOPIFY_APP_CLIENT_ID / SHOPIFY_APP_CLIENT_SECRET from .env
require("dotenv").config();

const domain = process.env.SHOPIFY_STORE_DOMAIN;
const clientId = process.env.SHOPIFY_APP_CLIENT_ID;
const clientSecret = process.env.SHOPIFY_APP_CLIENT_SECRET;

// In-memory token cache, shared across calls within this process
let cachedToken = null,
  cachedTokenExpiresAt = 0;

// Exchanges the app's client ID/secret for an Admin API access token,
// reusing the cached token until it's within 60s of expiry.
async function getAdminAccessToken() {
  // Serve from cache if it's still valid
  if (cachedToken && Date.now() < cachedTokenExpiresAt) return cachedToken;

  // OAuth client_credentials grant against the store's token endpoint
  const res = await fetch(`https://${domain}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "client_credentials",
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error("Token exchange failed: " + JSON.stringify(data));

  // Cache the token, expiring 60s early to avoid using a token that
  // goes stale mid-request
  cachedToken = data.access_token;
  cachedTokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000;
  return cachedToken;
}

// Runs a GraphQL query/mutation against the Admin API, fetching a fresh
// or cached access token as needed.
async function adminRequest(query, variables) {
  const token = await getAdminAccessToken();
  const res = await fetch(`https://${domain}/admin/api/2026-07/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data;
}

module.exports = { adminRequest };
