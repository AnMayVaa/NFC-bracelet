// Station registry: every physical tap point lives here.
// Adding a new station = add one entry below and flash a station sketch with the same id
// (firmware/food, place, activity, or firmware/stamp with "station <id>").
//
// kind   -> which stamp category the station gives (food | place | activity)
// order  -> suggested route order (used for the "next stop" boost in recommendations)
// legacy -> old firmware ids that should still map onto this station

const STATION_KINDS = {
  place:    { label: 'Place',    label_ko: '명소', emoji: '🗿', color: '#2E86AB' },
  food:     { label: 'Food',     label_ko: '맛집', emoji: '🍊', color: '#F28C38' },
  activity: { label: 'Activity', label_ko: '체험', emoji: '🌊', color: '#5E9A62' }
};

const STATIONS = [
  {
    id: 'place',
    kind: 'place',
    name: 'Seongsan Ilchulbong',
    name_ko: '성산일출봉',
    blurb: 'Sunrise Peak tuff cone on the east coast',
    lat: 33.4589, lng: 126.9425,
    order: 1,
    legacy: ['checkpoint1']
  },
  {
    id: 'food',
    kind: 'food',
    name: 'Dongmun Traditional Market',
    name_ko: '동문재래시장',
    blurb: 'Local food stalls and tangerine vendors in Jeju City',
    lat: 33.5118, lng: 126.5260,
    order: 2,
    legacy: ['checkpoint2']
  },
  {
    id: 'activity',
    kind: 'activity',
    name: 'Haenyeo Museum',
    name_ko: '해녀박물관',
    blurb: 'Meet the women divers of Jeju in Gujwa',
    lat: 33.5231, lng: 126.8622,
    order: 3,
    legacy: []
  }
];

// Reward rule: one stamp of every kind unlocks the Dongmun Market voucher.
const REWARD = {
  valueKrw: 4000,
  validDays: 30,
  merchant: 'Dongmun Traditional Market',
  requiredKinds: Object.keys(STATION_KINDS)
};

// Shops that accept the voucher. The merchant picks theirs when redeeming, so the admin
// desk can count redemptions per shop. Placeholder stall types: replace them with the real
// participating Dongmun Market shops before a trial (keep the ids short and unique).
const MERCHANTS = [
  { id: 'dm-food',      name: 'Food stall',              name_ko: '먹거리 가게' },
  { id: 'dm-tangerine', name: 'Tangerine & fruit stall', name_ko: '감귤·과일 가게' },
  { id: 'dm-seafood',   name: 'Seafood stall',           name_ko: '수산물 가게' },
  { id: 'dm-snack',     name: 'Snack & drink stall',     name_ko: '간식·음료 가게' },
  { id: 'dm-craft',     name: 'Souvenir & craft shop',   name_ko: '기념품·공예품 가게' },
  { id: 'dm-other',     name: 'Other market shop',       name_ko: '기타 가게' }
];

// Helping Map points (sample demo data; verify before a real pilot).
const HELP_POINTS = [
  { id: 'hp-airport-info', type: 'info',     name: 'Jeju Airport Tourist Information', lat: 33.5067, lng: 126.4930, phone: '1330' },
  { id: 'hp-jnu-hospital', type: 'hospital', name: 'Jeju National University Hospital', lat: 33.4675, lng: 126.5450, phone: '119' },
  { id: 'hp-seogwipo-med', type: 'hospital', name: 'Seogwipo Medical Center',           lat: 33.2555, lng: 126.5620, phone: '119' },
  { id: 'hp-seongsan-police', type: 'police', name: 'Seongsan Police Box',              lat: 33.4608, lng: 126.9340, phone: '112' },
  { id: 'hp-dongmun-info', type: 'info',     name: 'Dongmun Market Visitor Desk',       lat: 33.5125, lng: 126.5268, phone: '1330' }
];

const HOTLINES = [
  { number: '112', label: 'Police' },
  { number: '119', label: 'Fire & Ambulance' },
  { number: '1330', label: 'Korea Travel Hotline (multilingual)' },
  { number: '1345', label: 'Immigration help for foreigners' }
];

// Consulates in Jeju itself; every other nationality gets its embassy in Seoul.
// The app opens a live map search for the office, so the address and phone are always current.
const JEJU_CONSULATES = { CN: 'Consulate General of China in Jeju', JP: 'Consulate-General of Japan in Jeju' };

module.exports = { STATION_KINDS, STATIONS, REWARD, MERCHANTS, HELP_POINTS, HOTLINES, JEJU_CONSULATES };
