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
const char* ssid     = "BUNDAOBUNTAI";
const char* password = "ohm12345";

// --- Server Configuration ---
// Live Vercel Production Domain:
const char* serverBaseUrl = "https://smart-nfc-bracelet.vercel.app";

// --- PN532 I2C Setup ---
#define SDA_PIN 21
#define SCL_PIN 22
#define BUZZER_PIN 4
#define LED_PIN    2
Adafruit_PN532 nfc(SDA_PIN, SCL_PIN);

// State tracking
String lastScannedUid = "";
unsigned long lastScanTime = 0;
const unsigned long DEBOUNCE_DELAY = 2500; // 2.5s debounce

void setup() {
  Serial.begin(115200);
  delay(1000);

  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);
  digitalWrite(LED_PIN, LOW);

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

String queuedWriteContent = ""; // Custom content queued from Serial or Web

// Function to read NDEF memory contents (Text or URL) from NTAG213/215/216
String readNtagContent() {
  uint8_t data[4];
  uint8_t buffer[96];
  memset(buffer, 0, sizeof(buffer));

  // Read pages 4 to 23 (80 bytes of user memory)
  bool readAny = false;
  for (uint8_t page = 4; page < 24; page++) {
    if (nfc.ntag2xx_ReadPage(page, data)) {
      readAny = true;
      memcpy(&buffer[(page - 4) * 4], data, 4);
    } else {
      break;
    }
  }

  if (!readAny) return "(Could not read memory pages)";

  // Parse NDEF TLV (Type 0x03)
  if (buffer[0] == 0x03) {
    // 1. URI Record ('U' = 0x55)
    if (buffer[2] == 0xD1 && buffer[5] == 0x55) {
      uint8_t prefixCode = buffer[6];
      String url = "";
      if (prefixCode == 0x01) url = "http://www.";
      else if (prefixCode == 0x02) url = "https://www.";
      else if (prefixCode == 0x03) url = "http://";
      else if (prefixCode == 0x04) url = "https://";

      uint8_t payloadLen = buffer[4];
      for (int i = 1; i < payloadLen; i++) {
        if (6 + i >= sizeof(buffer)) break;
        char c = (char)buffer[6 + i];
        if (c == (char)0xFE || c == 0) break;
        url += c;
      }
      return url;
    }
    // 2. Text Record ('T' = 0x54)
    else if (buffer[2] == 0xD1 && buffer[5] == 0x54) {
      uint8_t statusByte = buffer[6];
      uint8_t langLen = statusByte & 0x1F;
      uint8_t payloadLen = buffer[4];
      String text = "";
      for (int i = 1 + langLen; i < payloadLen; i++) {
        if (6 + i >= sizeof(buffer)) break;
        char c = (char)buffer[6 + i];
        if (c == (char)0xFE || c == 0) break;
        text += c;
      }
      return text;
    }
  }

  // Fallback: return printable ASCII
  String raw = "";
  for (int i = 0; i < 80; i++) {
    if (buffer[i] >= 32 && buffer[i] <= 126) {
      raw += (char)buffer[i];
    }
  }
  return raw.length() > 0 ? raw : "(Blank Tag / Unformatted)";
}

// Function to burn NDEF URL or custom text onto NTAG213/215/216 tags
bool writeNdefUrlToNtag(String content) {
  // Check Page 3 (Capability Container - CC) first.
  // On factory NTAG stickers, Page 3 is OTP (One Time Programmable) or locked.
  // Writing to Page 3 if already programmed causes NTAG to NAK and enter HALT state!
  // Therefore: only write CC if Page 3 byte 0 is not 0xE1.
  uint8_t page3[4];
  if (nfc.ntag2xx_ReadPage(3, page3)) {
    if (page3[0] != 0xE1) {
      Serial.print("   Formatting CC on Page 3... ");
      uint8_t cc[4] = { 0xE1, 0x10, 0x6D, 0x00 };
      if (nfc.ntag2xx_WritePage(3, cc)) {
        Serial.println("OK");
      } else {
        Serial.println("Skipped/Locked");
      }
      delay(10);
    } else {
      Serial.println("   Page 3 CC valid (0xE1). Preserving factory CC.");
    }
  }

  bool isUrl = content.startsWith("http://") || content.startsWith("https://");
  String domainAndPath = content;
  uint8_t prefixCode = 0x00; // No prefix

  if (content.startsWith("https://www.")) {
    prefixCode = 0x02;
    domainAndPath = content.substring(12);
  } else if (content.startsWith("https://")) {
    prefixCode = 0x04;
    domainAndPath = content.substring(8);
  } else if (content.startsWith("http://")) {
    prefixCode = 0x03;
    domainAndPath = content.substring(7);
  }

  uint8_t strLen = domainAndPath.length();
  uint8_t buffer[128];
  memset(buffer, 0, sizeof(buffer));

  uint8_t totalBytes = 0;

  if (isUrl) {
    // NDEF URI Record ('U')
    buffer[0] = 0x03;               // NDEF TLV Type
    buffer[1] = 5 + strLen;         // NDEF Length
    buffer[2] = 0xD1;               // Header (MB=1, ME=1, SR=1, TNF=0x01)
    buffer[3] = 0x01;               // Type Length: 1 ('U')
    buffer[4] = 1 + strLen;         // Payload Length
    buffer[5] = 0x55;               // Type: 'U'
    buffer[6] = prefixCode;         // Prefix identifier (0x04 for https://)
    for (int i = 0; i < strLen; i++) {
      buffer[7 + i] = domainAndPath.charAt(i);
    }
    buffer[7 + strLen] = 0xFE;      // Terminator TLV
    totalBytes = 8 + strLen;
  } else {
    // NDEF Text Record ('T')
    String lang = "en";
    buffer[0] = 0x03;
    buffer[1] = 7 + strLen;
    buffer[2] = 0xD1;
    buffer[3] = 0x01;
    buffer[4] = 3 + strLen;
    buffer[5] = 0x54;               // Type: 'T'
    buffer[6] = 0x02;               // Status: en (2 bytes)
    buffer[7] = 'e';
    buffer[8] = 'n';
    for (int i = 0; i < strLen; i++) {
      buffer[9 + i] = domainAndPath.charAt(i);
    }
    buffer[9 + strLen] = 0xFE;
    totalBytes = 10 + strLen;
  }

  uint8_t pagesCount = (totalBytes + 3) / 4;
  bool allSuccess = true;

  Serial.printf("   Writing %d bytes across %d pages (Pages 4 to %d)...\n", totalBytes, pagesCount, 3 + pagesCount);

  for (uint8_t p = 0; p < pagesCount; p++) {
    uint8_t pageBuf[4];
    for (int b = 0; b < 4; b++) {
      int idx = p * 4 + b;
      pageBuf[b] = (idx < totalBytes) ? buffer[idx] : 0x00;
    }
    if (nfc.ntag2xx_WritePage(4 + p, pageBuf)) {
      Serial.printf("   [Page %d] OK\n", 4 + p);
    } else {
      Serial.printf("   [Page %d] FAIL\n", 4 + p);
      allSuccess = false;
      break;
    }
    delay(10); // Crucial 10ms EEPROM write-cycle delay for NTAG silicon
  }

  return allSuccess;
}

void loop() {
  // Check for custom write command from Serial Monitor (e.g. Type "W:https://example.com" or "W:Hello")
  if (Serial.available()) {
    String cmd = Serial.readStringUntil('\n');
    cmd.trim();
    if (cmd.startsWith("W:") || cmd.startsWith("w:")) {
      queuedWriteContent = cmd.substring(2);
      Serial.println("\n----------------------------------------------");
      Serial.print("✍️ QUEUED CUSTOM WRITE: \"");
      Serial.print(queuedWriteContent);
      Serial.println("\"");
      Serial.println("👉 Hold NFC sticker near PN532 to burn this content!");
      Serial.println("----------------------------------------------\n");
    }
  }

  uint8_t success;
  uint8_t uid[] = { 0, 0, 0, 0, 0, 0, 0 };
  uint8_t uidLength;

  // Scan for 13.56MHz tag
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

      Serial.println("\n==============================================");
      Serial.print("🏷️  NFC TAG DETECTED! UID: ");
      Serial.println(uidStr);
      Serial.print("Tag Length: ");
      Serial.print(uidLength);
      Serial.println(" bytes (NTAG215)");

      // 1. Prepare Content to Write
      String contentToWrite = queuedWriteContent;
      if (contentToWrite.length() == 0) {
        // Default target URL for smartphone tap:
        contentToWrite = "https://smart-nfc-bracelet.vercel.app/" + uidStr;
      }

      // 2. WRITE Tag Memory
      if (uidLength == 7) {
        Serial.print("✍️ Writing Target URL: ");
        Serial.println(contentToWrite);
        if (writeNdefUrlToNtag(contentToWrite)) {
          Serial.println("✅ SUCCESS! URL burned into NFC tag memory.");
          Serial.println("📱 👉 Tap this tag on your phone to open the mobile dashboard!");
          if (queuedWriteContent.length() > 0) {
            queuedWriteContent = ""; // Reset custom write queue
          }
        } else {
          Serial.println("⚠️ Write failed. Retrying on next tap.");
        }
      }

      // 3. READ BACK & VERIFY Memory Contents from the physical chip
      Serial.println("📖 Reading & Verifying Tag Memory...");
      String verifiedContent = readNtagContent();
      Serial.print("📄 VERIFIED TAG CONTENT: ");
      Serial.println(verifiedContent);

      // 4. Send UID and Verified Content to Admin Center on Vercel
      sendAdminScanToServer(uidStr, verifiedContent);
      
      // Feedback: Flash LED and sound chime
      digitalWrite(LED_PIN, HIGH);
      tone(BUZZER_PIN, 1800, 120);
      delay(140);
      tone(BUZZER_PIN, 2400, 200);
      delay(500);
      noTone(BUZZER_PIN);
      digitalWrite(LED_PIN, LOW);

      Serial.println("==============================================");
    }
  }

  delay(100);
}

#include <WiFiClientSecure.h>

void sendAdminScanToServer(String uid, String content) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("⚠️ Cannot send: Wi-Fi disconnected");
    return;
  }

  HTTPClient http;
  String url = String(serverBaseUrl) + "/api/admin/scan";

  WiFiClientSecure secureClient;
  if (url.startsWith("https://")) {
    secureClient.setInsecure();
    http.begin(secureClient, url);
  } else {
    http.begin(url);
  }

  http.addHeader("Content-Type", "application/json");

  // Send UID and read content
  String escapedContent = content;
  escapedContent.replace("\"", "\\\"");
  String jsonPayload = "{\"uid\":\"" + uid + "\",\"content\":\"" + escapedContent + "\"}";
  int httpResponseCode = http.POST(jsonPayload);

  if (httpResponseCode > 0) {
    Serial.print("📡 Server Response [");
    Serial.print(httpResponseCode);
    Serial.println("]: Tag UID & Content pushed to Admin Web!");
  } else {
    Serial.print("❌ HTTP POST Failed. Error: ");
    Serial.println(http.errorToString(httpResponseCode).c_str());
  }

  http.end();
}
