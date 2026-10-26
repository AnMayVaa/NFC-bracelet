#pragma once
#include "WiFi.h"
struct DNSServer { void processNextRequest() {} template <class... A> bool start(A...) { return true; } void stop() {} };
