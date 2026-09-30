/*
  =============================================================================
  🌋 Jeju wish-band — Activity Station
  Board: ESP32 Dev Module     Reader: MFRC522 (SPI)  or  PN532 (I2C)
  =============================================================================

  What it does
    Tap a wish-band -> POST /api/checkin {uid, station:"activity"} -> the tourist
    gets a activity stamp. Collect food + place + activity to unlock the voucher.

  Feedback
    New stamp        : two rising beeps
    Voucher unlocked : four-note fanfare
    Already stamped  : one short beep (tapped again within 60 s)
    Offline          : two quick beeps (tap is queued and sent when Wi-Fi is back)
    Error            : low buzz

  Wi-Fi (see wifi_setup.h)
    Goes back to the network used last time, then tries the others it knows
    (secrets.h: BUNDAOBUNTAI, OhmPatumwan). Reconnects by itself if the hotspot drops.
    Pick one by hand: type "scan" then "join 2" in the Serial Monitor, or hold BOOT
    at power-on and use the phone setup page (Wi-Fi "WishBand-activity", pw wishband123).

  Setup
    1. Copy secrets.example.h to secrets.h in this folder and fill it in.
    2. Libraries: "MFRC522" by GithubCommunity (or "Adafruit PN532" if USE_PN532 = 1).
    3. Board: ESP32 Dev Module, 115200 baud.

  MFRC522 wiring (3.3 V ONLY, never 5 V)     PN532 wiring (DIP: SEL0=OFF, SEL1=ON for I2C)
    3.3V -> 3V3    RST  -> GPIO 22             VCC -> 3V3 / 5V
    GND  -> GND    MISO -> GPIO 19             GND -> GND
    SCK  -> GPIO 18 MOSI -> GPIO 23            SDA -> GPIO 21
    SDA/SS -> GPIO 5                           SCL -> GPIO 22
  Buzzer (+) -> GPIO 4    LED (+) -> GPIO 2 (built-in LED on most boards)
  =============================================================================
*/

// ---------------------------------------------------------------- station
#define STATION_ID    "activity"        // must match lib/data/stations.js on the server
#define STATION_NAME  "Haenyeo Museum"
#define FW_VERSION    "2.0.0"

// 0 = MFRC522 (SPI), 1 = PN532 (I2C)
#define USE_PN532 0

// ---------------------------------------------------------------- includes
#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>

#if __has_include("secrets.h")
  #include "secrets.h"
#else
  #warning "secrets.h not found: using secrets.example.h (copy it to secrets.h and fill in your Wi-Fi)"
  #include "secrets.example.h"
#endif
#include "wifi_setup.h"

#if USE_PN532
  #include <Wire.h>
  #include <Adafruit_PN532.h>
  #define SDA_PIN 21
  #define SCL_PIN 22
  Adafruit_PN532 nfc(SDA_PIN, SCL_PIN);
#else
  #include <SPI.h>
  #include <MFRC522.h>
  #define SS_PIN  5
  #define RST_PIN 22
  MFRC522 rfid(SS_PIN, RST_PIN);
#endif

#define BUZZER_PIN 4
#define LED_PIN    2

// ---------------------------------------------------------------- state
const char* WIFI_SSIDS[] = WIFI_SSID_LIST;
const int WIFI_COUNT = sizeof(WIFI_SSIDS) / sizeof(WIFI_SSIDS[0]);

String lastUid = "";
unsigned long lastTapAt = 0;
const unsigned long LOCAL_DEBOUNCE_MS = 2500;   // ignore a tag held on the reader

const int QUEUE_MAX = 20;                       // taps kept while offline
String pending[QUEUE_MAX];
int pendingCount = 0;

unsigned long lastFlush = 0;
unsigned long lastHeartbeat = 0;
const unsigned long HEARTBEAT_MS = 60000;

// ---------------------------------------------------------------- sounds
void beep(int freq, int ms) { tone(BUZZER_PIN, freq, ms); delay(ms + 20); }

void soundStamp()   { digitalWrite(LED_PIN, HIGH); beep(2200, 110); beep(2900, 170); digitalWrite(LED_PIN, LOW); }
void soundVoucher() { digitalWrite(LED_PIN, HIGH); beep(2000, 100); beep(2400, 100); beep(2800, 100); beep(3400, 280); digitalWrite(LED_PIN, LOW); }
void soundRepeat()  { digitalWrite(LED_PIN, HIGH); beep(2600, 70); digitalWrite(LED_PIN, LOW); }
void soundQueued()  { digitalWrite(LED_PIN, HIGH); beep(2400, 60); beep(2400, 60); digitalWrite(LED_PIN, LOW); }
void soundError()   { digitalWrite(LED_PIN, HIGH); beep(700, 380); digitalWrite(LED_PIN, LOW); }

// ---------------------------------------------------------------- Wi-Fi
void setupWifi() {
  for (int i = 0; i < WIFI_COUNT; i++) WifiSetup::addBuiltIn(WIFI_SSIDS[i], WIFI_PASSWORD);
  WifiSetup::begin("WishBand-" STATION_ID);
}

bool ensureWifi() { return WifiSetup::loop(); }

void handleSerial() {
  if (!Serial.available()) return;
  String cmd = Serial.readStringUntil('\n');
  if (!WifiSetup::handleCommand(cmd) && cmd.length() > 1)
    Serial.println("Commands: scan | join <n> [password] | join Name,password | saved | forget | portal | wifi");
}

// ---------------------------------------------------------------- HTTP
int postJson(const String& path, const String& body, String& response) {
  String url = String(SERVER_URL) + path;
  HTTPClient http;
  WiFiClientSecure secure;
  if (url.startsWith("https://")) { secure.setInsecure(); http.begin(secure, url); }
  else { http.begin(url); }
  http.setTimeout(6000);
  http.addHeader("Content-Type", "application/json");
  if (strlen(STATION_KEY) > 0) http.addHeader("X-Station-Key", STATION_KEY);
  int code = http.POST(body);
  response = code > 0 ? http.getString() : http.errorToString(code);
  http.end();
  return code;
}

// Sends one tap. Returns false if it should be retried later.
bool sendCheckin(const String& uid, bool live) {
  String body = String("{\"uid\":\"") + uid + "\",\"station\":\"" STATION_ID "\",\"ip\":\"" +
                WiFi.localIP().toString() + "\",\"rssi\":" + String(WiFi.RSSI()) + "}";
  String res;
  int code = postJson("/api/checkin", body, res);
  Serial.printf("📡 [%d] %s\n", code, res.c_str());

  if (code == 200) {
    if (!live) return true;  // replayed from the queue: stay quiet
    if (res.indexOf("\"voucherUnlocked\":true") >= 0) { Serial.println("🎉 Voucher unlocked!"); soundVoucher(); }
    else if (res.indexOf("\"duplicate\":true") >= 0) { Serial.println("↺ Already stamped just now"); soundRepeat(); }
    else { Serial.println("🗿 Stamp saved"); soundStamp(); }
    return true;
  }
  if (code >= 400 && code < 500) {   // server said no (bad key, unknown station): don't retry
    if (live) soundError();
    return true;
  }
  if (live) soundError();
  return false;
}

void queueTap(const String& uid) {
  if (pendingCount < QUEUE_MAX) pending[pendingCount++] = uid;
  Serial.printf("🕒 Queued %s (%d waiting)\n", uid.c_str(), pendingCount);
}

void flushQueue() {
  while (pendingCount > 0 && WiFi.status() == WL_CONNECTED) {
    if (!sendCheckin(pending[0], false)) return;
    for (int i = 1; i < pendingCount; i++) pending[i - 1] = pending[i];
    pendingCount--;
  }
}

void sendHeartbeat() {
  String body = String("{\"station\":\"" STATION_ID "\",\"fw\":\"" FW_VERSION "\",\"ssid\":\"") + WiFi.SSID() +
                "\",\"ip\":\"" + WiFi.localIP().toString() + "\",\"rssi\":" + String(WiFi.RSSI()) + "}";
  String res;
  postJson("/api/stations/heartbeat", body, res);
}

// ---------------------------------------------------------------- reader
void setupReader() {
#if USE_PN532
  Wire.begin(SDA_PIN, SCL_PIN);
  nfc.begin();
  uint32_t ver = nfc.getFirmwareVersion();
  if (!ver) {
    Serial.println("❌ PN532 not found. Check DIP switches (I2C) and SDA=21 / SCL=22.");
    while (true) { soundError(); delay(2000); }
  }
  Serial.printf("✅ PN532 firmware %d.%d\n", (ver >> 16) & 0xFF, (ver >> 8) & 0xFF);
  nfc.SAMConfig();
#else
  pinMode(RST_PIN, OUTPUT);
  digitalWrite(RST_PIN, LOW);  delay(10);
  digitalWrite(RST_PIN, HIGH); delay(50);
  SPI.begin(18, 19, 23, SS_PIN);
  SPI.setFrequency(2000000);
  rfid.PCD_Init();
  rfid.PCD_AntennaOn();
  rfid.PCD_SetAntennaGain(rfid.RxGain_max);   // helps with small NFC stickers
  byte v = rfid.PCD_ReadRegister(rfid.VersionReg);
  if (v == 0x00 || v == 0xFF) {
    Serial.println("❌ MFRC522 not responding. Check 3.3 V power and SDA -> GPIO 5.");
    while (true) { soundError(); delay(2000); }
  }
  Serial.printf("✅ MFRC522 online (version 0x%02X)\n", v);
#endif
}

// Returns the tag UID as HEX, or "" when no tag is present.
String readTag() {
#if USE_PN532
  uint8_t uid[7] = {0};
  uint8_t len = 0;
  if (!nfc.readPassiveTargetID(PN532_MIFARE_ISO14443A, uid, &len, 100)) return "";
  String s = "";
  for (uint8_t i = 0; i < len; i++) { if (uid[i] < 0x10) s += "0"; s += String(uid[i], HEX); }
#else
  if (!rfid.PICC_IsNewCardPresent() || !rfid.PICC_ReadCardSerial()) return "";
  String s = "";
  for (byte i = 0; i < rfid.uid.size; i++) { if (rfid.uid.uidByte[i] < 0x10) s += "0"; s += String(rfid.uid.uidByte[i], HEX); }
  rfid.PICC_HaltA();
  rfid.PCD_StopCrypto1();
#endif
  s.toUpperCase();
  return s;
}

// ---------------------------------------------------------------- main
void setup() {
  Serial.begin(115200);
  delay(600);
  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(LED_PIN, OUTPUT);
  Serial.println("\n==============================================");
  Serial.println("🌋 Jeju wish-band · " STATION_NAME);
  Serial.println("   station id: " STATION_ID "   fw " FW_VERSION);
  Serial.println("==============================================");

  setupReader();
  setupWifi();
  if (WiFi.status() == WL_CONNECTED) { soundStamp(); sendHeartbeat(); lastHeartbeat = millis(); }
  Serial.println("\n👉 Ready. Tap a wish-band! (type \"help\" for Wi-Fi commands)\n");
}

void loop() {
  handleSerial();
  bool online = ensureWifi();

  // LED breathes slowly while offline so staff can see it
  if (!online) digitalWrite(LED_PIN, (millis() / 500) % 2);
  else if (pendingCount == 0) digitalWrite(LED_PIN, LOW);

  String uid = readTag();
  if (uid.length() > 0 && (uid != lastUid || millis() - lastTapAt > LOCAL_DEBOUNCE_MS)) {
    lastUid = uid;
    lastTapAt = millis();
    Serial.printf("\n📍 Tap: %s\n", uid.c_str());
    if (!online) { queueTap(uid); soundQueued(); }
    else if (!sendCheckin(uid, true)) queueTap(uid);
  }

  if (online) {
    if (pendingCount > 0 && millis() - lastFlush > 10000) { lastFlush = millis(); flushQueue(); }
    if (millis() - lastHeartbeat > HEARTBEAT_MS) { sendHeartbeat(); lastHeartbeat = millis(); }
  }
  delay(60);
}
