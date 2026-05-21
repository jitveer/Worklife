const axios = require("axios");

// In-memory cache for coordinates to prevent redundant/excessive API hits
const addressCache = new Map();

async function reverseGeocode(latitude, longitude) {
  if (!latitude || !longitude) {
    return "Location not available";
  }

  // Round coordinates to 4 decimal places (~11 meters grid precision)
  const cacheKey = `${parseFloat(latitude).toFixed(4)}_${parseFloat(longitude).toFixed(4)}`;

  if (addressCache.has(cacheKey)) {
    console.log(`[Geocode Cache Hit] Serving address from memory for key: ${cacheKey}`);
    return addressCache.get(cacheKey);
  }

  try {
    const response = await axios.get(
      "https://nominatim.openstreetmap.org/reverse",
      {
        params: {
          format: "json",
          lat: latitude,
          lon: longitude,
          zoom: 18,
          addressdetails: 1
        },
        headers: {
          "User-Agent": "Worklife-Attendance-System"
        },
        timeout: 3000 // 3 seconds strict timeout to prevent hanging the server
      }
    );

    const address = response.data && response.data.display_name
      ? response.data.display_name
      : "Location not available";

    // Store in cache
    addressCache.set(cacheKey, address);

    return address;
  } catch (error) {
    console.error("OSM error:", error.message);
    return "Location not available";
  }
}

module.exports = reverseGeocode;
