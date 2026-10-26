#pragma once
#include "WiFi.h"
#define HTTPC_ERROR_READ_TIMEOUT (-11)
struct HTTPClient { bool begin(WiFiClient&, String) { return true; } void setReuse(bool) {} void setConnectTimeout(int32_t) {} void setTimeout(uint16_t) {}
  void addHeader(const String&, const String&) {} int POST(uint8_t*, size_t) { return -1; } int GET() { return -1; } String getString() { return ""; } static String errorToString(int) { return "err"; } void end() {} };
