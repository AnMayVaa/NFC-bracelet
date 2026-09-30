// Station registry: every physical tap point lives here.
// Adding a new station = add one entry below and flash a station sketch with the same id.
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
  { number: '1330', label: 'Korea Travel Hotline (multilingual)' }
];

module.exports = { STATION_KINDS, STATIONS, REWARD, HELP_POINTS, HOTLINES };
