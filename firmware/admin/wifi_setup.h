/*
  wifi_setup.h — Wi-Fi for every Jeju wish-band ESP32 (same file in each sketch folder)

  How it connects
    1. Networks it knows = the one you used last (saved in flash) first, then other
       saved ones, then everything in secrets.h (BUNDAOBUNTAI, OhmPatumwan, ...).
    2. It scans, and tries the known networks that are in range, last-used first.
    3. Whichever works is remembered, so next boot it goes straight back to it.
    4. If the Wi-Fi drops, it keeps retrying in the background (tag reading keeps working).

  Pick a network by hand
    Serial Monitor (115200, "Newline"):
      scan                      list networks in range
      join 3                    join network #3 from the list (uses a saved/secrets password)
      join 3 mypassword         join network #3 with this password
      join MyWifi,mypassword    join by name
      saved                     show remembered networks
      forget                    clear remembered networks (secrets.h ones stay)
      portal                    open the phone setup page
      wifi                      show connection status

    Phone setup page: hold the BOOT button while powering on, type "portal", or wait
    until no known network is found. Join the Wi-Fi "WishBand-<station>" (password
    wishband123) and open http://192.168.4.1 to pick a network.
*/
#pragma once
#include <WiFi.h>
#include <Preferences.h>
#include <WebServer.h>
#include <DNSServer.h>

namespace WifiSetup {

const int MAX_SAVED = 5;
const unsigned long CONNECT_TIMEOUT_MS = 9000;
const unsigned long RETRY_PAUSE_MS = 15000;
const unsigned long PORTAL_IDLE_MS = 5UL * 60 * 1000;   // portal closes after 5 min if unused
const char* PORTAL_PASSWORD = "wishband123";
const int BOOT_BUTTON = 0;

struct Net { String ssid; String pass; };

Preferences prefs;
Net saved[MAX_SAVED];
int savedCount = 0;
Net builtIn[8];
int builtInCount = 0;

String deviceName = "WishBand";
Net candidates[MAX_SAVED + 8];
int candidateCount = 0;
int candidateIdx = -1;

enum State { IDLE, SCANNING, CONNECTING, ONLINE, WAITING };
State state = IDLE;
unsigned long stateAt = 0;
bool wasOnline = false;

WebServer* server = nullptr;
DNSServer* dns = nullptr;
bool portalOn = false;
unsigned long portalTouchedAt = 0;
String portalMessage = "";

int lastScanCount = 0;
String lastScanSsid[30];
int lastScanRssi[30];
bool lastScanOpen[30];

// ------------------------------------------------------------ storage
void loadSaved() {
  prefs.begin("wifi", true);
  savedCount = min((int)prefs.getInt("count", 0), MAX_SAVED);
  for (int i = 0; i < savedCount; i++) {
    saved[i].ssid = prefs.getString(("s" + String(i)).c_str(), "");
    saved[i].pass = prefs.getString(("p" + String(i)).c_str(), "");
  }
  prefs.end();
}

void writeSaved() {
  prefs.begin("wifi", false);
  prefs.clear();
  prefs.putInt("count", savedCount);
  for (int i = 0; i < savedCount; i++) {
    prefs.putString(("s" + String(i)).c_str(), saved[i].ssid);
    prefs.putString(("p" + String(i)).c_str(), saved[i].pass);
  }
  prefs.end();
}

// Move/insert this network to the front (= most recently used).
void remember(const String& ssid, const String& pass) {
  int found = -1;
  for (int i = 0; i < savedCount; i++) if (saved[i].ssid == ssid) found = i;
  if (found == 0 && saved[0].pass == pass) return;
  int last = found >= 0 ? found : min(savedCount, MAX_SAVED - 1);
  for (int i = last; i > 0; i--) saved[i] = saved[i - 1];
  saved[0] = { ssid, pass };
  if (found < 0 && savedCount < MAX_SAVED) savedCount++;
  writeSaved();
}

void forgetAll() {
  savedCount = 0;
  writeSaved();
  Serial.println("🧹 Remembered networks cleared (secrets.h networks still used).");
}

bool knownPassword(const String& ssid, String& pass) {
  for (int i = 0; i < savedCount; i++) if (saved[i].ssid == ssid) { pass = saved[i].pass; return true; }
  for (int i = 0; i < builtInCount; i++) if (builtIn[i].ssid == ssid) { pass = builtIn[i].pass; return true; }
  return false;
}

// ------------------------------------------------------------ status
void printStatus() {
  if (WiFi.status() == WL_CONNECTED)
    Serial.printf("✅ Wi-Fi: %s  IP: %s  RSSI: %d dBm\n", WiFi.SSID().c_str(), WiFi.localIP().toString().c_str(), WiFi.RSSI());
  else
    Serial.println("⚠️ Wi-Fi offline, retrying in the background. Type \"scan\" to pick one.");
  if (portalOn) Serial.printf("📱 Setup page open: join \"%s\" (pw %s) then http://192.168.4.1\n", deviceName.c_str(), PORTAL_PASSWORD);
}

void printSaved() {
  Serial.println("Remembered (last used first):");
  for (int i = 0; i < savedCount; i++) Serial.printf("  %d. %s\n", i + 1, saved[i].ssid.c_str());
  Serial.println("From secrets.h:");
  for (int i = 0; i < builtInCount; i++) Serial.printf("  - %s\n", builtIn[i].ssid.c_str());
}

// ------------------------------------------------------------ scanning
void storeScan(int n) {
  lastScanCount = 0;
  for (int i = 0; i < n && lastScanCount < 30; i++) {
    String s = WiFi.SSID(i);
    if (s.length() == 0) continue;
    bool dup = false;
    for (int j = 0; j < lastScanCount; j++) if (lastScanSsid[j] == s) dup = true;   // keep strongest only
    if (dup) continue;
    lastScanSsid[lastScanCount] = s;
    lastScanRssi[lastScanCount] = WiFi.RSSI(i);
    lastScanOpen[lastScanCount] = WiFi.encryptionType(i) == WIFI_AUTH_OPEN;
    lastScanCount++;
  }
  WiFi.scanDelete();
}

void printScan() {
  Serial.println("\n📶 Networks in range:");
  for (int i = 0; i < lastScanCount; i++) {
    String p;
    bool known = knownPassword(lastScanSsid[i], p);
    Serial.printf("  %2d. %-24s %4d dBm %s%s\n", i + 1, lastScanSsid[i].c_str(), lastScanRssi[i],
                  lastScanOpen[i] ? "open" : "🔒", known ? "  ★ known" : "");
  }
  if (lastScanCount == 0) Serial.println("  (none found)");
  Serial.println("Type: join <number> [password]\n");
}

// Order the known networks that are in range: last used first, then saved, then secrets.h.
void buildCandidates() {
  candidateCount = 0;
  auto add = [](const Net& n) {
    for (int j = 0; j < candidateCount; j++) if (candidates[j].ssid == n.ssid) return;
    bool inRange = false;
    for (int j = 0; j < lastScanCount; j++) if (lastScanSsid[j] == n.ssid) inRange = true;
    if (inRange || lastScanCount == 0) candidates[candidateCount++] = n;   // no scan result: try anyway
  };
  for (int i = 0; i < savedCount; i++) add(saved[i]);
  for (int i = 0; i < builtInCount; i++) add(builtIn[i]);
  candidateIdx = -1;
}

// ------------------------------------------------------------ connecting (non-blocking)
void setState(State s) { state = s; stateAt = millis(); }

void startScan() {
  WiFi.scanDelete();
  WiFi.scanNetworks(true);          // async
  setState(SCANNING);
}

void tryNextCandidate() {
  candidateIdx++;
  if (candidateIdx >= candidateCount) { setState(WAITING); return; }
  Serial.printf("🔌 Trying %s…\n", candidates[candidateIdx].ssid.c_str());
  WiFi.disconnect(false, false);
  WiFi.begin(candidates[candidateIdx].ssid.c_str(), candidates[candidateIdx].pass.c_str());
  setState(CONNECTING);
}

// Blocking join used by the Serial menu and the phone page.
bool joinNow(const String& ssid, const String& pass) {
  Serial.printf("🔌 Joining %s…\n", ssid.c_str());
  WiFi.disconnect(false, false);
  delay(100);
  WiFi.begin(ssid.c_str(), pass.c_str());
  unsigned long t = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - t < 12000) { delay(200); Serial.print("."); }
  Serial.println();
  if (WiFi.status() == WL_CONNECTED) {
    remember(ssid, pass);
    setState(ONLINE);
    Serial.println("💾 Saved as your last-used network.");
    return true;
  }
  Serial.println("❌ Could not join (wrong password or out of range).");
  setState(WAITING);
  return false;
}

// ------------------------------------------------------------ phone setup page
String htmlEscape(const String& s) {
  String o = s;
  o.replace("&", "&amp;"); o.replace("<", "&lt;"); o.replace(">", "&gt;"); o.replace("\"", "&quot;");
  return o;
}

void handleRoot() {
  portalTouchedAt = millis();
  int n = WiFi.scanNetworks();
  storeScan(n);
  String h = F("<!doctype html><html><head><meta name=viewport content='width=device-width,initial-scale=1'>"
               "<title>wish-band Wi-Fi</title><style>body{font-family:system-ui;background:#FBF5E9;color:#3B3F45;margin:0;padding:18px}"
               "h1{font-size:1.3rem}.n{display:flex;gap:10px;align-items:center;background:#fff;border-radius:14px;padding:12px;margin:8px 0;box-shadow:0 3px 0 #eee}"
               "input[type=password]{width:100%;padding:12px;border-radius:12px;border:2px solid #E6E3DD;font-size:1rem;box-sizing:border-box}"
               "button{width:100%;padding:14px;border:0;border-radius:99px;background:#F28C38;color:#fff;font-weight:800;font-size:1rem;margin-top:12px}"
               ".m{background:#DDEFD9;padding:10px;border-radius:12px}</style></head><body><h1>🍊 ");
  h += htmlEscape(deviceName);
  h += F(" Wi-Fi</h1>");
  if (portalMessage.length()) h += "<p class=m>" + htmlEscape(portalMessage) + "</p>";
  h += "<p>Now: <b>" + (WiFi.status() == WL_CONNECTED ? htmlEscape(WiFi.SSID()) : String("not connected")) + "</b></p>";
  h += F("<form method=post action=/save>");
  for (int i = 0; i < lastScanCount; i++) {
    String p;
    bool known = knownPassword(lastScanSsid[i], p);
    h += "<label class=n><input type=radio name=s value=\"" + htmlEscape(lastScanSsid[i]) + "\"" + (i == 0 ? " checked" : "") + ">";
    h += "<span style=flex:1>" + htmlEscape(lastScanSsid[i]) + (known ? " ★" : "") + "</span><small>" + String(lastScanRssi[i]) + " dBm" + (lastScanOpen[i] ? "" : " 🔒") + "</small></label>";
  }
  h += F("<p><input type=password name=p placeholder='Password (blank = use saved)'></p><button>Connect &amp; remember</button></form>"
         "<p><a href=/>↻ Scan again</a> · <a href=/forget>Forget saved networks</a></p></body></html>");
  server->send(200, "text/html", h);
}

void handleSave() {
  portalTouchedAt = millis();
  String ssid = server->arg("s"), pass = server->arg("p");
  if (pass.length() == 0) knownPassword(ssid, pass);
  bool ok = ssid.length() && joinNow(ssid, pass);
  portalMessage = ok ? "Connected to " + ssid + " and saved ✔ You can close this page." : "Could not join " + ssid + ". Check the password.";
  server->sendHeader("Location", "/");
  server->send(303);
}

void handleForget() {
  forgetAll();
  portalMessage = "Saved networks cleared.";
  server->sendHeader("Location", "/");
  server->send(303);
}

void startPortal() {
  if (portalOn) { printStatus(); return; }
  WiFi.mode(WIFI_AP_STA);
  WiFi.softAP(deviceName.c_str(), PORTAL_PASSWORD);
  dns = new DNSServer();
  dns->start(53, "*", WiFi.softAPIP());          // most phones pop the page up automatically
  server = new WebServer(80);
  server->on("/", handleRoot);
  server->on("/save", HTTP_POST, handleSave);
  server->on("/forget", handleForget);
  server->onNotFound(handleRoot);
  server->begin();
  portalOn = true;
  portalTouchedAt = millis();
  Serial.printf("📱 Setup page: join Wi-Fi \"%s\" (password %s), open http://192.168.4.1\n", deviceName.c_str(), PORTAL_PASSWORD);
}

void stopPortal() {
  if (!portalOn) return;
  server->stop(); delete server; server = nullptr;
  dns->stop(); delete dns; dns = nullptr;
  WiFi.softAPdisconnect(true);
  WiFi.mode(WIFI_STA);
  portalOn = false;
  Serial.println("📱 Setup page closed.");
}

// ------------------------------------------------------------ public API
void addBuiltIn(const char* ssid, const char* pass) {
  if (builtInCount < 8 && strlen(ssid) > 0) builtIn[builtInCount++] = { String(ssid), String(pass) };
}

// Call once in setup(). Blocks up to ~25 s while it tries the known networks.
void begin(const String& name) {
  deviceName = name;
  pinMode(BOOT_BUTTON, INPUT_PULLUP);
  loadSaved();
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.persistent(false);

  bool forcePortal = digitalRead(BOOT_BUTTON) == LOW;
  printSaved();

  Serial.println("📶 Scanning…");
  storeScan(WiFi.scanNetworks());
  buildCandidates();
  for (int i = 0; i < candidateCount && WiFi.status() != WL_CONNECTED; i++) {
    Serial.printf("🔌 Trying %s", candidates[i].ssid.c_str());
    WiFi.begin(candidates[i].ssid.c_str(), candidates[i].pass.c_str());
    unsigned long t = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - t < CONNECT_TIMEOUT_MS) { delay(250); Serial.print("."); }
    Serial.println();
    if (WiFi.status() == WL_CONNECTED) remember(candidates[i].ssid, candidates[i].pass);
    else WiFi.disconnect(false, false);
  }
  wasOnline = WiFi.status() == WL_CONNECTED;
  setState(wasOnline ? ONLINE : WAITING);
  printStatus();
  if (forcePortal || !wasOnline) startPortal();
}

// Call every loop(). Returns true while connected.
bool loop() {
  if (portalOn) {
    dns->processNextRequest();
    server->handleClient();
    if (WiFi.status() == WL_CONNECTED && millis() - portalTouchedAt > 60000) stopPortal();
    else if (millis() - portalTouchedAt > PORTAL_IDLE_MS) stopPortal();
  }

  bool online = WiFi.status() == WL_CONNECTED;
  switch (state) {
    case ONLINE:
      if (!online) { Serial.println("⚠️ Wi-Fi lost, reconnecting…"); setState(WAITING); stateAt = 0; }
      break;
    case WAITING:
      if (online) setState(ONLINE);
      else if (portalOn && millis() - portalTouchedAt < 90000) break;   // someone is using the setup page: don't hop channels
      else if (millis() - stateAt > RETRY_PAUSE_MS || stateAt == 0) startScan();
      break;
    case SCANNING: {
      int n = WiFi.scanComplete();
      if (n == WIFI_SCAN_RUNNING) break;
      storeScan(n < 0 ? 0 : n);
      buildCandidates();
      tryNextCandidate();
      break;
    }
    case CONNECTING:
      if (online) {
        remember(candidates[candidateIdx].ssid, candidates[candidateIdx].pass);
        setState(ONLINE);
      } else if (millis() - stateAt > CONNECT_TIMEOUT_MS) {
        tryNextCandidate();
      }
      break;
    default:
      setState(online ? ONLINE : WAITING);
  }

  if (online != wasOnline) { wasOnline = online; printStatus(); }
  return online;
}

// Feed a Serial line here. Returns true if it was a Wi-Fi command.
bool handleCommand(String cmd) {
  cmd.trim();
  String lower = cmd;
  lower.toLowerCase();
  if (lower == "scan") {
    Serial.println("📶 Scanning…");
    storeScan(WiFi.scanNetworks());
    printScan();
    return true;
  }
  if (lower == "wifi" || lower == "status") { printStatus(); return true; }
  if (lower == "saved") { printSaved(); return true; }
  if (lower == "forget") { forgetAll(); return true; }
  if (lower == "portal") { startPortal(); return true; }
  if (lower.startsWith("join ")) {
    String rest = cmd.substring(5);
    rest.trim();
    String ssid, pass;
    int comma = rest.indexOf(',');
    int space = rest.indexOf(' ');
    int num = rest.toInt();
    if (comma > 0) {                       // join Name,password
      ssid = rest.substring(0, comma);
      pass = rest.substring(comma + 1);
    } else if (num > 0) {                  // join 3 [password]
      if (num > lastScanCount) { Serial.println("Type \"scan\" first, then join <number>."); return true; }
      ssid = lastScanSsid[num - 1];
      if (space > 0) pass = rest.substring(space + 1);
      else if (!knownPassword(ssid, pass) && !lastScanOpen[num - 1]) {
        Serial.printf("🔒 %s needs a password: join %d <password>\n", ssid.c_str(), num);
        return true;
      }
    } else {                               // join Name (known password)
      ssid = rest;
      if (!knownPassword(ssid, pass)) { Serial.println("Unknown network. Use: join Name,password"); return true; }
    }
    joinNow(ssid, pass);
    printStatus();
    return true;
  }
  if (lower == "help" || lower == "?") {
    Serial.println("Wi-Fi commands: scan | join <n> [password] | join Name,password | saved | forget | portal | wifi");
    return true;
  }
  return false;
}

}  // namespace WifiSetup
