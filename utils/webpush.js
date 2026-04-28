const webpush = require("web-push");

const PUBLIC_KEY = "BGweiEJgmCAxdWu5ulUvEd4jF8V6PPW2gyV2x1qV4YhczD5s_nhlgkvzlyamv8Fm4yTMBjNQOCO75RXYRsWte-s";
const PRIVATE_KEY = "biTm9SFkITD5pywlaRaAff6ZFl3aVL8HiZOc8UZ1ylw";

webpush.setVapidDetails(
  "mailto:your-email@gmail.com",
  PUBLIC_KEY,
  PRIVATE_KEY
);

module.exports = webpush;