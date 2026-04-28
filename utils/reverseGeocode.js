const axios = require("axios");

async function reverseGeocode(latitude, longitude) {
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
        }
      }
    );

    return response.data.display_name;
  } catch (error) {
    console.error("OSM error:", error.message);
    return "Location not available";
  }
}

module.exports = reverseGeocode;
