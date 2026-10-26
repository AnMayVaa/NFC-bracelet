/*
  net_worker.h — Jeju wish-band: server calls off the tap path
  -----------------------------------------------------------------------------
  The reader loop never waits for the internet. It hands each request to a small
  background task (core 0) and keeps polling the reader; the answer comes back
  later through NetWorker::poll().

  Speed tricks
    - One HTTPS connection is kept open and reused (HTTP keep-alive), so a tap
      costs one round trip instead of a fresh TLS handshake (1-3 s on an ESP32).
    - If a reused connection turns out to be dead, it reconnects and tries once more.
    - The sketch sends a cheap request every few seconds while idle, which keeps
      the connection open and the server warm.

  Same file in every sketch folder (Arduino only compiles files next to the .ino).
  -----------------------------------------------------------------------------
*/
#pragma once

#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>

namespace NetWorker {

struct Job {
  uint8_t kind;          // the sketch's own job type
  uint32_t at;           // millis() when the tap happened
  char uid[24];
  char path[40];
  char body[320];        // empty = GET, else POST this JSON
};

struct Reply {
  uint8_t kind;
  uint32_t at;
  char uid[24];
  int code;              // HTTP status, or < 0 for no answer (offline, timeout)
  bool retried;          // sent a second time on a fresh link: the first may have reached the server
  char body[400];
};

QueueHandle_t jobs = nullptr;
QueueHandle_t replies = nullptr;
WiFiClientSecure tls;
WiFiClient plain;
HTTPClient http;
volatile uint32_t lastSentAt = 0;   // millis() of the last finished request

int sendOnce(const Job& j, String& res) {
  String url = String(SERVER_URL) + j.path;
  if (url.startsWith("https://")) http.begin(tls, url);
  else http.begin(plain, url);
  http.setReuse(true);
  http.setConnectTimeout(4000);
  http.setTimeout(5000);
  http.addHeader("Content-Type", "application/json");
  if (strlen(STATION_KEY) > 0) http.addHeader("X-Station-Key", STATION_KEY);
  int code = j.body[0] ? http.POST((uint8_t*)j.body, strlen(j.body)) : http.GET();
  res = code > 0 ? http.getString() : http.errorToString(code);
  http.end();                        // keeps the socket open for the next request
  if (code < 0) { tls.stop(); plain.stop(); }
  return code;
}

void task(void*) {
  Job j;
  Reply r;
  String res;
  for (;;) {
    if (xQueueReceive(jobs, &j, portMAX_DELAY) != pdTRUE) continue;
    int code = -1;
    res = "offline";
    r.retried = false;
    if (WiFi.status() == WL_CONNECTED) {
      bool reused = tls.connected() || plain.connected();
      code = sendOnce(j, res);
      // The server had closed the idle link. A read timeout is not retried: the server may still be working on it.
      r.retried = code < 0 && reused && code != HTTPC_ERROR_READ_TIMEOUT;
      if (r.retried) code = sendOnce(j, res);
    }
    r.kind = j.kind;
    r.at = j.at;
    r.code = code;
    strlcpy(r.uid, j.uid, sizeof(r.uid));
    strlcpy(r.body, res.c_str(), sizeof(r.body));
    lastSentAt = millis();
    xQueueSend(replies, &r, portMAX_DELAY);
  }
}

void begin() {
  jobs = xQueueCreate(8, sizeof(Job));
  replies = xQueueCreate(8, sizeof(Reply));
  tls.setInsecure();
  tls.setHandshakeTimeout(8);        // seconds
#if CONFIG_FREERTOS_UNICORE
  xTaskCreate(task, "net", 10240, nullptr, 1, nullptr);
#else
  xTaskCreatePinnedToCore(task, "net", 10240, nullptr, 1, nullptr, 0);
#endif
}

// Hands a request to the background task. Returns false if its queue is full.
bool submit(uint8_t kind, const String& uid, uint32_t at, const char* path, const String& body) {
  Job j;
  j.kind = kind;
  j.at = at;
  strlcpy(j.uid, uid.c_str(), sizeof(j.uid));
  strlcpy(j.path, path, sizeof(j.path));
  strlcpy(j.body, body.c_str(), sizeof(j.body));
  return xQueueSend(jobs, &j, 0) == pdTRUE;
}

// Next answer from the server, if one is ready. Never waits.
bool poll(Reply& r) { return xQueueReceive(replies, &r, 0) == pdTRUE; }

}  // namespace NetWorker
