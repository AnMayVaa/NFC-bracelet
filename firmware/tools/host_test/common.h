unsigned long g_now = 1000;
std::vector<std::string> g_sounds;
std::function<void()> g_onDelay;
bool g_online = true;
std::string g_tagUid;
uint8_t g_tagMem[200];
int g_pageReads = 0;
SerialT Serial; EspT ESP; WiFiT WiFi; TwoWire Wire;
int fails = 0;
#define CHECK(c) do { if (!(c)) { printf("  FAIL line %d: %s\n", __LINE__, #c); fails++; } } while (0)
bool takeJob(NetWorker::Job& j) { return xQueueReceive(NetWorker::jobs, &j, 0); }
void answer(const NetWorker::Job& j, int code, const char* body, bool retried = false) {
  NetWorker::Reply r; memset(&r, 0, sizeof r); r.kind = j.kind; r.at = j.at; strlcpy(r.uid, j.uid, 24); r.code = code; r.retried = retried; strlcpy(r.body, body, 400);
  NetWorker::lastSentAt = g_now; xQueueSend(NetWorker::replies, &r, 0);
}
bool heard(const char* f) { for (auto& s : g_sounds) if (s.rfind(f, 0) == 0) return true; return false; }
int jobsWaiting() { return NetWorker::jobs->size() - 1; }
