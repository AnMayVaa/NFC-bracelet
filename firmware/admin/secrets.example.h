// Copy this file to secrets.h (same folder) and fill in your values.
// secrets.h is in .gitignore, so your Wi-Fi password never goes to GitHub.
#pragma once

// Networks tried at boot (the one you used last goes first; more can be added
// from the Serial Monitor with "scan" / "join", or the phone setup page).
#define WIFI_SSID_LIST { "YOUR_WIFI_1", "YOUR_WIFI_2" }
#define WIFI_PASSWORD  "YOUR_PASSWORD"            // same password for all networks above

// Server (no trailing slash). For a laptop on the same hotspot use e.g. "http://192.168.1.50:3000"
#define SERVER_URL     "https://smart-nfc-bracelet.vercel.app"

// Leave empty unless STATION_KEY is set on the server
#define STATION_KEY    ""
