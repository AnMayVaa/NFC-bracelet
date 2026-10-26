#pragma once
#include "Arduino.h"
struct Preferences { bool begin(const char*, bool = false) { return true; } void end() {} void clear() {}
  String getString(const char*, const String& d = String()) { return d; } int getInt(const char*, int d = 0) { return d; } size_t putString(const char*, const String&) { return 0; } size_t putInt(const char*, int) { return 0; } };
