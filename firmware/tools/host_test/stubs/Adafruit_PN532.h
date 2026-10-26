#pragma once
#include "Wire.h"
#define PN532_MIFARE_ISO14443A 0
extern std::string g_tagUid;   // hex of the tag on the reader, "" = none
extern uint8_t g_tagMem[200];  // NTAG pages from 0
extern int g_pageReads;
struct Adafruit_PN532 { Adafruit_PN532(uint8_t, uint8_t, TwoWire* = &Wire) {} bool begin() { return true; } uint32_t getFirmwareVersion() { return 0x32010607; } bool SAMConfig() { return true; }
  bool readPassiveTargetID(uint8_t, uint8_t* uid, uint8_t* len, uint16_t t = 0) { if (g_tagUid.empty()) { g_now += t; return false; } *len = g_tagUid.size() / 2; for (int i = 0; i < *len; i++) uid[i] = strtol(g_tagUid.substr(i * 2, 2).c_str(), 0, 16); return true; }
  uint8_t ntag2xx_ReadPage(uint8_t p, uint8_t* b) { g_pageReads++; g_now += 15; memcpy(b, g_tagMem + p * 4, 4); return 1; }
  uint8_t ntag2xx_WritePage(uint8_t p, uint8_t* b) { g_now += 15; memcpy(g_tagMem + p * 4, b, 4); return 1; } };
