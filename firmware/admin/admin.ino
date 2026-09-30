/*
  =============================================================================
  🌋 Jeju wish-band — Admin Desk Station
  Board: ESP32 Dev Module     Reader: PN532 (I2C)
  =============================================================================

  What it does (airport / hotel desk)
    1. Staff taps a new wish-band on the PN532.
    2. The ESP32 asks the server what to write (GET /api/admin/write-queue):
         - a custom text/URL queued from the Admin web page, or
         - the default tourist link  <SERVER>/<UID>
    3. It burns that NDEF record onto the NTAG sticker (skipped if already there),
       reads it back to verify, and reports it (POST /api/admin/scan).
    4. The Admin web page shows the UID so staff can register the tourist.

  Serial Monitor commands (115200 baud)
    W:<text or url>   queue a one-off write for the next tag
    scan / join <n>   pick a Wi-Fi network by hand (see wifi_setup.h, "help" lists all)

  Wi-Fi (see wifi_setup.h)
    Goes back to the network used last time, then tries the others it knows
    (secrets.h: BUNDAOBUNTAI, OhmPatumwan). Reconnects by itself if the hotspot drops.
    Hold BOOT at power-on for the phone setup page (Wi-Fi "WishBand-admin", pw wishband123).

  PN532 wiring (DIP switches: SEL0 = OFF, SEL1 = ON for I2C)
    VCC -> 3V3 (or 5V)   GND -> GND   SDA -> GPIO 21   SCL -> GPIO 22
  Buzzer (+) -> GPIO 4   LED (+) -> GPIO 2

  Libraries: "Adafruit PN532" (Library Manager). Copy secrets.example.h to secrets.h.
  =============================================================================
*/

#define FW_VERSION "2.0.0"

#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <Wire.h>
#include <Adafruit_PN532.h>

#if __has_include("secrets.h")
  #include "secrets.h"
#else
  #warning "secrets.h not found: using secrets.example.h (copy it to secrets.h and fill in your Wi-Fi)"
  #include "secrets.example.h"
#endif
#include "wifi_setup.h"

#define SDA_PIN    21
#define SCL_PIN    22
#define BUZZER_PIN 4
#define LED_PIN    2

Adafruit_PN532 nfc(SDA_PIN, SCL_PIN);
const char* WIFI_SSIDS[] = WIFI_SSID_LIST;
const int WIFI_COUNT = sizeof(WIFI_SSIDS) / sizeof(WIFI_SSIDS[0]);

String lastUid = "";
unsigned long lastTapAt = 0;
const unsigned long DEBOUNCE_MS = 2500;
String serialQueued = "";            // from "W:" command
unsigned long lastHeartbeat = 0;

const int MAX_CONTENT = 100;         // fits NTAG213 (144 bytes user memory)

// ---------------------------------------------------------------- sounds
void beep(int f, int ms) { tone(BUZZER_PIN, f, ms); delay(ms + 20); }
void soundOk()    { digitalWrite(LED_PIN, HIGH); beep(2200, 110); beep(2900, 170); digitalWrite(LED_PIN, LOW); }
void soundRead()  { digitalWrite(LED_PIN, HIGH); beep(2600, 70); digitalWrite(LED_PIN, LOW); }
void soundError() { digitalWrite(LED_PIN, HIGH); beep(700, 380); digitalWrite(LED_PIN, LOW); }

// ---------------------------------------------------------------- Wi-Fi
void setupWifi() {
  for (int i = 0; i < WIFI_COUNT; i++) WifiSetup::addBuiltIn(WIFI_SSIDS[i], WIFI_PASSWORD);
  WifiSetup::begin("WishBand-admin");
}

bool ensureWifi() { return WifiSetup::loop(); }

// ---------------------------------------------------------------- HTTP
int request(const char* method, const String& path, const String& body, String& response) {
  String url = String(SERVER_URL) + path;
  HTTPClient http;
  WiFiClientSecure secure;
  if (url.startsWith("https://")) { secure.setInsecure(); http.begin(secure, url); }
  else { http.begin(url); }
  http.setTimeout(6000);
  http.addHeader("Content-Type", "application/json");
  if (strlen(STATION_KEY) > 0) http.addHeader("X-Station-Key", STATION_KEY);
  int code = strcmp(method, "GET") == 0 ? http.GET() : http.POST(body);
  response = code > 0 ? http.getString() : http.errorToString(code);
  http.end();
  return code;
}

// Minimal JSON string reader: returns value of "key":"value", or "" for null/missing.
String jsonString(const String& json, const String& key) {
  int k = json.indexOf("\"" + key + "\":");
  if (k < 0) return "";
  int start = json.indexOf('"', k + key.length() + 3);
  int nullAt = json.indexOf("null", k + key.length() + 3);
  if (start < 0 || (nullAt >= 0 && nullAt < start)) return "";
  String out = "";
  for (int i = start + 1; i < (int)json.length(); i++) {
    char c = json[i];
    if (c == '\\' && i + 1 < (int)json.length()) { out += json[++i]; continue; }
    if (c == '"') break;
    out += c;
  }
  return out;
}

String jsonEscape(const String& s) {
  String o = s;
  o.replace("\\", "\\\\");
  o.replace("\"", "\\\"");
  return o;
}

// ---------------------------------------------------------------- NTAG read / write
String readNtagContent() {
  uint8_t buffer[160];
  memset(buffer, 0, sizeof(buffer));
  bool readAny = false;
  for (uint8_t page = 4; page < 40; page++) {
    uint8_t data[4];
    if (!nfc.ntag2xx_ReadPage(page, data)) break;
    readAny = true;
    memcpy(&buffer[(page - 4) * 4], data, 4);
  }
  if (!readAny) return "(could not read)";

  if (buffer[0] == 0x03 && buffer[2] == 0xD1) {
    uint8_t payloadLen = buffer[4];
    if (buffer[5] == 0x55) {                         // URI record
      const char* prefixes[] = { "", "http://www.", "https://www.", "http://", "https://" };
      String url = buffer[6] <= 4 ? prefixes[buffer[6]] : "";
      for (int i = 1; i < payloadLen && 6 + i < (int)sizeof(buffer); i++) url += (char)buffer[6 + i];
      return url;
    }
    if (buffer[5] == 0x54) {                         // Text record
      uint8_t langLen = buffer[6] & 0x1F;
      String text = "";
      for (int i = 1 + langLen; i < payloadLen && 6 + i < (int)sizeof(buffer); i++) text += (char)buffer[6 + i];
      return text;
    }
  }
  String raw = "";
  for (int i = 0; i < 80; i++) if (buffer[i] >= 32 && buffer[i] <= 126) raw += (char)buffer[i];
  return raw.length() ? raw : "(blank tag)";
}

bool writeNdef(String content) {
  if ((int)content.length() > MAX_CONTENT) content = content.substring(0, MAX_CONTENT);

  // Only format the Capability Container on blank tags (page 3 is one-time programmable).
  uint8_t page3[4];
  if (nfc.ntag2xx_ReadPage(3, page3) && page3[0] != 0xE1) {
    uint8_t cc[4] = { 0xE1, 0x10, 0x12, 0x00 };      // NTAG213 size, safe on 215/216 too
    nfc.ntag2xx_WritePage(3, cc);
    delay(10);
  }

  bool isUrl = content.startsWith("http://") || content.startsWith("https://");
  uint8_t prefix = 0x00;
  String body = content;
  if (content.startsWith("https://www.")) { prefix = 0x02; body = content.substring(12); }
  else if (content.startsWith("http://www.")) { prefix = 0x01; body = content.substring(11); }
  else if (content.startsWith("https://")) { prefix = 0x04; body = content.substring(8); }
  else if (content.startsWith("http://")) { prefix = 0x03; body = content.substring(7); }

  uint8_t n = body.length();
  uint8_t buf[128];
  memset(buf, 0, sizeof(buf));
  uint8_t total;
  if (isUrl) {
    uint8_t hdr[] = { 0x03, (uint8_t)(5 + n), 0xD1, 0x01, (uint8_t)(1 + n), 0x55, prefix };
    memcpy(buf, hdr, sizeof(hdr));
    for (int i = 0; i < n; i++) buf[7 + i] = body[i];
    buf[7 + n] = 0xFE;
    total = 8 + n;
  } else {
    uint8_t hdr[] = { 0x03, (uint8_t)(7 + n), 0xD1, 0x01, (uint8_t)(3 + n), 0x54, 0x02, 'e', 'n' };
    memcpy(buf, hdr, sizeof(hdr));
    for (int i = 0; i < n; i++) buf[9 + i] = body[i];
    buf[9 + n] = 0xFE;
    total = 10 + n;
  }

  uint8_t pages = (total + 3) / 4;
  for (uint8_t p = 0; p < pages; p++) {
    if (!nfc.ntag2xx_WritePage(4 + p, &buf[p * 4])) {
      Serial.printf("   ❌ page %d failed\n", 4 + p);
      return false;
    }
    delay(10);                                       // NTAG EEPROM write cycle
  }
  return true;
}

// ---------------------------------------------------------------- tap handling
void handleTag(const String& uid, uint8_t uidLength) {
  Serial.println("\n==============================================");
  Serial.printf("🏷️  Tag %s (%d-byte UID)\n", uid.c_str(), uidLength);
  bool online = WiFi.status() == WL_CONNECTED;

  // 1. What should this tag hold?
  String target = serialQueued;
  bool fromWebQueue = false;
  if (target.length() == 0 && online) {
    String res;
    if (request("GET", "/api/admin/write-queue", "", res) == 200) {
      target = jsonString(res, "pendingWrite");
      fromWebQueue = target.length() > 0;
    }
  }
  if (target.length() == 0) target = String(SERVER_URL) + "/" + uid;

  // 2. Write it (NTAG stickers have 7-byte UIDs; Mifare fobs are read-only here)
  String before = uidLength == 7 ? readNtagContent() : "";
  bool wrote = false;
  if (uidLength == 7) {
    if (before == target) {
      Serial.println("✔️ Tag already holds the right link, no write needed.");
    } else {
      Serial.printf("✍️ Writing: %s\n", target.c_str());
      wrote = writeNdef(target);
      Serial.println(wrote ? "✅ Written" : "⚠️ Write failed, tap again");
      if (wrote && serialQueued.length()) serialQueued = "";
    }
  } else {
    Serial.println("ℹ️ Not an NTAG sticker: UID only (fob / card).");
  }

  // 3. Verify and report
  String verified = uidLength == 7 ? readNtagContent() : "(UID only)";
  Serial.printf("📖 Tag says: %s\n", verified.c_str());

  if (online) {
    String body = String("{\"uid\":\"") + uid + "\",\"content\":\"" + jsonEscape(verified) + "\"";
    if (wrote && fromWebQueue) body += ",\"wrote\":\"" + jsonEscape(target) + "\"";
    body += ",\"ip\":\"" + WiFi.localIP().toString() + "\",\"rssi\":" + String(WiFi.RSSI()) + "}";
    String res;
    int code = request("POST", "/api/admin/scan", body, res);
    Serial.printf("📡 Admin web [%d]\n", code);
    if (code == 200 && (uidLength != 7 || verified == target)) soundOk();
    else if (code == 200) soundRead();
    else soundError();
  } else {
    (uidLength == 7 && verified == target) ? soundOk() : soundError();
  }
  Serial.println("==============================================");
}

// ---------------------------------------------------------------- main
void setup() {
  Serial.begin(115200);
  delay(600);
  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(LED_PIN, OUTPUT);
  Serial.println("\n==============================================");
  Serial.println("🌋 Jeju wish-band · Admin Desk (PN532)   fw " FW_VERSION);
  Serial.println("==============================================");

  Wire.begin(SDA_PIN, SCL_PIN);
  nfc.begin();
  uint32_t ver = nfc.getFirmwareVersion();
  if (!ver) {
    Serial.println("❌ PN532 not found. Check DIP switches (I2C) and SDA=21 / SCL=22.");
    while (true) { soundError(); delay(2000); }
  }
  Serial.printf("✅ PN532 firmware %d.%d\n", (ver >> 16) & 0xFF, (ver >> 8) & 0xFF);
  nfc.SAMConfig();

  setupWifi();
  if (WiFi.status() == WL_CONNECTED) soundOk();
  Serial.println("\n👉 Ready. Tap a new wish-band. Type W:<text> to queue a custom write, \"help\" for Wi-Fi.\n");
}

void loop() {
  bool online = ensureWifi();
  if (!online) digitalWrite(LED_PIN, (millis() / 500) % 2);
  else digitalWrite(LED_PIN, LOW);

  if (Serial.available()) {
    String cmd = Serial.readStringUntil('\n');
    cmd.trim();
    if (cmd.startsWith("W:") || cmd.startsWith("w:")) {
      serialQueued = cmd.substring(2);
      Serial.printf("✍️ Next tag will get: \"%s\"\n", serialQueued.c_str());
    } else if (!WifiSetup::handleCommand(cmd) && cmd.length() > 1) {
      Serial.println("Commands: W:<text> | scan | join <n> [password] | join Name,password | saved | forget | portal | wifi");
    }
  }

  if (online && millis() - lastHeartbeat > 60000) {
    lastHeartbeat = millis();
    String res;
    request("POST", "/api/stations/heartbeat",
            String("{\"station\":\"admin\",\"fw\":\"" FW_VERSION "\",\"ssid\":\"") + WiFi.SSID() +
            "\",\"ip\":\"" + WiFi.localIP().toString() + "\",\"rssi\":" + String(WiFi.RSSI()) + "}", res);
  }

  uint8_t uid[7] = {0};
  uint8_t len = 0;
  if (nfc.readPassiveTargetID(PN532_MIFARE_ISO14443A, uid, &len, 150)) {
    String s = "";
    for (uint8_t i = 0; i < len; i++) { if (uid[i] < 0x10) s += "0"; s += String(uid[i], HEX); }
    s.toUpperCase();
    if (s != lastUid || millis() - lastTapAt > DEBOUNCE_MS) {
      lastUid = s;
      lastTapAt = millis();
      handleTag(s, len);
    }
  }
  delay(80);
}
