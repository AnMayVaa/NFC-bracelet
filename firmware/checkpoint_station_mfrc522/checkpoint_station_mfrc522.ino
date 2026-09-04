/*
  =============================================================================
  🌋 Jeju AuraBeads — Olle Trail Checkpoint Firmware
  Hardware: ESP32 + MFRC522 RFID/NFC Module (SPI Mode)
  =============================================================================

  WIRING INSTRUCTIONS (ESP32 <--> MFRC522):
  -------------------------------------------------------------
  ⚠️ CRITICAL WARNING: MFRC522 OPERATES AT 3.3V ONLY!
     NEVER CONNECT MFRC522 VCC TO 5V OR YOU WILL DAMAGE THE CHIP.

  Pin Connections:
    MFRC522 3.3V  <--> ESP32 3V3 (Must be 3.3V!)
    MFRC522 RST   <--> ESP32 GPIO 22
    MFRC522 GND   <--> ESP32 GND
    MFRC522 IRQ   <--> (Not connected)
    MFRC522 MISO  <--> ESP32 GPIO 19 (SPI MISO)
    MFRC522 MOSI  <--> ESP32 GPIO 23 (SPI MOSI)
    MFRC522 SCK   <--> ESP32 GPIO 18 (SPI SCK)
    MFRC522 SDA/SS<--> ESP32 GPIO 5  (SPI CS)

  Optional Audio/Visual Feedback:
    Buzzer (+)    <--> ESP32 GPIO 4  (Buzzer (-) to GND)
    Green LED (+) <--> ESP32 GPIO 2  (or built-in LED)

  REQUIRED ARDUINO LIBRARIES:
    1. "MFRC522" by GithubCommunity / Miguel Balboa (Arduino Library Manager)
    2. "WiFi" & "HTTPClient" (Built into ESP32 core)
  =============================================================================
*/

#include <WiFi.h>
#include <HTTPClient.h>
#include <SPI.h>
#include <MFRC522.h>

// =====================================================================
// ⚙️ STATION SELECTION:
// Set to "checkpoint1" for Checkpoint 1 (Seongsan Sunrise Peak)
// Set to "checkpoint2" for Checkpoint 2 (Dongmun Traditional Market)
// =====================================================================
#define STATION_ID "checkpoint1" 
#define STATION_NAME "1. Seongsan Sunrise Peak"

// --- Wi-Fi Configuration ---
const char* ssid     = "BUNDAOBUNTAI";
const char* password = "ohm12345";

// --- Server Configuration ---
// Live Vercel Production Domain:
const char* serverBaseUrl = "https://smart-nfc-bracelet.vercel.app";

// --- Pin Definitions ---
#define SS_PIN    5
#define RST_PIN   22
#define BUZZER_PIN 4
#define LED_PIN    2

MFRC522 mfrc522(SS_PIN, RST_PIN);

// Debounce state
String lastScannedUid = "";
unsigned long lastScanTime = 0;
const unsigned long DEBOUNCE_DELAY = 3000; // 3 seconds debounce

void setup() {
  Serial.begin(115200);
  delay(1000);

  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);
  digitalWrite(LED_PIN, LOW);

  Serial.println("\n==============================================");
  Serial.print("🌋 Jeju AuraBeads — ");
  Serial.println(STATION_NAME);
  Serial.println("==============================================");

  // 1. Initialize SPI bus & MFRC522
  Serial.println("Initializing SPI bus...");
  SPI.begin(); // Standard ESP32 VSPI: SCK=18, MISO=19, MOSI=23, SS controlled by MFRC522
  delay(50);

  Serial.println("Initializing MFRC522 RFID reader...");
  mfrc522.PCD_Init();
  delay(50);

  // Boost antenna gain to MAXIMUM (48dB) to easily detect small NFC stickers
  mfrc522.PCD_SetAntennaGain(mfrc522.RxGain_max);

  // Check communication
  byte v = mfrc522.PCD_ReadRegister(mfrc522.VersionReg);
  Serial.print("MFRC522 Firmware Version: 0x");
  Serial.println(v, HEX);
  if (v == 0x00 || v == 0xFF) {
    Serial.println("❌ ERROR: MFRC522 not responding! Check wires, 3.3V power, or loose header pins.");
    Serial.println("👉 Common check: Pin 'SDA' on RC522 must go to ESP32 GPIO 5 (SPI SS)!");
    while (1) { delay(500); }
  } else {
    Serial.println("✅ MFRC522 RFID & NFC reader online (Max Antenna Gain active)!");
  }

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
    // Quick startup beep
    toneFeedbackSuccess();
  } else {
    Serial.println("\n⚠️ Wi-Fi not connected. Check network credentials.");
  }

  Serial.println("\n👉 Olle Stamp Station ready! Tap your AuraBeads bracelet...\n");
}

void loop() {
  // Look for new cards
  if (!mfrc522.PICC_IsNewCardPresent()) {
    return;
  }

  // Select one of the cards
  if (!mfrc522.PICC_ReadCardSerial()) {
    return;
  }

  // Extract UID (supports both 4-byte Mifare and 7-byte NTAG215)
  String uidStr = "";
  for (byte i = 0; i < mfrc522.uid.size; i++) {
    if (mfrc522.uid.uidByte[i] < 0x10) uidStr += "0";
    uidStr += String(mfrc522.uid.uidByte[i], HEX);
  }
  uidStr.toUpperCase();

  // Halt PICC
  mfrc522.PICC_HaltA();
  mfrc522.PCD_StopCrypto1();

  // Debounce check
  if (uidStr != lastScannedUid || (millis() - lastScanTime > DEBOUNCE_DELAY)) {
    lastScannedUid = uidStr;
    lastScanTime = millis();

    Serial.println("\n-------------------------------------------");
    Serial.print("📍 AURA BEAD TAP DETECTED! UID: ");
    Serial.println(uidStr);
    Serial.print("Tag Size: ");
    Serial.print(mfrc522.uid.size);
    Serial.println(" bytes");

    // Send check-in to server
    bool success = sendCheckinToServer(uidStr);
    if (success) {
      Serial.println("🎉 DOL HAREUBANG STAMP CONFIRMED ON CLOUD!");
      toneFeedbackSuccess();
    } else {
      toneFeedbackError();
    }
  }

  delay(100);
}

#include <WiFiClientSecure.h>

bool sendCheckinToServer(String uid) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("❌ Wi-Fi disconnected. Cannot send checkin.");
    return false;
  }

  HTTPClient http;
  String url = String(serverBaseUrl) + "/api/checkin";

  WiFiClientSecure secureClient;
  if (url.startsWith("https://")) {
    secureClient.setInsecure(); // Allows HTTPS requests to Vercel without loading CA bundle
    http.begin(secureClient, url);
  } else {
    http.begin(url);
  }

  http.addHeader("Content-Type", "application/json");

  String jsonPayload = "{\"uid\":\"" + uid + "\",\"station\":\"" + String(STATION_ID) + "\"}";
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

// Chime on successful stamp
void toneFeedbackSuccess() {
  digitalWrite(LED_PIN, HIGH);
  digitalWrite(BUZZER_PIN, HIGH);
  delay(120);
  digitalWrite(BUZZER_PIN, LOW);
  delay(80);
  digitalWrite(BUZZER_PIN, HIGH);
  delay(180);
  digitalWrite(BUZZER_PIN, LOW);
  digitalWrite(LED_PIN, LOW);
}

// Low buzz on failure
void toneFeedbackError() {
  digitalWrite(LED_PIN, HIGH);
  digitalWrite(BUZZER_PIN, HIGH);
  delay(400);
  digitalWrite(BUZZER_PIN, LOW);
  digitalWrite(LED_PIN, LOW);
}
