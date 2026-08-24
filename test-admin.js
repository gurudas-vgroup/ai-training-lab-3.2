const { adminRequest } = require("./adminClient");

// Smoke test: confirms the token exchange and Admin API call both work
// by fetching basic shop info.
adminRequest(`query { shop { name email } }`)
  .then((data) => console.log(JSON.stringify(data, null, 2)))
  .catch(console.error);
