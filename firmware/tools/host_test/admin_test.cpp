#include "Arduino.h"
#define WIFI_SSID_LIST { "A" }
#define WIFI_PASSWORD "x"
#define SERVER_URL "https://example.test"
#define STATION_KEY ""
#include "admin.ino"
#include "common.h"
// scripted server: answers jobs as the sketch waits
int queueCode = 200; std::string queueBody = "{\"pendingWrite\":null}"; unsigned long queueDelay = 0;
std::vector<NetWorker::Job> scans;
bool serving = true;
void serve() {
  if (!serving || !NetWorker::jobs) return;
  static std::vector<std::pair<unsigned long, NetWorker::Job>> held;
  NetWorker::Job j;
  while (takeJob(j)) {
    if (j.kind == JOB_QUEUE_CHECK) held.push_back({g_now + queueDelay, j});
    else { if (j.kind == JOB_SCAN) scans.push_back(j); answer(j, 200, "{}"); }
  }
  for (size_t i = 0; i < held.size(); ) { if (g_now >= held[i].first) { answer(held[i].second, queueCode, queueBody.c_str()); held.erase(held.begin() + i); } else i++; }
}
std::string tagText() { // URI record payload from page 4
  if (g_tagMem[16] != 0x03) return "(none)";
  int n = g_tagMem[20]; std::string out = g_tagMem[21] == 0x55 ? (g_tagMem[22] == 4 ? "https://" : "") : "";
  int start = g_tagMem[21] == 0x55 ? 23 : 24; int len = g_tagMem[21] == 0x55 ? n - 1 : n - 3;
  for (int i = 0; i < len; i++) out += (char)g_tagMem[start + i]; return out;
}
void tap(const char* uid) { g_tagUid = uid; loop(); g_tagUid = ""; for (int i = 0; i < 300; i++) { loop(); serve(); } g_now += 3000; }
int main() {
  g_onDelay = serve;
  setup(); for (int i = 0; i < 10; i++) { loop(); serve(); }
  const std::string link = std::string(SERVER_URL) + "/04A1B2C3D4E5F6";

  puts("a. blank tag, nothing queued: default link written, ok sound, scan reported");
  memset(g_tagMem, 0, sizeof g_tagMem); g_sounds.clear(); scans.clear();
  tap("04A1B2C3D4E5F6");
  CHECK(tagText() == link); CHECK(heard("2900/170") && !heard("700")); CHECK(scans.size() == 1 && std::string(scans[0].body).find(link) != std::string::npos);

  puts("b. tag already right: no write, short read");
  g_sounds.clear(); scans.clear(); g_pageReads = 0;
  tap("04A1B2C3D4E5F6");
  CHECK(heard("2900/170")); printf("  page reads: %d (was 36 per read before)\n", g_pageReads); CHECK(g_pageReads <= 14);

  puts("c. custom write queued on the web page: written and reported as wrote");
  queueBody = "{\"pendingWrite\":\"hello\"}"; g_sounds.clear(); scans.clear();
  tap("04A1B2C3D4E5F6");
  CHECK(g_tagMem[21] == 0x54); CHECK(scans.size() == 1 && std::string(scans[0].body).find("\"wrote\":\"hello\"") != std::string::npos); CHECK(heard("2900/170"));

  puts("d. server doesn't answer the queue check: nothing written, low buzz");
  queueBody = "{\"pendingWrite\":null}"; memset(g_tagMem, 0, sizeof g_tagMem); queueCode = -1; g_sounds.clear();
  tap("04A1B2C3D4E5F6");
  CHECK(tagText() == "(none)"); CHECK(heard("700/380") && !heard("2900"));

  puts("e. queue answer too slow (8 s): nothing written, the late answer is dropped cleanly");
  queueCode = 200; queueDelay = 8000; g_sounds.clear();
  tap("04A1B2C3D4E5F6");
  CHECK(tagText() == "(none)"); CHECK(heard("700/380"));
  g_now += 9000; for (int i = 0; i < 20; i++) { serve(); loop(); }
  CHECK(netBusy == 0);
  queueDelay = 0; g_sounds.clear(); tap("04A1B2C3D4E5F6"); CHECK(tagText() == link && heard("2900/170"));

  puts("f. offline: default link written (as before), no server calls");
  g_online = false; memset(g_tagMem, 0, sizeof g_tagMem); scans.clear(); g_sounds.clear();
  tap("04A1B2C3D4E5F6"); CHECK(tagText() == link && scans.empty());
  g_online = true;

  printf(fails ? "ADMIN: %d FAILED\n" : "ADMIN: all passed\n", fails);
  return fails != 0;
}
