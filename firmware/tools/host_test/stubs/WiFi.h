#pragma once
#include "Arduino.h"
struct IPAddress { String toString() const { return "10.0.0.2"; } };
enum { WL_CONNECTED = 3, WL_DISCONNECTED = 6, WIFI_SCAN_RUNNING = -1, WIFI_STA = 1, WIFI_AP_STA = 3, WIFI_AP = 2, WIFI_AUTH_OPEN = 0 };
typedef int wifi_power_t;
#define WIFI_POWER_15dBm 60
extern bool g_online;
struct WiFiT {
  int status() { return g_online ? WL_CONNECTED : WL_DISCONNECTED; } IPAddress localIP() { return {}; } int RSSI(int = 0) { return -50; } String SSID(int = 0) { return "Net"; }
  template <class... A> int begin(A...) { return 0; } template <class... A> bool disconnect(A...) { return true; } bool mode(int) { return true; }
  int encryptionType(int) { return 0; } void persistent(bool) {} int scanComplete() { return 0; } void scanDelete() {} template <class... A> int scanNetworks(A...) { return 0; }
  void setAutoReconnect(bool) {} bool setTxPower(wifi_power_t) { return true; } template <class... A> bool softAP(A...) { return true; } IPAddress softAPIP() { return {}; } template <class... A> bool softAPdisconnect(A...) { return true; }
};
extern WiFiT WiFi;
struct WiFiClient { bool connected() { return false; } void stop() {} };
