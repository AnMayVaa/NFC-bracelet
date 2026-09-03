# 🌋 Jeju AuraBeads: First Prototype Guide

Welcome to the **Jeju AuraBeads** hardware & software prototype. This prototype implements a zero-power smart volcanic basalt bracelet ecosystem using:
- **1x PN532 Module** (Admin Station at Airport / Booth)
- **2x MFRC522 Modules** (Olle Trail Checkpoints 1 & 2)
- **3x ESP32 Microcontrollers**
- **5x NFC Stickers** (Passive AuraBeads)
- **Smartphone Web App** with live real-time sync & profile editing

---

## 1. Complete Hardware Wiring & Setup

### Station 1: Admin Station (ESP32 #1 + PN532)
*Used by airport staff to scan bracelet UIDs, register tourists, and write NDEF web URLs.*

#### PN532 Hardware Switch Setting:
Set the two small DIP switches on the PN532 board to **I2C Mode**:
- `SEL0` = **OFF (0)**
- `SEL1` = **ON (1)**

#### Wiring Table:
| PN532 Pin | ESP32 Pin | Description |
| :--- | :--- | :--- |
| **VCC** | **3.3V** or **5V** | Power (use 3.3V or 5V depending on board regulator) |
| **GND** | **GND** | Ground |
| **SDA** | **GPIO 21** | I2C Data line |
| **SCL** | **GPIO 22** | I2C Clock line |
| **IRQ** | *Not connected* | (Polling mode used) |
| **RST** | *Not connected* | Reset |

---

### Station 2 & 3: Olle Trail Checkpoints (ESP32 #2 & #3 + MFRC522 #1 & #2)
*Placed at physical trail stops (e.g. "Seongsan Sunrise Peak" & "Dongmun Traditional Market").*

> [!CAUTION]
> **CRITICAL VOLTAGE WARNING**: The MFRC522 module operates strictly on **3.3V logic and power**!  
> **NEVER connect MFRC522 VCC to ESP32 5V (VIN)** — doing so will overheat and permanently fry the reader. Always use the **3V3** pin.

#### Wiring Table:
| MFRC522 Pin | ESP32 Pin | Description |
| :--- | :--- | :--- |
| **3.3V** | **3V3** | **Power (3.3V ONLY!)** |
| **RST** | **GPIO 22** | Module Reset line |
| **GND** | **GND** | Ground |
| **IRQ** | *Not connected* | Unused |
| **MISO** | **GPIO 19** | SPI Master In / Slave Out |
| **MOSI** | **GPIO 23** | SPI Master Out / Slave In |
| **SCK** | **GPIO 18** | SPI Clock |
| **SDA (SS)**| **GPIO 5** | SPI Chip Select |

#### Optional Audio & Visual Feedback:
| Component | ESP32 Pin | Note |
| :--- | :--- | :--- |
| **Buzzer (+)** | **GPIO 4** | Buzzer (-) to GND. Sounds double chime on stamp. |
| **Green LED (+)** | **GPIO 2** | (Or built-in LED). Flashes on successful stamp. |

---

## 2. What This First Prototype Can Do

1. **Zero-Power Passive Interaction**:
   - The NFC stickers on the wrist require **0 batteries** and **0 charging**.
   - RF power is harvested from the phone or ESP32 reader upon touch.
2. **Universal Smartphone Web App (No App Store Needed)**:
   - Modern iPhones (XS or newer) and Android phones automatically detect the NFC tag and open the browser to `http://<server-ip>:3000/?uid=<TAG_UID>`.
3. **Tourist Profile Editing Directly on Phone**:
   - The tourist can tap **"✏️ Edit"** on their mobile screen to change their name, dietary restrictions (*Halal, Vegan, Shellfish Allergy*), language, and emergency SOS contacts.
   - Changes are pushed to the cloud instantly via REST and broadcast to all stations.
4. **Real-Time Dol Hareubang Stamp Glow**:
   - Tapping Checkpoint 1 (ESP32 #2) causes the **Seongsan Sunrise Peak** stone grandfather badge to glow golden on the phone with a celebratory animation.
   - Tapping Checkpoint 2 (ESP32 #3) stamps the **Dongmun Market** badge.
5. **Gamified 4,000 KRW Voucher Unlock**:
   - As soon as both stamps are verified, the dashboard unlocks a digital coupon with a redemption code and QR/barcode for Dongmun Market.
   - Market merchants can tap "Redeem Voucher", which permanently flags the coupon as used on the server.
6. **UV Sensor Bead Visualizer**:
   - Simulates the passive photochromic bead transitioning from pearl-white to vibrant Hallabong tangerine orange under seaside UV sunlight.
7. **Airport Admin Center (`/admin.html`)**:
   - Live monitoring desk for airport officials to issue bracelets, monitor all 5 bracelets, and view real-time check-in logs.

---

## 3. Operational Workflow

```
[ Airport Arrival ]
  1. Staff scans new bracelet UID on Admin Station (ESP32 #1 + PN532).
  2. Staff enters tourist name, dietary notes (to assist local SMEs), and emergency contact.
  3. Bracelet is handed to the visitor with a 10,000₩ refundable deposit.

[ Exploring Jeju Island ]
  4. Visitor taps bracelet to their smartphone.
     -> Web dashboard loads instantly showing personalized safety tips and profile.
  5. Visitor can edit their dietary notes or SOS contact directly on phone anytime.

[ Hiking the Olle Trail ]
  6. At Seongsan Sunrise Peak, visitor taps bracelet against the wooden Olle Station.
     -> ESP32 #2 chimes twice; the phone dashboard flashes the first Dol Hareubang stamp!
  7. At Dongmun Market, visitor taps Checkpoint 2 (ESP32 #3).
     -> Second stamp lights up and the 4,000 KRW Tangerine Coupon unlocks on screen!

[ Traditional Market Redemption ]
  8. Visitor shows the unlocked coupon to a fruit vendor at Dongmun Market.
  9. Merchant confirms redemption on the web app.
```

---

## 4. Testing Flow (Step-by-Step)

### Phase 1: Test via Browser Simulator (Right Now!)
The backend server is already running on your machine:
1. Open your browser and navigate to:
   - **Tourist Mobile Dashboard**: [http://localhost:3000/?uid=BEAD_001](http://localhost:3000/?uid=BEAD_001)
   - **Airport Admin Center**: [http://localhost:3000/admin.html](http://localhost:3000/admin.html)
2. Put the two browser windows side-by-side.
3. On the Tourist Dashboard, click **"✏️ Edit"** and change the name or dietary notes. Notice how it updates immediately on the Admin table!
4. Click **"📍 Tap Checkpoint 1 (ESP32)"** in the simulator bar. Watch the first Dol Hareubang stamp light up golden and log into the Admin stream!
5. Click **"📍 Tap Checkpoint 2 (ESP32)"**. Watch the second stamp light up and the **4,000 KRW Voucher unlock**!
6. Click **"🎁 Redeem 4,000₩ at Dongmun Market"**.

### Phase 2: Test with Hardware (ESP32 + Readers)
1. **Find your Laptop's Local IP**:
   - In PowerShell, run `ipconfig`. Look for your IPv4 address (e.g., `192.168.1.50`).
2. **Configure Wi-Fi in Arduino Firmware**:
   - Open `firmware/checkpoint_station_mfrc522/checkpoint_station_mfrc522.ino`.
   - Update `ssid`, `password`, and set `serverBaseUrl = "http://192.168.1.50:3000"`.
   - For ESP32 #2, keep `#define STATION_ID "checkpoint1"`.
   - For ESP32 #3, change to `#define STATION_ID "checkpoint2"`.
3. **Flash ESP32 #2**:
   - Wire MFRC522 to ESP32 according to the table above.
   - Open Arduino IDE -> select **ESP32 Dev Module** -> Flash sketch.
   - Open Serial Monitor (115200 baud). Verify: `MFRC522 RFID reader online!` and `Wi-Fi connected!`.
4. **Physical Tap Test**:
   - Bring one of your 5 NFC stickers near the MFRC522 antenna.
   - The buzzer will beep, and the phone dashboard in your browser will instantly stamp the Dol Hareubang!

### Phase 3: Phone Tap Test (Writing NDEF URL to NFC Sticker)
To make tapping the sticker automatically open your dashboard on a smartphone:
1. Download any free NFC app on your phone (e.g., **NFC Tools** on iOS or Android).
2. Tap **Write** -> **Add a record** -> **URL / URI**.
3. Enter your server URL, for example:
   `http://192.168.1.50:3000/?uid=BEAD_001`
   *(Or your public deployed URL, e.g. Firebase/Vercel)*.
4. Tap **Write** and touch the NFC sticker to your phone.
5. Lock and unlock your phone, then touch the sticker to the back/top edge of your phone. Your phone will immediately offer to open the Jeju AuraBeads dashboard!

---

## 5. Critical Real-World Limitations & How to Overcome Them

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
  - Connect your laptop and all 3 ESP32s to this hotspot. This guarantees 100% stable communication unaffected by venue Wi-Fi restrictions!
