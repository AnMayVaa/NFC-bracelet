#pragma once
#include <string>
#include <cstring>
#include <cstdint>
#include <cstdlib>
#include <cstdio>
#include <cctype>
#include <functional>
#include <deque>
#include <vector>
#include <algorithm>
#define F(x) x
#define HIGH 1
#define LOW 0
#define OUTPUT 1
#define INPUT 0
#define INPUT_PULLUP 2
inline int digitalRead(int) { return 1; }
#define HEX 16
typedef uint8_t byte;
using std::min; using std::max;
class String {
 public:
  std::string s;
  String() {}
  String(const char* c) : s(c ? c : "") {}
  String(const std::string& c) : s(c) {}
  String(char c) : s(1, c) {}
  String(int v, int base = 10) { char b[40]; snprintf(b, 40, base == 16 ? "%x" : "%d", v); s = b; }
  String(unsigned v, int base = 10) { char b[40]; snprintf(b, 40, base == 16 ? "%x" : "%u", v); s = b; }
  String(long v) { s = std::to_string(v); }
  String(unsigned long v) { s = std::to_string(v); }
  String(uint8_t v, int base) { char b[8]; snprintf(b, 8, base == 16 ? "%x" : "%u", v); s = b; }
  unsigned length() const { return s.size(); }
  const char* c_str() const { return s.c_str(); }
  char operator[](int i) const { return s[i]; }
  String& operator+=(const String& o) { s += o.s; return *this; }
  String& operator+=(const char* o) { s += o; return *this; }
  String& operator+=(char o) { s += o; return *this; }
  bool operator==(const String& o) const { return s == o.s; }
  bool operator!=(const String& o) const { return s != o.s; }
  bool operator==(const char* o) const { return s == o; }
  bool operator!=(const char* o) const { return s != o; }
  int indexOf(const String& x, int from = 0) const { auto p = s.find(x.s, from); return p == std::string::npos ? -1 : (int)p; }
  int indexOf(char x, int from = 0) const { auto p = s.find(x, from); return p == std::string::npos ? -1 : (int)p; }
  int lastIndexOf(char x) const { auto p = s.rfind(x); return p == std::string::npos ? -1 : (int)p; }
  String substring(int a) const { return s.substr(a); }
  String substring(int a, int b) const { return s.substr(a, b - a); }
  bool startsWith(const String& x) const { return s.rfind(x.s, 0) == 0; }
  void trim() { while (!s.empty() && isspace(s.back())) s.pop_back(); while (!s.empty() && isspace(s[0])) s.erase(0, 1); }
  void toLowerCase() { for (auto& c : s) c = tolower(c); }
  void toUpperCase() { for (auto& c : s) c = toupper(c); }
  void replace(const String& a, const String& b) { size_t p = 0; while ((p = s.find(a.s, p)) != std::string::npos) { s.replace(p, a.s.size(), b.s); p += b.s.size(); } }
  long toInt() const { return atol(s.c_str()); }
};
inline String operator+(const String& a, const String& b) { return String(a.s + b.s); }
inline String operator+(const String& a, const char* b) { return String(a.s + b); }
inline String operator+(const char* a, const String& b) { return String(std::string(a) + b.s); }
inline String operator+(const String& a, char b) { return String(a.s + b); }
extern unsigned long g_now;
extern std::vector<std::string> g_sounds;
inline unsigned long millis() { return g_now; }
extern std::function<void()> g_onDelay;
inline void delay(unsigned long ms) { g_now += ms; if (g_onDelay) g_onDelay(); }
inline void pinMode(int, int) {}
inline void digitalWrite(int, int) {}
inline void tone(int, unsigned f, unsigned long ms = 0) { g_sounds.push_back(std::to_string(f) + "/" + std::to_string(ms)); }
struct SerialT { void begin(long) {} int available() { return 0; } String readStringUntil(char) { return ""; }
  template <class... A> void printf(const char* f, A... a) { if (getenv("V")) ::printf(f, a...); }
  void print(const String& x) { if (getenv("V")) ::printf("%s", x.c_str()); } void println(const String& x) { if (getenv("V")) ::printf("%s\n", x.c_str()); } void println() {} };
extern SerialT Serial;
struct EspT { void restart() {} };
extern EspT ESP;
typedef std::deque<std::vector<char>>* QueueHandle_t;
typedef int BaseType_t;
#define pdTRUE 1
#define portMAX_DELAY 0xffffffff
#define CONFIG_FREERTOS_UNICORE 0
extern int g_itemSize[2]; extern int g_qn;
inline QueueHandle_t xQueueCreate(int n, int size) { auto q = new std::deque<std::vector<char>>(); q->push_back(std::vector<char>(1, (char)n)); q->front().resize(size + 1); q->front()[0] = n; return q; }
// first element stores capacity + item size
inline BaseType_t xQueueSend(QueueHandle_t q, const void* v, uint32_t) { int cap = q->front()[0]; int sz = q->front().size() - 1; if ((int)q->size() - 1 >= cap) return 0; q->push_back(std::vector<char>((const char*)v, (const char*)v + sz)); return 1; }
inline BaseType_t xQueueReceive(QueueHandle_t q, void* v, uint32_t) { if (q->size() <= 1) return 0; auto it = q->begin() + 1; memcpy(v, it->data(), it->size()); q->erase(it); return 1; }
inline BaseType_t xTaskCreatePinnedToCore(void (*)(void*), const char*, int, void*, int, void*, int) { return 1; }
inline size_t strlcpy(char* d, const char* s, size_t n) { size_t l = strlen(s); if (n) { size_t c = l < n - 1 ? l : n - 1; memcpy(d, s, c); d[c] = 0; } return l; }
