#pragma once
#include "Arduino.h"
enum HTTPMethod { HTTP_GET, HTTP_POST, HTTP_ANY };
struct WebServer { WebServer(int) {} String arg(const String&) { return ""; } void begin() {} void handleClient() {} void stop() {}
  void on(const String&, std::function<void()>) {} void on(const String&, HTTPMethod, std::function<void()>) {} void onNotFound(std::function<void()>) {}
  void send(int, const String& = String(), const String& = String()) {} void sendHeader(const String&, const String&) {} };
