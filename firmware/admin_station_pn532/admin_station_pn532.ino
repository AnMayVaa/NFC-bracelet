/*
  =============================================================================
  🌋 Jeju AuraBeads — Admin Station Firmware
  Hardware: ESP32 + PN532 NFC Module (I2C Mode)
  =============================================================================

  WIRING INSTRUCTIONS (ESP32 <--> PN532):
  -------------------------------------------------------------
  PN532 DIP Switches (on module):
    SET TO I2C MODE:
    Switch 1 (SEL0): OFF (or 0)
    Switch 2 (SEL1): ON  (or 1)
    (Check your specific PN532 board legend for I2C switch position)

  Pin Connections:
    PN532 VCC  <--> ESP32 3.3V (or 5V depending on board regulator)
    PN532 GND  <--> ESP32 GND
    PN532 SDA  <--> ESP32 GPIO 21
    PN532 SCL  <--> ESP32 GPIO 22
    PN532 IRQ  <--> (Optional, not used in polling mode)
    PN532 RSTO <--> (Optional, not used)

  REQUIRED ARDUINO LIBRARIES:
    1. "Adafruit PN532" by Adafruit (Install via Arduino Library Manager)
    2. "WiFi" & "HTTPClient" (Built into ESP32 core)
  =============================================================================
*/

#include <WiFi.h>
#include <HTTPClient.h>
#include <Wire.h>
#include <Adafruit_PN532.h>

// --- Wi-Fi Configuration ---
const char* ssid     = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";

// --- Server Configuration ---
// If running server.js locally on your laptop, use your laptop's Local IP
// Example: "http://192.168.1.50:3000"
const char* serverBaseUrl = "http://192.168.1.50:3000";

// --- PN532 I2C Setup ---
#define SDA_PIN 21
#define SCL_PIN 22
Adafruit_PN532 nfc(SDA_PIN, SCL_PIN);

// State tracking
String lastScannedUid = "";
unsigned long lastScanTime = 0;
const unsigned long DEBOUNCE_DELAY = 2500; // 2.5s debounce

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n==============================================");
  Serial.println("🌋 Jeju AuraBeads — Admin Station (ESP32+PN532)");
  Serial.println("==============================================");

  // 1. Initialize PN532
  Wire.begin(SDA_PIN, SCL_PIN);
  nfc.begin();

  uint32_t versiondata = nfc.getFirmwareVersion();
  if (!versiondata) {
    Serial.println("❌ ERROR: Didn't find PN532 board! Check DIP switches & I2C wires (SDA=21, SCL=22).");
    while (1) { delay(500); }
  }

  Serial.print("✅ Found PN532 chip with firmware rev: ");
  Serial.print((versiondata >> 16) & 0xFF, DEC);
  Serial.print('.');
  Serial.println((versiondata >> 8) & 0xFF, DEC);

  // Configure PN532 to read RFID/NFC tags
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
    Serial.println("\n✅ Wi-Fi connected! IP address: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("\n⚠️ Wi-Fi not connected. Check SSID/Password.");
  }

  Serial.println("\n👉 Ready! Hold an NFC tag (NTAG215) near the PN532 to scan...\n");
}

void loop() {
  uint8_t success;
  uint8_t uid[] = { 0, 0, 0, 0, 0, 0, 0 };  // Buffer for UID (up to 7 bytes)
  uint8_t uidLength;                        // Length of the UID (4 or 7 bytes)

  // Wait for an ISO14443A card
  success = nfc.readPassiveTargetID(PN532_MIFARE_ISO14443A, uid, &uidLength, 150);

  if (success) {
    // Format UID to uppercase HEX string (e.g., "04A1B2C3D4E5F6")
    String uidStr = "";
    for (uint8_t i = 0; i < uidLength; i++) {
      if (uid[i] < 0x10) uidStr += "0";
      uidStr += String(uid[i], HEX);
    }
    uidStr.toUpperCase();

    // Debounce duplicate scans
    if (uidStr != lastScannedUid || (millis() - lastScanTime > DEBOUNCE_DELAY)) {
      lastScannedUid = uidStr;
      lastScanTime = millis();

      Serial.println("\n-------------------------------------------");
      Serial.print("🏷️  NFC TAG DETECTED! UID: ");
      Serial.println(uidStr);
      Serial.print("Tag Length: ");
      Serial.print(uidLength);
      Serial.println(" bytes (NTAG215 = 7 bytes)");

      // Send to Admin Server via HTTP
      sendAdminScanToServer(uidStr);
    }
  }

  delay(100);
}

void sendAdminScanToServer(String uid) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("⚠️ Cannot send: Wi-Fi disconnected");
    return;
  }

  HTTPClient http;
  String url = String(serverBaseUrl) + "/api/admin/scan";

  http.begin(url);
  http.addHeader("Content-Type", "application/json");

  String jsonPayload = "{\"uid\":\"" + uid + "\"}";
  int httpResponseCode = http.POST(jsonPayload);

  if (httpResponseCode > 0) {
    Serial.print("📡 Server Response [");
    Serial.print(httpResponseCode);
    Serial.println("]: Tag pushed to Admin Registration UI!");
  } else {
    Serial.print("❌ HTTP POST Failed. Error: ");
    Serial.println(http.errorToString(httpResponseCode).c_str());
  }

  http.end();
}
