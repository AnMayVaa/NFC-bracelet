/*
  =============================================================================
  🌋 Jeju AuraBeads — Olle Trail NFC Checkpoint Station (ESP32 + PN532)
  Hardware: ESP32 + PN532 NFC Module (I2C Mode)
  =============================================================================

  WIRING (ESP32 <--> PN532 in I2C Mode):
    PN532 DIP Switches: SEL0 = OFF (0), SEL1 = ON (1)
    PN532 VCC  <--> ESP32 3.3V (or 5V depending on board)
    PN532 GND  <--> ESP32 GND
    PN532 SDA  <--> ESP32 GPIO 21
    PN532 SCL  <--> ESP32 GPIO 22

  OPTIONAL FEEDBACK:
    Buzzer (+) <--> ESP32 GPIO 4 (Buzzer (-) to GND)
    LED (+)    <--> ESP32 GPIO 2 (or built-in blue LED)

  DEMO STATION MODE:
    - Automatically stamps Checkpoint 1 (Seongsan Sunrise Peak) on first tap!
    - Automatically stamps Checkpoint 2 (Dongmun Market) on second tap!
    - Unlocks 4,000 KRW Voucher on the tourist's phone in real-time!
  =============================================================================
*/

#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <Wire.h>
#include <Adafruit_PN532.h>

// --- Wi-Fi Configuration ---
const char* ssid     = "BUNDAOBUNTAI";
const char* password = "ohm12345";

// --- Server Configuration ---
const char* serverBaseUrl = "https://smart-nfc-bracelet.vercel.app";

// --- Pin Definitions ---
#define SDA_PIN 21
#define SCL_PIN 22
#define BUZZER_PIN 4
#define LED_PIN 2

Adafruit_PN532 nfc(SDA_PIN, SCL_PIN);

// Debounce & State Tracking
String lastScannedUid = "";
unsigned long lastScanTime = 0;
const unsigned long DEBOUNCE_DELAY = 3500; // 3.5s debounce

// Checkpoint counter per tag: Tap 1 = Checkpoint 1, Tap 2 = Checkpoint 2
int tapCount = 0;

void toneFeedbackSuccess() {
  digitalWrite(LED_PIN, HIGH);
  tone(BUZZER_PIN, 2000, 120);
  delay(140);
  tone(BUZZER_PIN, 2800, 200);
  delay(220);
  digitalWrite(LED_PIN, LOW);
}

void toneFeedbackVoucher() {
  digitalWrite(LED_PIN, HIGH);
  tone(BUZZER_PIN, 2000, 100); delay(120);
  tone(BUZZER_PIN, 2400, 100); delay(120);
  tone(BUZZER_PIN, 2800, 100); delay(120);
  tone(BUZZER_PIN, 3400, 300); delay(350);
  digitalWrite(LED_PIN, LOW);
}

void toneFeedbackError() {
  digitalWrite(LED_PIN, HIGH);
  tone(BUZZER_PIN, 600, 400);
  delay(450);
  digitalWrite(LED_PIN, LOW);
}

void setup() {
  Serial.begin(115200);
  delay(1000);

  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);
  digitalWrite(LED_PIN, LOW);

  Serial.println("\n==============================================");
  Serial.println("🌋 Jeju AuraBeads — Olle Trail NFC Checkpoint");
  Serial.println("   (High-Power NFC Reader: ESP32 + PN532)");
  Serial.println("==============================================");

  // 1. Initialize PN532
  Wire.begin(SDA_PIN, SCL_PIN);
  nfc.begin();

  uint32_t versiondata = nfc.getFirmwareVersion();
  if (!versiondata) {
    Serial.println("❌ ERROR: Didn't find PN532 board! Check DIP switches & I2C wires (SDA=21, SCL=22).");
    while (1) { delay(500); }
  }

  Serial.print("✅ Found PN532 NFC chip with firmware rev: ");
  Serial.print((versiondata >> 16) & 0xFF, DEC);
  Serial.print('.');
  Serial.println((versiondata >> 8) & 0xFF, DEC);

  // Configure board to read RFID / NFC tags
  nfc.SAMConfig();

  // 2. Connect to Wi-Fi
  Serial.print("Connecting to Wi-Fi: ");
  Serial.println(ssid);
  WiFi.begin(ssid, password);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 25) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n✅ Wi-Fi connected! Station IP: ");
    Serial.println(WiFi.localIP());
    toneFeedbackSuccess();
  } else {
    Serial.println("\n⚠️ Wi-Fi not connected. Check SSID/Password.");
  }

  Serial.println("\n👉 READY! Tap your Volcanic Basalt NFC Bracelet on the PN532...\n");
}

void loop() {
  uint8_t success;
  uint8_t uid[] = { 0, 0, 0, 0, 0, 0, 0 };
  uint8_t uidLength;

  // Poll for ISO14443A NFC tag (NTAG215 bracelet)
  success = nfc.readPassiveTargetID(PN532_MIFARE_ISO14443A, uid, &uidLength, 150);

  if (success) {
    String uidStr = "";
    for (uint8_t i = 0; i < uidLength; i++) {
      if (uid[i] < 0x10) uidStr += "0";
      uidStr += String(uid[i], HEX);
    }
    uidStr.toUpperCase();

    if (uidStr != lastScannedUid || (millis() - lastScanTime > DEBOUNCE_DELAY)) {
      lastScannedUid = uidStr;
      lastScanTime = millis();
      tapCount++;

      // Cycle stations: Odd taps = Checkpoint 1, Even taps = Checkpoint 2
      String stationId = (tapCount % 2 == 1) ? "checkpoint1" : "checkpoint2";
      String stationName = (stationId == "checkpoint1") 
        ? "1. Seongsan Sunrise Peak (성산일출봉)" 
        : "2. Dongmun Traditional Market (동문시장)";

      Serial.println("\n==============================================");
      Serial.print("🏷️  NFC BRACELET SCANNED! UID: ");
      Serial.println(uidStr);
      Serial.print("Tag Length: ");
      Serial.print(uidLength);
      Serial.println(" bytes (NTAG215 NFC)");
      Serial.print("📍 Trail Station: ");
      Serial.println(stationName);

      // Send Check-in to Vercel Cloud
      bool checkinOk = sendCheckinToServer(uidStr, stationId);
      if (checkinOk) {
        Serial.println("🎉 DOL HAREUBANG STAMP CONFIRMED ON CLOUD!");
        if (stationId == "checkpoint2") {
          Serial.println("🎁 ALL 2 STAMPS COLLECTED! 4,000₩ VOUCHER UNLOCKED ON PHONE!");
          toneFeedbackVoucher();
        } else {
          Serial.println("📱 Check your smartphone to see the golden stamp glow!");
          toneFeedbackSuccess();
        }
      } else {
        toneFeedbackError();
      }
      Serial.println("==============================================");
    }
  }

  delay(100);
}

bool sendCheckinToServer(String uid, String station) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("❌ Wi-Fi disconnected. Cannot send checkin.");
    return false;
  }

  HTTPClient http;
  String url = String(serverBaseUrl) + "/api/checkin";

  WiFiClientSecure secureClient;
  if (url.startsWith("https://")) {
    secureClient.setInsecure();
    http.begin(secureClient, url);
  } else {
    http.begin(url);
  }

  http.addHeader("Content-Type", "application/json");

  String jsonPayload = "{\"uid\":\"" + uid + "\",\"station\":\"" + station + "\"}";
  int httpResponseCode = http.POST(jsonPayload);

  bool ok = false;
  if (httpResponseCode == 200) {
    String response = http.getString();
    Serial.print("📡 Server Response [200]: ");
    Serial.println(response);
    ok = true;
  } else {
    Serial.print("❌ HTTP Error [");
    Serial.print(httpResponseCode);
    Serial.print("]: ");
    Serial.println(http.errorToString(httpResponseCode).c_str());
  }

  http.end();
  return ok;
}
