# 🍊 Jeju wish-band: Travel + Connect + Protect

A smart basalt-bead wristband for Jeju visitors. Tap the band on a phone to open a personal travel app with **AI picks** for local food, hidden places and activities. Tap it at wish-band stations to collect stamps and leave a **last-known location** for safety. The **Helping Map** and **SOS** button connect tourists to help, and the admin desk sees everything live.

| Part | What it does |
| :--- | :--- |
| 📱 Tourist app (`/<UID>`) | **For You**: map + AI picks (diet-safe, UV-aware, boosts local and quiet spots) · **SOS**: hold-to-send SOS, hotlines, Helping Map, help near you · **Stamps**: route map, passport, 4,000 KRW Dongmun Market voucher · **Me**: profile and demo tools |
| 🏢 Admin desk (`/admin`) | Issue and register bands, write NFC tags, SOS queue (acknowledge, dispatch, resolve), station health, live log, evaluation metrics |
| 📟 `firmware/admin` | ESP32 + PN532 desk reader: reads the tag, writes the tourist link, reports to the admin desk |
| 🍊 `firmware/food` · 🗿 `firmware/place` · 🌊 `firmware/activity` | ESP32 stations (MFRC522 by default, PN532 optional): each tap gives a stamp of that kind |

---

## 1. Run it

```bash
npm install
npm start            # http://localhost:3000
npm test             # core rules: stamps, voucher, diet filter, SOS flow, migration
```

- Tourist app: http://localhost:3000/BEAD_001 (any tag UID works as the path)
- Admin desk: http://localhost:3000/admin, then press **Load demo tags**
- Live site: https://smart-nfc-bracelet.vercel.app (Vercel uses `api/index.js`)

The tourist app has **Demo tools** under the *Me* tab to simulate taps without hardware.

### Environment variables (all optional)

| Variable | Default | Meaning |
| :--- | :--- | :--- |
| `PUBLIC_URL` | `https://smart-nfc-bracelet.vercel.app` | Base of the link written onto tags |
| `MERCHANT_PIN` | `4000` | PIN the market vendor types to redeem a voucher |
| `STATION_KEY` | empty | If set, ESP32s must send it as `X-Station-Key` (put the same value in `secrets.h`) |
| `ADMIN_PIN` | empty | If set, the admin desk asks for it |
| `DEMO_MODE` | `true` | `false` hides demo tools, simulated taps, wipe and restore |
| `UV_OVERRIDE` | empty | Force a UV index (for demos); otherwise live UV from Open-Meteo |

---

## 2. Project structure

```
lib/
  core.js            business rules (pure functions, unit tested)
  app.js             every API route, shared by both servers
  store.js           JSON store with schema version + auto-migration
  uv.js              live UV index for Jeju (Open-Meteo, cached 30 min)
  data/stations.js   stations, stamp kinds, reward rule, help points, hotlines
  data/catalog.js    places / food / activities the AI picks from
server.js            local server: shared app + static files + WebSocket
api/index.js         Vercel serverless entry (same app)
public/              tourist app (index.html, app.js), admin desk (admin.html, admin.js), shared style.css
firmware/            admin, food, place, activity sketches (+ tools/ RC522 diagnostic)
test/                node --test unit tests
```

### Adding things later

- **New station** (for example a second food stall): add an entry to `lib/data/stations.js` with a new `id` and `kind`, copy `firmware/food` to a new folder, and change `STATION_ID`. The app, admin desk and voucher rule pick it up automatically.
- **New stamp kind**: add it to `STATION_KINDS`. The voucher needs one stamp of every kind listed in `REWARD.requiredKinds`.
- **New recommendation**: add an item to `lib/data/catalog.js`. Only add dietary tags that are verified; untagged food is hidden from anyone with a restriction.
- **Real database**: replace `lib/store.js` (same `load/save/replace` interface). Vercel `/tmp` storage resets when an instance is recycled.

### How the AI picks work

`S = N · D · (0.35·Proximity + 0.25·Rating + 0.20·UV fit + 0.20·Local & quiet + 0.10·Next stop)`

- **N** removes places at stations the tourist already stamped.
- **D** keeps food only if it carries every diet tag the tourist declared (vegan counts as vegetarian). Unknown allergies fail closed.
- Proximity uses the phone GPS if shared, else the last station tapped. UV fit prefers lava caves and museums when UV ≥ 8.

### API

| Method & path | Caller | Purpose |
| :--- | :--- | :--- |
| `GET /api/config` | web | Stations, kinds, reward, help points, hotlines |
| `GET /api/tourist/:uid` | phone | Profile, stamps, voucher, active SOS (auto-creates new bands) |
| `POST /api/register` | phone / admin | Save profile |
| `POST /api/checkin` | station ESP32 | `{uid, station}` → stamp; replies `duplicate`, `isNewStamp`, `stampsCollected`, `voucherUnlocked` |
| `POST /api/stations/heartbeat` | ESP32 | Station online status for the admin desk |
| `POST /api/admin/scan` | admin ESP32 | Tag read at the desk |
| `GET/POST /api/admin/write-queue` | admin ESP32 / desk | Custom content for the next tag |
| `GET /api/recommendations` | phone | `?uid&category&lat&lng` → UV, advice, ranked picks |
| `POST /api/recommendations/event` | phone | `shown / opened / visited` for the conversion metric |
| `POST /api/location` | phone | Share GPS as last-known location |
| `POST /api/sos` · `/api/sos/:action` | phone / admin | Raise SOS; `acknowledge`, `dispatch`, `resolve`, `cancel` |
| `POST /api/redeem` | phone + merchant | `{uid, pin}` → single-use voucher |
| `GET /api/admin/status` | admin desk | Everything above plus metrics |

Old firmware ids `checkpoint1` / `checkpoint2` still work (they map to `place` / `food`).

---

## 3. Firmware

Each folder is a normal Arduino sketch. Board: **ESP32 Dev Module**, 115200 baud. Libraries: **MFRC522** (GithubCommunity) and **Adafruit PN532**.

1. In each sketch folder, copy `secrets.example.h` to `secrets.h` and fill in Wi-Fi. `secrets.h` is git-ignored.
2. Flash `admin` to the desk ESP32, and `food`, `place`, `activity` to the three stations.

### Wi-Fi (`wifi_setup.h`, same file in every sketch)

- At boot the ESP32 scans and joins the network it **used last** (saved in flash), then tries the other remembered ones, then everything in `WIFI_SSID_LIST` (BUNDAOBUNTAI, OhmPatumwan).
- If Wi-Fi drops it keeps retrying in the background, and tag reading keeps working.
- **Pick a network by hand in the Serial Monitor** (115200, Newline):

  | Command | Does |
  | :--- | :--- |
  | `scan` | list networks in range (★ = known) |
  | `join 2` | join #2 from the list with its saved password |
  | `join 2 mypassword` | join #2 with this password |
  | `join MyWifi,mypassword` | join by name |
  | `saved` / `forget` | show / clear remembered networks |
  | `portal` / `wifi` | open the phone setup page / show status |

- **Phone setup page**: hold **BOOT** while powering on (or type `portal`, or it opens by itself when no known network is found). Join Wi-Fi `WishBand-<station>` with password `wishband123`, then open http://192.168.4.1, pick a network and tap *Connect & remember*.
- Every network that connects is remembered (up to 5), newest first.

Station sounds: two rising beeps = new stamp, fanfare = voucher unlocked, one short beep = already stamped (within 60 s), two quick beeps = offline (the tap is queued and sent when Wi-Fi returns), low buzz = error. The LED blinks while offline.

To use a PN532 at a station instead of an MFRC522, set `#define USE_PN532 1` at the top of the sketch.

### Wiring

**Admin desk: ESP32 + PN532 (I2C).** DIP switches SEL0 = OFF, SEL1 = ON.

| PN532 | ESP32 |
| :--- | :--- |
| VCC | 3V3 (or 5V) |
| GND | GND |
| SDA | GPIO 21 |
| SCL | GPIO 22 |

**Stations: ESP32 + MFRC522 (SPI).** ⚠️ 3.3 V only. Never connect the MFRC522 to 5 V.

| MFRC522 | ESP32 |
| :--- | :--- |
| 3.3V | 3V3 |
| RST | GPIO 22 |
| GND | GND |
| MISO | GPIO 19 |
| MOSI | GPIO 23 |
| SCK | GPIO 18 |
| SDA (SS) | GPIO 5 |

Buzzer (+) → GPIO 4, LED (+) → GPIO 2 on every board.

Reader not found? Flash `firmware/tools/test_rc522_diagnostic` first.

---

## 4. Critical Real-World Limitations & How to Overcome Them

When building physical prototypes with basalt stones and NFC, you must be aware of several physical and electronic constraints:

### 1. Basalt Stone & Mineral RF Attenuation
- **The Issue**: Genuine Jeju basalt is an igneous volcanic rock that naturally contains iron oxides, titanium (titanomagnetite), and magnesium. Placing an NFC tag directly flush against dense volcanic rock without insulation can detune the 13.56 MHz antenna coil, causing degraded read range or failed reads.
- **The Solution for AuraBeads**:
  - Always encase the NFC tag in a thin barrier of **clear epoxy casting resin or dielectric silicone** before setting it into the basalt bead centerpiece.
  - Keep the tag oriented towards the outer face of the bracelet (facing away from the wrist/stone mass).

### 2. Read Range vs. Tag Size
- **The Issue**: Small coin tags (20mm–25mm diameter) have smaller antenna surface areas, providing an effective read distance of **1.5 cm to 3.5 cm**. They will not read from several inches away.
- **The Solution**:
  - Design the station touchpoints with clear visual targets (e.g. an etched Dol Hareubang circular target on the wooden box) so users know to tap directly against the reader surface.

### 3. iOS vs. Android NFC Quirks
- **iPhone (Apple iOS)**:
  - Background NFC Tag Reading is supported on **iPhone XS, XR, 11, 12, 13, 14, 15, 16+**.
  - The iPhone screen **must be on and unlocked** for background reading to trigger.
  - The NFC antenna on iPhones is located at the **very top edge** of the phone.
  - If held too close while Apple Pay is activated, the payment prompt might appear. A cleanly formatted NDEF URL record resolves this.
- **Android**:
  - NFC antenna placement varies: Samsung Galaxy devices usually place the coil in the **center back**, while Google Pixel devices place it near the **top camera visor**.

### 4. Conference Wi-Fi & Captive Portals
- **The Issue**: University and conference Wi-Fi networks (such as hotel or venue networks at JTU 2026) frequently use **Captive Portals** (where you must open a browser to agree to terms) or enable **AP Isolation** (preventing ESP32s and phones from talking to each other).
- **The Solution**:
  - For your live competition pitch, **create a Mobile Hotspot from your smartphone or portable 4G router**.
  - Connect your laptop and all your ESP32s to this hotspot. This guarantees 100% stable communication unaffected by venue Wi-Fi restrictions!
