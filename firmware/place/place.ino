/*
  =============================================================================
  🌋 Jeju wish-band — Place Station
  Board: ESP32 Dev Module     Reader: PN532 (I2C, default)  or  MFRC522 (SPI)
  =============================================================================

  What it does
    Tap a wish-band -> POST /api/checkin {uid, station:"place"} -> the tourist
    gets a place stamp. Collect food + place + activity to unlock the voucher.

  Feedback (like a bus card reader: the first beep comes the moment the band is read;
  the server is asked in the background and its answer only adds to that beep)
    Band read        : one beep right away
    New stamp        : a second, higher beep once the server has saved it
    Voucher unlocked : four-note fanfare
    Already stamped  : just the first beep (tapped again within 60 s)
    Offline / no answer : two quick beeps (tap is queued and sent when Wi-Fi is back)
    Error            : low buzz (the server refused the tap)
    Counting taps    : one short low tick (2nd to 4th quick tap of the same band)
    SOS              : high-low siren, then the LED flashes fast for 30 s

  SOS without a phone
    Tap the same wish-band 5 times within 12 s (lift it off between taps). The station
    sends POST /api/sos/band {uid, station, taps} and the help desk gets an SOS pinned to
    this station with the tourist's medical notes and emergency contact. Only the first
    tap is sent as a check-in, so a normal tap still stamps exactly once. Offline, the SOS
    is queued first in line and the LED keeps flashing until it is sent.

  Wi-Fi (see wifi_setup.h)
    Goes back to the network used last time, then tries the others it knows
    (secrets.h: BUNDAOBUNTAI, OhmPatumwan). Reconnects by itself if the hotspot drops.
    Pick one by hand: type "scan" then "join 2" in the Serial Monitor, or hold BOOT
    at power-on and use the phone setup page (Wi-Fi "WishBand-place", pw wishband123).

  Setup
    1. Copy secrets.example.h to secrets.h in this folder and fill it in.
    2. Libraries: "Adafruit PN532" (or "MFRC522" by GithubCommunity if USE_PN532 = 0).
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
#define STATION_ID    "place"        // must match lib/data/stations.js on the server
#define STATION_NAME  "Seongsan Ilchulbong"
#define FW_VERSION    "2.3.0"

// 1 = PN532 (I2C, default), 0 = MFRC522 (SPI)
#define USE_PN532 1

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
#include "net_worker.h"

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
unsigned long lastSeenAt = 0;
const unsigned long LIFT_GAP_MS = 400;          // a tag must leave the reader this long to count as a new tap

// SOS by rapid taps (same numbers as SOS_TAPS / SOS_TAP_WINDOW_MS in lib/core.js)
#define SOS_TAPS      5
#define SOS_WINDOW_MS 12000UL
#define SOS_LIGHT_MS  30000UL
String burstUid = "";
unsigned long burstAt[SOS_TAPS];
int burstCount = 0;
unsigned long sosLightUntil = 0;

const int QUEUE_MAX = 20;                       // taps kept while offline
String pending[QUEUE_MAX];
int pendingCount = 0;

unsigned long lastFlush = 0;                    // when a queued item was last tried (0 = send now)
String replayItem = "";                         // queued item that is out with the network task
int netBusy = 0;                                // requests handed to the network task, not answered yet
unsigned long ledUntil = 0;                     // LED stays on until then after a tap
const unsigned long KEEP_WARM_MS = 20000;       // a heartbeat every 20 s keeps the link open and the server warm

// ---------------------------------------------------------------- sounds
unsigned long toneFreeAt = 0;                   // when the instant tap beep has finished
void beep(int freq, int ms) {
  while ((long)(toneFreeAt - millis()) > 0) delay(2);
  tone(BUZZER_PIN, freq, ms);
  delay(ms + 20);
}

// Played the moment a band is read, before any network call. Doesn't wait for the sound to end.
void soundTap()     { digitalWrite(LED_PIN, HIGH); ledUntil = millis() + 300; tone(BUZZER_PIN, 2200, 90); toneFreeAt = millis() + 110; }
void soundSaved()   { digitalWrite(LED_PIN, HIGH); beep(2900, 150); digitalWrite(LED_PIN, LOW); }

void soundStamp()   { digitalWrite(LED_PIN, HIGH); beep(2200, 110); beep(2900, 170); digitalWrite(LED_PIN, LOW); }
void soundVoucher() { digitalWrite(LED_PIN, HIGH); beep(2000, 100); beep(2400, 100); beep(2800, 100); beep(3400, 280); digitalWrite(LED_PIN, LOW); }
void soundQueued()  { digitalWrite(LED_PIN, HIGH); beep(2400, 60); beep(2400, 60); digitalWrite(LED_PIN, LOW); }
void soundError()   { digitalWrite(LED_PIN, HIGH); beep(700, 380); digitalWrite(LED_PIN, LOW); }
void soundCount()   { digitalWrite(LED_PIN, HIGH); beep(1500, 45); digitalWrite(LED_PIN, LOW); }
void soundSos() {   // unlike any other sound: six high-low siren swings with the LED strobing
  for (int i = 0; i < 6; i++) { digitalWrite(LED_PIN, HIGH); beep(3000, 140); digitalWrite(LED_PIN, LOW); beep(1600, 140); }
}

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

// ---------------------------------------------------------------- server calls (background, see net_worker.h)
// Kinds of request handed to the network task.
enum { JOB_CHECKIN = 1, JOB_QUEUED_CHECKIN, JOB_SOS, JOB_QUEUED_SOS, JOB_HEARTBEAT };

bool submitCheckin(const String& uid, bool live, uint32_t at) {
  String body = String("{\"uid\":\"") + uid + "\",\"station\":\"" + STATION_ID + "\",\"ip\":\"" +
                WiFi.localIP().toString() + "\",\"rssi\":" + String(WiFi.RSSI()) + "}";
  if (!NetWorker::submit(live ? JOB_CHECKIN : JOB_QUEUED_CHECKIN, uid, at, "/api/checkin", body)) return false;
  netBusy++;
  return true;
}

// Asks the help desk for an SOS for this band. at = when the taps happened (queued while offline).
bool submitSos(const String& uid, bool live, uint32_t at) {
  String body = String("{\"uid\":\"") + uid + "\",\"station\":\"" + STATION_ID + "\",\"taps\":" + String(SOS_TAPS) +
                ",\"ageSec\":" + String((millis() - at) / 1000) + ",\"ip\":\"" + WiFi.localIP().toString() +
                "\",\"rssi\":" + String(WiFi.RSSI()) + "}";
  if (!NetWorker::submit(live ? JOB_SOS : JOB_QUEUED_SOS, uid, at, "/api/sos/band", body)) return false;
  netBusy++;
  return true;
}

void submitHeartbeat() {
  String body = String("{\"station\":\"") + STATION_ID + "\",\"fw\":\"" FW_VERSION "\",\"ssid\":\"" + WiFi.SSID() +
                "\",\"ip\":\"" + WiFi.localIP().toString() + "\",\"rssi\":" + String(WiFi.RSSI()) + "}";
  if (NetWorker::submit(JOB_HEARTBEAT, "", millis(), "/api/stations/heartbeat", body)) netBusy++;
}

// Offline queue items: "<uid>:<millis>" for a tap, "SOS:<uid>:<millis>" for an SOS.
void queueTap(const String& uid, uint32_t at) {
  if (pendingCount < QUEUE_MAX) pending[pendingCount++] = uid + ":" + String(at);
  Serial.printf("🕒 Queued %s (%d waiting)\n", uid.c_str(), pendingCount);
}

// SOS goes to the front of the queue, pushing out the newest tap if full.
void queueSos(const String& uid, uint32_t at) {
  if (pendingCount == QUEUE_MAX) pendingCount--;
  for (int i = pendingCount; i > 0; i--) pending[i] = pending[i - 1];
  pending[0] = "SOS:" + uid + ":" + String(at);
  pendingCount++;
  Serial.printf("🕒 SOS queued for %s (sent when Wi-Fi is back)\n", uid.c_str());
}

bool sosWaiting() {
  for (int i = 0; i < pendingCount; i++) if (pending[i].startsWith("SOS:")) return true;
  return false;
}

// Sends the oldest queued item (one at a time, only while no live tap is waiting).
void replayQueue() {
  String item = pending[0];
  bool sos = item.startsWith("SOS:");
  String rest = sos ? item.substring(4) : item;
  int sep = rest.lastIndexOf(':');
  uint32_t at = strtoul(rest.substring(sep + 1).c_str(), nullptr, 10);
  String uid = rest.substring(0, sep);
  if (sos ? submitSos(uid, false, at) : submitCheckin(uid, false, at)) replayItem = item;
}

void replayFinished(bool delivered) {
  if (delivered) {
    for (int i = 0; i < pendingCount; i++) {
      if (pending[i] != replayItem) continue;
      for (int k = i + 1; k < pendingCount; k++) pending[k - 1] = pending[k];
      pendingCount--;
      break;
    }
    lastFlush = 0;                 // send the next one right away
  } else {
    lastFlush = millis();          // try again in 10 s
  }
  replayItem = "";
}

// The server answered (or gave up). Sounds here only add to the beep the tap already got.
void handleReply(const NetWorker::Reply& r) {
  netBusy--;
  String res = r.body;
  String uid = r.uid;
  bool refused = r.code >= 400 && r.code < 500;     // bad key, unknown station: retrying won't help

  switch (r.kind) {
    case JOB_CHECKIN:
    case JOB_QUEUED_CHECKIN: {
      bool live = r.kind == JOB_CHECKIN;
      Serial.printf("📡 [%d] in %lu ms %s\n", r.code, (unsigned long)(millis() - r.at), r.body);
      if (!live) { replayFinished(r.code == 200 || refused); break; }
      if (r.code == 200) {
        if (res.indexOf("\"sosTriggered\":true") >= 0) { Serial.println("🆘 Server counted an SOS"); sosLightUntil = millis() + SOS_LIGHT_MS; soundSos(); }
        else if (res.indexOf("\"voucherUnlocked\":true") >= 0) { Serial.println("🎉 Voucher unlocked!"); soundVoucher(); }
        else if (res.indexOf("\"duplicate\":true") >= 0) Serial.println("↺ Already stamped just now");
        else { Serial.println("🗿 Stamp saved"); soundSaved(); }
      } else if (refused) {
        soundError();
      } else {
        queueTap(uid, r.at);           // no answer: keep it and send it later
        soundQueued();
      }
      break;
    }
    case JOB_SOS:
    case JOB_QUEUED_SOS: {
      Serial.printf("🆘 [%d] %s\n", r.code, r.body);
      bool delivered = r.code == 200;
      if (delivered) { Serial.println("🆘 SOS delivered to the help desk"); sosLightUntil = millis() + SOS_LIGHT_MS; }
      if (refused) soundError();
      if (r.kind == JOB_QUEUED_SOS) replayFinished(delivered || refused);
      else if (!delivered && !refused) queueSos(uid, r.at);
      break;
    }
    case JOB_HEARTBEAT:
      if (r.code != 200) Serial.printf("💓 heartbeat [%d] %s\n", r.code, r.body);
      break;
  }
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
  if (!nfc.readPassiveTargetID(PN532_MIFARE_ISO14443A, uid, &len, 40)) return "";
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

// ---------------------------------------------------------------- taps
// How many taps of this band fell inside the SOS window, this one included.
int countTap(const String& uid) {
  unsigned long now = millis();
  if (uid != burstUid) { burstUid = uid; burstCount = 0; }
  int kept = 0;
  for (int i = 0; i < burstCount; i++) if (now - burstAt[i] < SOS_WINDOW_MS) burstAt[kept++] = burstAt[i];
  burstCount = kept;
  burstAt[burstCount++] = now;
  return burstCount;
}

void handleTap(const String& uid, bool online) {
  int n = countTap(uid);
  Serial.printf("\n📍 Tap: %s (%d/%d for SOS)\n", uid.c_str(), n, SOS_TAPS);
  if (n >= SOS_TAPS) {
    burstCount = 0;
    Serial.println("🆘 SOS: band tapped " + String(SOS_TAPS) + " times");
    sosLightUntil = millis() + SOS_LIGHT_MS;
    if (!online || !submitSos(uid, true, millis())) queueSos(uid, millis());
    soundSos();                        // the request is already on its way while the siren plays
  } else if (n == 1) {
    // First tap: the normal check-in (stamps once; the server's 60 s cooldown handles later taps).
    // Beep now, like a bus card reader; the server's answer comes in the background.
    soundTap();
    if (!online || !submitCheckin(uid, true, millis())) { queueTap(uid, millis()); soundQueued(); }
  } else {
    soundCount();   // 2nd..4th quick tap: only counted here
  }
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
  NetWorker::begin();
  if (WiFi.status() == WL_CONNECTED) soundStamp();
  Serial.println("\n👉 Ready. Tap a wish-band! (type \"help\" for Wi-Fi commands)\n");
}

void loop() {
  handleSerial();
  bool online = ensureWifi();

  NetWorker::Reply reply;
  while (NetWorker::poll(reply)) handleReply(reply);

  // LED: fast strobe after an SOS (and while one waits to be sent), on briefly after a tap, slow blink while offline
  if ((long)(sosLightUntil - millis()) > 0 || sosWaiting()) digitalWrite(LED_PIN, (millis() / 120) % 2);
  else if ((long)(ledUntil - millis()) > 0) digitalWrite(LED_PIN, HIGH);
  else if (!online) digitalWrite(LED_PIN, (millis() / 500) % 2);
  else if (pendingCount == 0) digitalWrite(LED_PIN, LOW);

  // A held tag keeps being read; it only counts again after it has left the reader for LIFT_GAP_MS.
  String uid = readTag();
  if (uid.length() > 0) {
    bool newTap = uid != lastUid || millis() - lastSeenAt > LIFT_GAP_MS;
    lastUid = uid;
    if (newTap) handleTap(uid, online);
    lastSeenAt = millis();   // after handleTap: its sounds must not look like a lift-off
  }

  // Queued taps and the keep-warm heartbeat only go out while no live tap waits for the server.
  if (online && netBusy == 0) {
    if (pendingCount > 0 && (lastFlush == 0 || millis() - lastFlush > 10000)) replayQueue();
    else if (NetWorker::lastSentAt == 0 || millis() - NetWorker::lastSentAt > KEEP_WARM_MS) submitHeartbeat();
  }
  delay(10);
}
