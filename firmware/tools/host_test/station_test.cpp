#include "Arduino.h"
#define WIFI_SSID_LIST { "A" }
#define WIFI_PASSWORD "x"
#define SERVER_URL "https://example.test"
#define STATION_KEY ""
#include SKETCH
#include "common.h"
void runFor(unsigned long ms) { unsigned long end = g_now + ms; while (g_now < end) loop(); }
// put the band on the reader for one loop, then lift it
void tap(const char* uid) { g_tagUid = uid; loop(); g_tagUid = ""; runFor(500); }
// Answer the heartbeat that keeps the link warm, so jobs below are the tap's.
void drainHeartbeats() { NetWorker::Job j; while (jobsWaiting()) { takeJob(j); if (j.kind != JOB_HEARTBEAT) { printf("  unexpected job %s\n", j.path); fails++; } answer(j, 200, "{}"); } loop(); }
int main() {
  setup(); loop(); drainHeartbeats();
  NetWorker::Job j;

  puts("1. new stamp: instant beep, second note after the server says ok");
  g_sounds.clear(); g_tagUid = "04AABBCCDDEEFF"; loop(); g_tagUid = "";
  CHECK(g_sounds.size() == 1 && g_sounds[0] == "2200/90");
  CHECK(takeJob(j) && j.kind == JOB_CHECKIN && std::string(j.path) == "/api/checkin" && std::string(j.body).find("\"station\":\"" STATION_TEST "\"") != std::string::npos);
  runFor(500);
  answer(j, 200, "{\"success\":true,\"duplicate\":false,\"voucherUnlocked\":false,\"sosTriggered\":false}"); loop();
  CHECK(heard("2900/150")); CHECK(netBusy == 0 && pendingCount == 0);

  puts("2. duplicate: short same-pitch beep; duplicate after a retry counts as saved");
  g_sounds.clear(); g_now += 13000; tap("04AABBCCDDEE11"); takeJob(j); answer(j, 200, "{\"duplicate\":true}"); loop();
  CHECK(heard("2600/50") && !heard("2900"));
  g_sounds.clear(); g_now += 13000; tap("04AABBCCDDEE22"); takeJob(j); answer(j, 200, "{\"duplicate\":true}", true); loop();
  CHECK(heard("2900/150") && !heard("2600/50"));

  puts("3. voucher fanfare");
  g_sounds.clear(); g_now += 13000; tap("04AABBCCDDEE33"); takeJob(j); answer(j, 200, "{\"voucherUnlocked\":true}"); loop();
  CHECK(heard("3400/280"));

  puts("4. server refuses (4xx): low buzz, not queued");
  g_sounds.clear(); g_now += 13000; tap("04AABBCCDDEE44"); takeJob(j); answer(j, 401, "bad key"); loop();
  CHECK(heard("700/380") && pendingCount == 0);

  puts("5. no answer: two quick beeps, queued, replayed quietly, removed when delivered");
  g_sounds.clear(); g_now += 13000; tap("04AABBCCDDEE55"); takeJob(j); answer(j, -11, "timeout"); loop();
  CHECK(heard("2400/60") && pendingCount == 1);
  CHECK(takeJob(j) && j.kind == JOB_QUEUED_CHECKIN && std::string(j.uid) == "04AABBCCDDEE55");
  answer(j, -1, "refused"); loop();
  CHECK(pendingCount == 1 && jobsWaiting() == 0);          // waits 10 s before trying again
  runFor(5000); CHECK(jobsWaiting() == 0);
  runFor(6000); CHECK(takeJob(j) && j.kind == JOB_QUEUED_CHECKIN);
  g_sounds.clear(); answer(j, 200, "{\"duplicate\":false}"); loop();
  CHECK(pendingCount == 0 && g_sounds.empty());

  puts("6. offline tap: queued at once, sent when Wi-Fi is back");
  g_online = false; g_sounds.clear(); g_now += 13000; tap("04AABBCCDDEE66");
  CHECK(heard("2200/90") && heard("2400/60") && pendingCount == 1 && jobsWaiting() == 0);
  g_online = true; loop();
  CHECK(takeJob(j) && j.kind == JOB_QUEUED_CHECKIN && std::string(j.uid) == "04AABBCCDDEE66");

  puts("7. SOS arriving while a queued tap is out: the right item is removed");
  for (int i = 0; i < 4; i++) tap("04AABBCCDDEE77");      // tap 1 = check-in job, 2-4 = ticks
  NetWorker::Job first; takeJob(first); CHECK(first.kind == JOB_CHECKIN);
  g_sounds.clear(); tap("04AABBCCDDEE77");                // 5th tap = SOS
  CHECK(heard("3000/140"));
  NetWorker::Job sos; takeJob(sos); CHECK(sos.kind == JOB_SOS && std::string(sos.path) == "/api/sos/band");
  answer(sos, -1, "x"); loop();                           // SOS not delivered: goes to the front of the queue
  CHECK(pendingCount == 2 && pending[0].startsWith("SOS:04AABBCCDDEE77"));
  answer(j, 200, "{}"); answer(first, 200, "{}"); loop(); // replay of ...66 delivered
  CHECK(pendingCount == 1 && pending[0].startsWith("SOS:"));
  loop(); CHECK(takeJob(j) && j.kind == JOB_QUEUED_SOS && std::string(j.body).find("\"taps\":5") != std::string::npos);
  answer(j, 200, "{\"sosTriggered\":true}"); loop();
  CHECK(pendingCount == 0 && netBusy == 0);

  puts("8. heartbeat every 30 s while idle, never while a tap waits");
  drainHeartbeats(); runFor(29000); CHECK(jobsWaiting() == 0);
  runFor(2000); CHECK(takeJob(j) && j.kind == JOB_HEARTBEAT && std::string(j.body).find("\"ssid\":\"Net\"") != std::string::npos);
  answer(j, 200, "{}"); loop();
  g_now += 13000; tap("04AABBCCDDEE88"); runFor(40000);
  CHECK(jobsWaiting() == 1);                               // only the tap: heartbeat held back
  takeJob(j); answer(j, 200, "{}"); loop();

  printf(fails ? "STATION %s: %d FAILED\n" : "STATION %s: all passed\n", SKETCH, fails);
  return fails != 0;
}
