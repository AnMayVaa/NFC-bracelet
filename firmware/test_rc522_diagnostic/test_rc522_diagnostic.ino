/*
  =============================================================================
  🧪 RC522 / HW-126 RFID & NFC Diagnostic Test Sketch
  Supports genuine NXP (0x91, 0x92) and FM17522 / Clone chips (0x82, 0x12, 0xB2)
  =============================================================================
  WIRING (ESP32 <--> RC522):
    3.3V  <--> ESP32 3V3 (3.3V ONLY!)
    RST   <--> ESP32 GPIO 22
    GND   <--> ESP32 GND
    IRQ   <--> (Leave empty)
    MISO  <--> ESP32 GPIO 19
    MOSI  <--> ESP32 GPIO 23
    SCK   <--> ESP32 GPIO 18
    SDA   <--> ESP32 GPIO 5 (SPI SS)
  =============================================================================
*/

#include <SPI.h>
#include <MFRC522.h>

#define SS_PIN    5
#define RST_PIN   22
#define BUZZER_PIN 4
#define LED_PIN    2

MFRC522 rfid(SS_PIN, RST_PIN);

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n==============================================");
  Serial.println("🧪 RC522 / HW-126 Hardware Diagnostic");
  Serial.println("==============================================");

  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);

  // Explicitly pull RST pin HIGH to ensure chip is awake from hard power-down
  pinMode(RST_PIN, OUTPUT);
  digitalWrite(RST_PIN, LOW);
  delay(10);
  digitalWrite(RST_PIN, HIGH);
  delay(50);

  // 1. Start SPI bus explicitly on ESP32 VSPI pins with stable 2MHz clock
  SPI.begin(18, 19, 23, 5); // SCK=18, MISO=19, MOSI=23, SS=5
  SPI.setFrequency(2000000); // 2 MHz for rock-solid signal over jumper wires
  delay(50);

  // 2. Initialize MFRC522
  rfid.PCD_Init();
  delay(50);

  // 3. Read Silicon Version
  byte v = rfid.PCD_ReadRegister(rfid.VersionReg);
  Serial.print("📡 Chip Version Register: 0x");
  Serial.println(v, HEX);

  if (v == 0x00 || v == 0xFF) {
    Serial.println("❌ SPI FAILURE: No communication with RC522!");
    Serial.println("👉 Check: 3.3V power, GND, and pin SDA -> GPIO 5.");
    while (1) { delay(500); }
  } else if (v == 0x82) {
    Serial.println("✅ SPI SUCCESS: Found FM17522 / HW-126 Clone chip (Version 0x82).");
  } else {
    Serial.printf("✅ SPI SUCCESS: Chip version 0x%02X.\n", v);
  }

  // 4. Force Antenna ON and verify RF transmitter
  byte txBefore = rfid.PCD_ReadRegister(rfid.TxControlReg);
  rfid.PCD_WriteRegister(rfid.TxControlReg, 0x83); // Force enable TX1 & TX2
  byte txAfter = rfid.PCD_ReadRegister(rfid.TxControlReg);
  Serial.printf("📶 Antenna TxControlReg: before=0x%02X, after=0x%02X\n", txBefore, txAfter);

  if ((txAfter & 0x03) == 0x03) {
    Serial.println("✅ RF Transmitter: ACTIVE (13.56 MHz carrier wave radiating)");
  } else {
    Serial.println("❌ Antenna Driver is OFF! (Registers are not writing).");
    Serial.println("👉 Check: Is pin RST wired to GPIO 22? Are header pins soldered?");
  }

  // 5. Maximize Antenna Gain for sensitive detection of small NFC stickers
  rfid.PCD_SetAntennaGain(rfid.RxGain_max);
  Serial.println("🚀 Antenna Gain: Set to MAXIMUM (48dB)");

  Serial.println("----------------------------------------------");
  Serial.println("👉 TEST STEP 1: Hold the BLUE RFID FOB against the white circle.");
  Serial.println("👉 TEST STEP 2: Hold the NFC STICKER against the white circle.");
  Serial.println("----------------------------------------------\n");
}

unsigned long lastHeartbeat = 0;

void loop() {
  // Print a heartbeat every 3 seconds so you know loop is running
  if (millis() - lastHeartbeat > 3000) {
    lastHeartbeat = millis();
    Serial.println("... scanning for card / NFC sticker ...");
  }

  // Check for card
  if (!rfid.PICC_IsNewCardPresent()) {
    delay(50);
    return;
  }

  // Read serial / UID
  if (!rfid.PICC_ReadCardSerial()) {
    delay(50);
    return;
  }

  // Tag Detected!
  digitalWrite(LED_PIN, HIGH);
  tone(BUZZER_PIN, 2000, 150);

  Serial.println("\n🎉 ==========================================");
  Serial.print("🏷️  CARD / NFC TAG DETECTED! UID: ");
  String uidStr = "";
  for (byte i = 0; i < rfid.uid.size; i++) {
    if (rfid.uid.uidByte[i] < 0x10) Serial.print("0");
    Serial.print(rfid.uid.uidByte[i], HEX);
    if (rfid.uid.uidByte[i] < 0x10) uidStr += "0";
    uidStr += String(rfid.uid.uidByte[i], HEX);
  }
  uidStr.toUpperCase();
  Serial.println();

  Serial.print("   UID Length: ");
  Serial.print(rfid.uid.size);
  Serial.print(" bytes");
  if (rfid.uid.size == 7) {
    Serial.println(" (NTAG213/215/216 NFC Tag!)");
  } else if (rfid.uid.size == 4) {
    Serial.println(" (Mifare Classic 1K RFID Card/Fob!)");
  } else {
    Serial.println();
  }

  MFRC522::PICC_Type piccType = rfid.PICC_GetType(rfid.uid.sak);
  Serial.print("   PICC Type: ");
  Serial.println(rfid.PICC_GetTypeName(piccType));
  Serial.println("==========================================\n");

  delay(200);
  digitalWrite(LED_PIN, LOW);

  // Halt card to allow re-detection
  rfid.PICC_HaltA();
  rfid.PCD_StopCrypto1();

  delay(1500); // 1.5s debounce before next scan
}
