# 🍊 Jeju wish-band: Travel + Connect + Protect

A smart basalt-bead wristband for Jeju visitors. Tap the band on a phone to open a personal travel app with **AI picks** for local food, hidden places and activities. Tap it at wish-band stations to collect stamps and leave a **last-known location** for safety. The **Helping Map** and **SOS** button connect tourists to help, and the admin desk sees everything live.

| Part | What it does |
| :--- | :--- |
| 📱 Tourist app (`/<UID>`) | **For You**: one-tap diet setup, stamp progress strip, live weather card, map + AI picks (diet-safe, weather-aware, boosts local and quiet spots) · **Stamps**: road route map, passport, 4,000 KRW Dongmun Market voucher · **SOS**: hold-to-send SOS, Korean hotlines, your embassy or consulate, Helping Map, help near you · **Me**: any nationality (flag, name in any script), international emergency contact, language (English, 한국어, 中文, 日本語, ไทย) and dark mode |
| 🏢 Admin desk (`/admin`) | Issue and register bands, write NFC tags, SOS queue (acknowledge, dispatch, resolve), station health, live log, evaluation metrics, **Demo control** (load a mock story, play each journey step for one band, clear SOS / stamps / guests, download a backup, delete everything) |
| 📟 `firmware/admin` | ESP32 + PN532 desk reader: reads the tag, writes the tourist link, reports to the admin desk |
| 🍊 `firmware/food` · 🗿 `firmware/place` · 🌊 `firmware/activity` | ESP32 stations (MFRC522 by default, PN532 optional): each tap gives a stamp of that kind |
| 🍊🗿🌊 `firmware/stamp` | Optional all-in-one version of the three station sketches: one sketch, and each board is told which station it is (`station food` in the Serial Monitor or the phone setup page) |

---

## 1. Run it

```bash
npm install
npm start            # http://localhost:3000
npm test             # core rules: stamps, voucher, diet filter, SOS flow, migration
```

- Tourist app: http://localhost:3000/BEAD_001 (any tag UID works as the path)
- Admin desk: http://localhost:3000/admin, then press **Load full demo story** in Demo control
- Live site: https://smart-nfc-bracelet.vercel.app (Vercel uses `api/index.js`)

To simulate taps without hardware, use **Demo control** on the admin desk (`/admin`).

### Environment variables (all optional)

| Variable | Default | Meaning |
| :--- | :--- | :--- |
| `PUBLIC_URL` | `https://smart-nfc-bracelet.vercel.app` | Base of the link written onto tags |
| `MERCHANT_PIN` | `4000` | PIN the market vendor types to redeem a voucher |
| `STATION_KEY` | empty | If set, ESP32s must send it as `X-Station-Key` (put the same value in `secrets.h`) |
| `ADMIN_PIN` | empty | If set, the admin desk asks for it |
| `TRIAL_MODE` | `false` | `true` makes the app invite every new user to the field trial (consent sheet after first-use setup) |
| `TRIAL_SALT` | `jeju-wish-band` | Mixed into the participant codes in trial exports; set any secret word for a real trial |
| `DEMO_MODE` | `true` | `false` hides demo tools, Demo control, simulated taps, wipe and restore |
| `UV_OVERRIDE` | empty | Force a UV index (for demos); otherwise live UV from Open-Meteo |
| `WEATHER_OVERRIDE` | empty | Force weather for a demo, e.g. `{"tempC":24,"rainChance":90,"precipMm":3}` |
| `PHOTOS_LIVE` | on | `0` stops the live Wikipedia photo lookup (cards keep their emoji unless photos are bundled) |
| `OSRM_URL` | OpenStreetMap foot router | Routing server for the road route on the Stamps map |
| `SUPABASE_URL` | empty | Your Supabase project URL. With the key below, data lives in Supabase instead of `database.json` |
| `SUPABASE_SERVICE_ROLE_KEY` | empty | Supabase secret key (server only, never in the browser or in git) |

### Database: Supabase (recommended for Vercel)

Without the two Supabase variables the app keeps everything in `database.json` (on Vercel that is `/tmp`, which resets). With them, every wish-band, stamp and SOS alert is saved in Supabase Postgres, shared by all Vercel instances, and you can check it in the Supabase **Table Editor**.

1. Create a free project at [supabase.com](https://supabase.com) (region: Seoul or Singapore).
2. **SQL Editor → New query**, paste [`supabase/schema.sql`](supabase/schema.sql), press **Run**. This creates the `tourists` and `sos_alerts` tables plus read-only views `checkins`, `location_log`, `recommendation_events`, `trial_participants`, `voucher_redemptions` and `sos_triggers`. Running it again after an update only adds the new views.
3. **Project Settings → API**: copy the **Project URL** and the **service_role** (secret) key.
4. **Vercel → smart-nfc-bracelet → Settings → Environment Variables**: add `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, then redeploy. For local runs put them in your shell before `npm start`.
5. Open `/api/health`: it shows `"storage": "supabase"` and `"database": { "ok": true, "tourists": N }` when it is connected, or the Supabase error message if not. On /admin, **Demo control → Load full demo story** fills the tables with 11 demo wish-bands and 3 SOS alerts; the header chip turns green ("Supabase").

Row Level Security is on with no policies, so the public anon key can read nothing; only the server's secret key can. Never commit the secret key (the repo is public).

---

## 2. Project structure

```
lib/
  core.js            business rules (pure functions, unit tested)
  app.js             every API route, shared by both servers
  store.js           Supabase or JSON-file store, schema version + auto-migration
  weather.js         live Jeju weather: UV, temperature, rain, wind (Open-Meteo, cached 15 min)
  route.js           Stamps route along real roads (saved file, OSRM, or straight lines)
  photos.js          real photos for the For You cards (bundled file, else Wikipedia/Commons live)
  data/countries.js  calling codes for every country (names come from the browser in any language)
  data/stations.js   stations, stamp kinds, reward rule, help points, hotlines
  data/catalog.js    places / food / activities the AI picks from
server.js            local server: shared app + static files + WebSocket
api/index.js         Vercel serverless entry (same app)
public/              tourist app (index.html, app.js), admin desk (admin.html, admin.js), shared style.css
firmware/            admin, food, place, activity sketches, stamp (all-in-one station) (+ tools/ RC522 diagnostic)
supabase/schema.sql  tables + views to paste into the Supabase SQL Editor
test/                node --test unit tests
```

### Road route for the Stamps map

The app asks `/api/route`, which uses `lib/data/route.json` if it exists, otherwise OpenStreetMap foot routing (OSRM), otherwise straight lines. To make the demo independent of the public router, run once on a computer with internet and commit the file:

```
npm run build-route
```

Run it again whenever a station moves.

### First use

A new wish-band opens a 3-step setup before the app: **interests** (pick at least one), **health** (how the tourist gets around, diet, other allergy, optional medical notes) and **emergency contact** (nationality plus a phone number in international format). Everything can be changed later in **Me**. Medical notes and mobility are shown to the admin desk on any SOS.

### Photos and links on the For You cards

Each card shows a real photo from Wikimedia Commons with its author and licence, or keeps its emoji if no photo is found. Food items are sample dishes, so their photo shows the dish, not a specific shop. Without setup the server looks the photos up live from Wikipedia. To bundle them in the repo so the demo works offline, run once with internet and commit the result:

```
npm run fetch-photos
```

It saves the images to `public/img/places/`, the credits to `public/img/places/CREDITS.md` and the list to `lib/data/photos.json`. The card's link goes to the official website when the catalog has one (`website`), otherwise to the place on Google Maps; **About** opens the UNESCO or Wikipedia page.

### Place details and today's interests

Tapping a card opens its details: photo, address, why it was picked, **Good to know** and **Check before you go** notes from the official listing, and buttons for the official page (VisitJeju or VisitKorea), directions and the map. The **Today I feel like** chips above the list replace the profile interests for today only (`/api/recommendations?today=food,nature`). Real venues, their source pages and the accessibility notes came from the team's Figma Make mockup research.

### Field trial (real people)

Demo bands make good screenshots but are not results. For the advisor's four indicators the team runs a trial with real travelers:

1. Set `TRIAL_MODE=true` (Vercel → Environment Variables, then redeploy) and a private `TRIAL_SALT`.
2. Before the trial, replace the placeholder shop types in `MERCHANTS` (`lib/data/stations.js`) with the real participating Dongmun Market shops.
3. After first-use setup the app shows a consent sheet (what is counted, how it is used, leave any time; 18+). Joining is optional and the app works the same either way. The traveler can join or leave later in **Me**.
4. Trial bands get a 3-question survey (1 to 5: overall, AI picks useful, felt safe, plus a comment) in **Me** and as a nudge on **Stamps** after the first check-in.
5. On /admin the **Field trial** card shows the four indicators from trial bands only, counting only what happened after consent. **Indicators CSV**, **Per band CSV** and **JSON** download them. Exports carry a participant code instead of the name, phone, tag id or medical notes.

| Indicator | How it is counted |
| :--- | :--- |
| Recommendation conversion rate | station visits after an AI pick for that station ÷ AI picks shown (top 3 per load) |
| User satisfaction | mean of the 1–5 "overall" answer, plus the share who answered 4 or 5 |
| Check-ins and stamps | taps at stations, new stamps, per band, finished routes, vouchers |
| Last-location tracking success | trial SOS alerts that reached the desk with a location ÷ all trial SOS alerts; also the share of bands with a known last location |

### Local impact panel

The **Local impact** card on /admin shows where check-ins, AI picks shown and AI picks opened go: local family businesses (`isLocalBusiness`) and quiet spots (`crowdLevel` under 0.4) against crowded hotspots (0.7 and up), for all bands or trial bands only. Below it, vouchers redeemed per shop: the merchant now picks their shop next to the PIN when redeeming. Crowd levels in the catalog are placeholders until checked with the venues.

### SOS by tapping the band (phone dead)

Tap the same wish-band **5 times within about 10 s (12 s allowed)** on any food, place or activity station. The station plays a high-low siren, strobes its LED for 30 s and calls `POST /api/sos/band`. The help desk gets a PENDING SOS pinned to that station, with the tourist's medical notes, mobility and emergency contact, marked "Band-tap SOS" on /admin. Only the first tap is sent as a check-in, so a normal tap still stamps exactly once. If the station is offline the SOS waits first in its queue (LED keeps strobing) and is sent with the real tap time when Wi-Fi is back. A band that already has an open SOS gets the same alert back, not a second one. The server also counts rapid `POST /api/checkin` taps itself (old firmware and the web simulator), and /admin → Demo control has a **5-tap band SOS** button. The admin desk reader does not count taps (it is always staffed).

### Adding things later

- **New station** (for example a second food stall): add an entry to `lib/data/stations.js` with a new `id` and `kind`, copy `firmware/food` to a new folder and change `STATION_ID`, or flash `firmware/stamp` and type `station <new id>` in its Serial Monitor. The app, admin desk and voucher rule pick it up automatically.
- **New stamp kind**: add it to `STATION_KINDS`. The voucher needs one stamp of every kind listed in `REWARD.requiredKinds`.
- **New language**: add a block to `public/i18n.js` and an entry in `LANGS`. Missing keys fall back to English. The app ships English, Korean, Chinese, Japanese, Thai, French, German, Spanish, Italian, Portuguese and Russian; the last six are machine translations that a native speaker should check.
- **New recommendation**: add an item to `lib/data/catalog.js` (with `interests`, `effort`, `wiki` titles for the photo, and `source`, `address`, `good`, `check` in `EXTRA`). Only add dietary tags that are verified; untagged food is hidden from anyone with a restriction.
- **Database**: set the Supabase variables above. Another database can replace `lib/store.js` as long as it keeps the `refresh/load/save/replace` interface.

### How the AI picks work

`S = N · D · G · M · (0.30·Proximity + 0.20·Rating + 0.15·Weather fit + 0.15·Local & quiet + 0.10·Next stop + 0.10·Interests)`

- **N** removes places at stations the tourist already stamped.
- **D** keeps food only if it carries every diet tag the tourist declared (vegan counts as vegetarian). Unknown allergies fail closed.
- **G** is the bad-weather gate: in rain or strong wind, fully exposed spots drop (×0.6).
- **M** is the mobility gate: for wheelchair users steep or long walks are hidden (×0) and some-walking spots drop (×0.5); for short walks only they drop to ×0.4 and ×0.8.
- **Interests** is 1 when the item matches an interest from the first-use setup, 0 when it doesn't, 0.5 when none are set.
- **Weather fit** = half UV fit, half live rain / wind / heat / cold fit, from Open-Meteo (`lib/weather.js`, no key, cached 15 min). Rain puts caves, museums and markets first; each card says why ("Dry inside, good for rain", "Out of the wind", "Cool spot for a hot day").
- Proximity uses the phone GPS if shared, else the last station tapped.

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
| `POST /api/redeem` | phone + merchant | `{uid, pin, shop}` → single-use voucher, `shop` from `MERCHANTS` |
| `POST /api/sos/band` | station ESP32 | `{uid, station, taps, ageSec}` → SOS from rapid band taps |
| `POST /api/trial/consent` | phone | `{uid, consent: true/false}` join, decline or leave the field trial |
| `POST /api/trial/survey` | phone | `{uid, overall, aiPicks, safety, comment}` 1–5 answers (trial bands only) |
| `GET /api/admin/trial-export` | admin desk | `?part=summary\|bands&format=csv`, or JSON with everything |
| `GET /api/admin/status` | admin desk | Everything above plus metrics, trial indicators and impact numbers |

Old firmware ids `checkpoint1` / `checkpoint2` still work (they map to `place` / `food`).

---

## 3. Firmware

Each folder is a normal Arduino sketch. Board: **ESP32 Dev Module**, 115200 baud. Libraries: **MFRC522** (GithubCommunity) and **Adafruit PN532**.

1. In each sketch folder, copy `secrets.example.h` to `secrets.h` and fill in Wi-Fi. `secrets.h` is git-ignored.
2. Flash `admin` to the desk ESP32, and `food`, `place`, `activity` to the three stations (firmware 2.1.0 adds the 5-tap SOS).
3. Or flash `stamp` (firmware 2.2.0, same behaviour) to every station instead, and tell each board which station it is, once. It is saved in flash and survives power-off and re-flashing:
   - Serial Monitor (115200, Newline): `station place`, `station food` or `station activity` (any other id from `lib/data/stations.js` works too). `station` alone shows the current one.
   - Or on the phone setup page (below): pick it under **This station** and tap *Save station & restart*.
   - A new board starts as `STATION_ID` from `secrets.h` (default `food`).
   - At power-on the LED blinks the station number: 1 = place, 2 = food, 3 = activity, 4 = another id.

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
