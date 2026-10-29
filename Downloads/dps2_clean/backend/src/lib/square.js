const { Client, Environment } = require("square");

function getSquareClient() {
  return new Client({
    accessToken: process.env.SQUARE_ACCESS_TOKEN,
    environment:
      process.env.SQUARE_ENVIRONMENT === "production"
        ? Environment.Production
        : Environment.Sandbox,
  });
}

// Square rejects charges when the location isn't configured; surface that clearly.
function squareLocationId() {
  const id = process.env.SQUARE_LOCATION_ID;
  return id && id !== "PASTE_LOCATION_ID_HERE" ? id : null;
}

module.exports = { getSquareClient, squareLocationId };
