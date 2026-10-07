// Recommendation catalog (sample demo data; ratings and crowd levels are placeholders).
//
// category        place | food | activity
// uvType          INDOOR_SHELTER | SHADED_WALK | OUTDOOR_SUN
// dietaryTags     verified tags only (TAG_HALAL, TAG_VEGAN, TAG_VEGETARIAN, TAG_NO_SHELLFISH, TAG_GLUTEN_FREE)
// isLocalBusiness family-run / community business, boosted by the L term
// crowdLevel      0 (quiet) .. 1 (packed)
// stationId       the wish-band station at this spot, if any
// (added below) interests  which first-use interests it matches: nature | food | culture | activity | market | cafe
//               effort     0 easy access · 1 some walking or stairs · 2 steep or long walk
//               wiki       English Wikipedia titles to take the photo from (first that has one wins)
//               website    official site if known
//               source     official tourism page (VisitJeju / VisitKorea) used when there is no website;
//                          with neither, the card links to a map search
//               address, good (what the source documents), check (what to confirm before going)
//               access     'partial' when an accessible route is documented
// Real venues and their sources come from the team's research (Figma Make mockup, 2026-10).

const ITEMS = [
  // ---------- Places ----------
  { id: 'p-seongsan', category: 'place', emoji: '🌅', title: 'Seongsan Ilchulbong', title_ko: '성산일출봉',
    note: 'UNESCO tuff cone, best at sunrise', lat: 33.4589, lng: 126.9425, rating: 4.7,
    uvType: 'OUTDOOR_SUN', isLocalBusiness: false, crowdLevel: 0.9, stationId: 'place' },
  { id: 'p-manjanggul', category: 'place', emoji: '🕳️', title: 'Manjanggul Lava Tube', title_ko: '만장굴',
    note: 'Cool lava cave, perfect on hot days', lat: 33.5283, lng: 126.7714, rating: 4.5,
    uvType: 'INDOOR_SHELTER', isLocalBusiness: false, crowdLevel: 0.6 },
  { id: 'p-saryeoni', category: 'place', emoji: '🌲', title: 'Saryeoni Forest Path', title_ko: '사려니숲길',
    note: 'Shady cedar forest walk, hidden and calm', lat: 33.4130, lng: 126.6400, rating: 4.6,
    uvType: 'SHADED_WALK', isLocalBusiness: false, crowdLevel: 0.3 },
  { id: 'p-jeongbang', category: 'place', emoji: '💧', title: 'Jeongbang Waterfall', title_ko: '정방폭포',
    note: 'Waterfall that drops straight into the sea', lat: 33.2447, lng: 126.5717, rating: 4.4,
    uvType: 'OUTDOOR_SUN', isLocalBusiness: false, crowdLevel: 0.7 },
  { id: 'p-woljeongri', category: 'place', emoji: '🏖️', title: 'Woljeongri Beach', title_ko: '월정리 해변',
    note: 'Turquoise water and basalt rocks', lat: 33.5563, lng: 126.7958, rating: 4.3,
    uvType: 'OUTDOOR_SUN', isLocalBusiness: false, crowdLevel: 0.6 },
  { id: 'p-dodu', category: 'place', emoji: '🌄', title: 'Dodubong Peak', title_ko: '도두봉',
    note: 'Unseen little oreum, planes and sunset', lat: 33.5070, lng: 126.4670, rating: 4.4,
    uvType: 'SHADED_WALK', isLocalBusiness: false, crowdLevel: 0.2 },
  { id: 'p-hyeopjae', category: 'place', emoji: '🏝️', title: 'Hyeopjae Beach', title_ko: '협재해수욕장',
    note: 'West-coast beach with views to Biyangdo', lat: 33.3925, lng: 126.2390, rating: 4.6,
    uvType: 'OUTDOOR_SUN', isLocalBusiness: false, crowdLevel: 0.7 },
  { id: 'p-jeolmul', category: 'place', emoji: '🌳', title: 'Jeolmul Recreational Forest', title_ko: '절물자연휴양림',
    note: 'Shady cedar forest with several trail options', lat: 33.4302, lng: 126.6228, rating: 4.6,
    uvType: 'SHADED_WALK', isLocalBusiness: false, crowdLevel: 0.4 },
  { id: 'p-hallim', category: 'place', emoji: '🌺', title: 'Hallim Park', title_ko: '한림공원',
    note: 'Big botanical park with gardens and lava caves', lat: 33.3880, lng: 126.2398, rating: 4.4,
    uvType: 'SHADED_WALK', isLocalBusiness: false, crowdLevel: 0.6 },
  { id: 'p-haenyeo-museum', category: 'place', emoji: '🐚', title: 'Haenyeo Museum', title_ko: '해녀박물관',
    note: 'Indoor museum on the women divers of Jeju', lat: 33.5243, lng: 126.8629, rating: 4.5,
    uvType: 'INDOOR_SHELTER', isLocalBusiness: false, crowdLevel: 0.3 },

  // ---------- Food ----------
  { id: 'f-dongmun-stalls', category: 'food', emoji: '🍢', title: 'Dongmun Market Night Stalls', title_ko: '동문시장 야시장',
    note: 'Many small family stalls, pick what fits you', lat: 33.5118, lng: 126.5260, rating: 4.5,
    uvType: 'INDOOR_SHELTER', isLocalBusiness: true, crowdLevel: 0.7, stationId: 'food',
    dietaryTags: ['TAG_VEGETARIAN', 'TAG_NO_SHELLFISH'] },
  { id: 'f-warda', category: 'food', emoji: '🥙', title: 'Warda Restaurant (Halal)', title_ko: '와르다',
    note: 'Middle Eastern dishes in central Jeju City', lat: 33.5110, lng: 126.5232, rating: 4.3,
    uvType: 'INDOOR_SHELTER', isLocalBusiness: true, crowdLevel: 0.3,
    dietaryTags: ['TAG_HALAL'] },
  { id: 'f-dasoni', category: 'food', emoji: '🥗', title: 'Dasoni', title_ko: '다소니',
    note: 'Temple-style lotus-leaf rice and bibimbap', lat: 33.4907, lng: 126.5177, rating: 4.4,
    uvType: 'INDOOR_SHELTER', isLocalBusiness: true, crowdLevel: 0.3,
    dietaryTags: ['TAG_VEGAN'] },
  { id: 'f-loving-hut', category: 'food', emoji: '🌱', title: 'Loving Hut Jeju', title_ko: '러빙헛 제주',
    note: 'Vegetarian and vegan dishes in Namwon', lat: 33.2856, lng: 126.7281, rating: 4.2,
    uvType: 'INDOOR_SHELTER', isLocalBusiness: true, crowdLevel: 0.2,
    dietaryTags: ['TAG_VEGAN', 'TAG_VEGETARIAN'] },
  { id: 'f-black-pork', category: 'food', emoji: '🥓', title: 'Jeju Black-Pork BBQ', title_ko: '흑돼지 구이',
    note: 'Island classic (contains pork)', lat: 33.5100, lng: 126.5210, rating: 4.6,
    uvType: 'INDOOR_SHELTER', isLocalBusiness: true, crowdLevel: 0.8,
    dietaryTags: ['TAG_NO_SHELLFISH', 'TAG_GLUTEN_FREE'] },
  { id: 'f-hallabong-bakery', category: 'food', emoji: '🥐', title: 'Hallabong Bakery', title_ko: '한라봉 베이커리',
    note: 'Tangerine bread near Seongsan', lat: 33.4620, lng: 126.9300, rating: 4.2,
    uvType: 'INDOOR_SHELTER', isLocalBusiness: true, crowdLevel: 0.4,
    dietaryTags: ['TAG_VEGETARIAN', 'TAG_NO_SHELLFISH'] },
  { id: 'f-abalone-porridge', category: 'food', emoji: '🥣', title: 'Haenyeo Abalone Porridge', title_ko: '전복죽',
    note: 'Cooked by diver families (shellfish)', lat: 33.5215, lng: 126.8600, rating: 4.5,
    uvType: 'INDOOR_SHELTER', isLocalBusiness: true, crowdLevel: 0.3,
    dietaryTags: ['TAG_GLUTEN_FREE'] },

  // ---------- Activities ----------
  { id: 'a-haenyeo-show', category: 'activity', emoji: '🤿', title: 'Haenyeo Diving Show', title_ko: '해녀 물질 공연',
    note: 'Watch the women divers at work', lat: 33.5231, lng: 126.8622, rating: 4.6,
    uvType: 'OUTDOOR_SUN', isLocalBusiness: true, crowdLevel: 0.5, stationId: 'activity' },
  { id: 'a-basalt-carving', category: 'activity', emoji: '🪨', title: 'Basalt Stone Carving', title_ko: '현무암 조각 체험',
    note: 'Make your own mini Dol Hareubang', lat: 33.4500, lng: 126.6200, rating: 4.5,
    uvType: 'INDOOR_SHELTER', isLocalBusiness: true, crowdLevel: 0.2 },
  { id: 'a-green-tea', category: 'activity', emoji: '🍵', title: 'Green-Tea Field Tasting', title_ko: '녹차밭 시음',
    note: 'Walk the rows, then sip', lat: 33.3060, lng: 126.2890, rating: 4.4,
    uvType: 'SHADED_WALK', isLocalBusiness: false, crowdLevel: 0.6 },
  { id: 'a-tangerine-picking', category: 'activity', emoji: '🍊', title: 'Tangerine Picking Farm', title_ko: '감귤 따기 체험',
    note: 'Family orchard, pick and take home', lat: 33.2800, lng: 126.6000, rating: 4.5,
    uvType: 'OUTDOOR_SUN', isLocalBusiness: true, crowdLevel: 0.3 },
  { id: 'a-olle-walk', category: 'activity', emoji: '🥾', title: 'Olle Route 1 Coastal Walk', title_ko: '올레 1코스',
    note: 'Blue-and-orange ribbons guide you', lat: 33.4700, lng: 126.9100, rating: 4.4,
    uvType: 'OUTDOOR_SUN', isLocalBusiness: false, crowdLevel: 0.4 },
  { id: 'a-maze', category: 'activity', emoji: '🌿', title: 'Gimnyeong Maze Park', title_ko: '김녕미로공원',
    note: 'Evergreen hedge maze, fun with kids', lat: 33.5366, lng: 126.7724, rating: 4.4,
    uvType: 'OUTDOOR_SUN', isLocalBusiness: true, crowdLevel: 0.4 }
];

// Interests, walking effort, photo source and links for each item.
// Food items are sample dishes, so their photo shows the dish, not a specific shop.
const EXTRA = {
  'p-seongsan':          { interests: ['nature', 'culture'], effort: 2, wiki: ['Seongsan_Ilchulbong'], info: 'https://whc.unesco.org/en/list/1264',
                           source: 'https://www.visitjeju.net/en/detail/view?contentsid=CONT_000000000500349', address: '284-12 Ilchul-ro, Seongsan-eup, Seogwipo',
                           good: ['Base viewpoint and summit route have different access.'], check: ['The summit route is steep with many stairs.'] },
  'p-manjanggul':        { interests: ['nature', 'culture'], effort: 1, wiki: ['Manjanggul', 'Manjanggul_Lava_Tube'], info: 'https://whc.unesco.org/en/list/1264' },
  'p-saryeoni':          { interests: ['nature'], effort: 1, wiki: ['Saryeoni_Forest_Path', 'Saryeoni_Forest', 'Hallasan_National_Park'] },
  'p-jeongbang':         { interests: ['nature'], effort: 1, wiki: ['Jeongbang_Waterfall', 'Jeongbang_Falls'] },
  'p-woljeongri':        { interests: ['nature', 'cafe'], effort: 0, wiki: ['Woljeong-ri_Beach', 'Woljeongri_Beach', 'Gimnyeong_Beach'] },
  'p-dodu':              { interests: ['nature'], effort: 1, wiki: ['Dodubong', 'Oreum'] },
  'f-dongmun-stalls':    { interests: ['food', 'market'], effort: 0, wiki: ['Dongmun_Market', 'Dongmun_Traditional_Market', 'Korean_street_food'],
                           source: 'https://www.visitjeju.net/en/detail/view?contentsid=CONT_000000000500745', address: 'Jeju City',
                           check: ['Each stall has its own ingredients. Ask about allergens.', 'Paths can be crowded at night.'] },
  'f-warda':             { interests: ['food'], effort: 0, wiki: ['Shawarma', 'Middle_Eastern_cuisine'],
                           source: 'https://www.visitjeju.net/en/detail/view?contentsid=CNTS_200000000009854', address: '24-1 Gwandeok-ro 8-gil, Jeju-si',
                           good: ['VisitJeju lists halal dishes.'], check: ['Halal certification is not verified.', 'Closed on Sundays.'] },
  'f-dasoni':            { interests: ['food', 'culture'], effort: 0, wiki: ['Bibimbap'],
                           source: 'https://www.visitjeju.net/en/detail/view?contentsid=CNTS_200000000014111', address: '24 Onam-ro 6-gil, Jeju-si',
                           good: ['VisitJeju has listed vegan options.'], check: ['Ask about current ingredients and allergens.'] },
  'f-loving-hut':        { interests: ['food'], effort: 0, wiki: ['Loving_Hut', 'Korean_temple_cuisine'],
                           source: 'https://english.visitkorea.or.kr/svc/whereToGo/locIntrdn/rgnContentsView.do?vcontsId=57748', address: '7036 Iljudong-ro, Namwon-eup, Seogwipo',
                           good: ['VisitKorea lists vegetarian and vegan options.'], check: ['Ask about current ingredients and allergens.'] },
  'f-black-pork':        { interests: ['food'], effort: 0, wiki: ['Jeju_Black_pig', 'Jeju_black_pig', 'Samgyeopsal'] },
  'f-hallabong-bakery':  { interests: ['food', 'cafe'], effort: 0, wiki: ['Hallabong', 'Dekopon'] },
  'f-abalone-porridge':  { interests: ['food', 'culture'], effort: 0, wiki: ['Jeonbok-juk', 'Juk_(food)'] },
  'a-haenyeo-show':      { interests: ['culture', 'activity'], effort: 0, wiki: ['Haenyeo'] },
  'a-basalt-carving':    { interests: ['culture', 'activity'], effort: 0, wiki: ['Dol_hareubang'] },
  'a-green-tea':         { interests: ['cafe', 'nature'], effort: 0, wiki: ['O%27sulloc_Tea_Museum', 'Korean_tea'],
                           source: 'https://m.visitjeju.net/en/detail/view?contentsid=CONT_000000000500457', address: '15 Sinhwayeoksa-ro, Andeok-myeon, Seogwipo',
                           good: ['Indoor tea museum next to the tea fields.'], check: ['Tasting programs may need booking.'] },
  'a-tangerine-picking': { interests: ['activity', 'nature'], effort: 0, wiki: ['Citrus_unshiu', 'Mandarin_orange'] },
  'p-hyeopjae':          { interests: ['nature'], effort: 1, wiki: ['Hyeopjae_Beach'],
                           source: 'https://www.visitjeju.net/en/detail/view?contentsid=CONT_000000000500697', address: '2497-1 Hyeopjae-ri, Hallim-eup, Jeju-si',
                           good: ['Toilets and parking are reported.'], check: ['Access across the sand is not verified.'] },
  'p-jeolmul':           { interests: ['nature'], effort: 0, access: 'partial', wiki: ['Jeolmul_Natural_Recreation_Forest', 'Jeolmul_Recreational_Forest'],
                           source: 'https://m.visitjeju.net/en/detail/view?contentsid=CONT_000000000500570', address: '584 Myeongnim-ro, Jeju-si',
                           good: ['Partly accessible route, accessible parking and toilets, wheelchair rental.'], check: ['Not every trail is step-free. Pick the route first.'] },
  'p-hallim':            { interests: ['nature', 'culture'], effort: 1, wiki: ['Hallim_Park'],
                           source: 'https://www.visitjeju.net/en/detail/view?contentsid=CONT_000000000500690', address: '300 Hallim-ro, Hallim-eup, Jeju-si',
                           good: ['Toilets and parking are reported.'], check: ['Expect a lot of walking. Step-free areas are not verified.'] },
  'p-haenyeo-museum':    { interests: ['culture'], effort: 0, wiki: ['Haenyeo_Museum', 'Haenyeo'],
                           source: 'https://m.visitjeju.net/en/detail/view?contentsid=CONT_000000000500580', address: '26 Haenyeobangmulgwan-gil, Gujwa-eup, Jeju-si',
                           good: ['Indoor heritage museum.'], check: ['Wheelchair and stroller access is not verified.'] },
  'a-maze':              { interests: ['activity', 'nature'], effort: 1, wiki: ['Gimnyeong_Maze_Park'],
                           source: 'https://www.visitjeju.net/en/detail/view?contentsid=CONT_000000000500005', address: '122 Manjanggul-gil, Gujwa-eup, Jeju-si',
                           good: ['Family friendly, supports the local community.'], check: ['Walking and access details are not verified.'] },
  'a-olle-walk':         { interests: ['activity', 'nature'], effort: 2, wiki: ['Jeju_Olle_Trail'], website: 'https://www.jejuolle.org' }
};

const INTERESTS = ['nature', 'food', 'culture', 'activity', 'market', 'cafe'];

module.exports = ITEMS.map(i => ({ interests: [], effort: 0, wiki: [], ...i, ...(EXTRA[i.id] || {}) }));
module.exports.INTERESTS = INTERESTS;
