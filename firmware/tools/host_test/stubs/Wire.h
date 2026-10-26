#pragma once
#include "Arduino.h"
struct TwoWire { void begin(int = -1, int = -1) {} };
extern TwoWire Wire;
