// Recommendation catalog (sample demo data; ratings and crowd levels are placeholders).
//
// category        place | food | activity
// uvType          INDOOR_SHELTER | SHADED_WALK | OUTDOOR_SUN
// dietaryTags     verified tags only (TAG_HALAL, TAG_VEGAN, TAG_VEGETARIAN, TAG_NO_SHELLFISH, TAG_GLUTEN_FREE)
// isLocalBusiness family-run / community business, boosted by the L term
// crowdLevel      0 (quiet) .. 1 (packed)
// stationId       the wish-band station at this spot, if any

module.exports = [
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

  // ---------- Food ----------
  { id: 'f-dongmun-stalls', category: 'food', emoji: '🍢', title: 'Dongmun Market Night Stalls', title_ko: '동문시장 야시장',
    note: 'Many small family stalls, pick what fits you', lat: 33.5118, lng: 126.5260, rating: 4.5,
    uvType: 'INDOOR_SHELTER', isLocalBusiness: true, crowdLevel: 0.7, stationId: 'food',
    dietaryTags: ['TAG_VEGETARIAN', 'TAG_NO_SHELLFISH'] },
  { id: 'f-halal-chicken', category: 'food', emoji: '🍗', title: 'Tangerine Grilled Chicken (Halal)', title_ko: '감귤 치킨 (할랄)',
    note: 'Halal-certified, tangerine glaze', lat: 33.5000, lng: 126.5310, rating: 4.3,
    uvType: 'INDOOR_SHELTER', isLocalBusiness: true, crowdLevel: 0.3,
    dietaryTags: ['TAG_HALAL', 'TAG_NO_SHELLFISH'] },
  { id: 'f-vegan-bibimbap', category: 'food', emoji: '🥗', title: 'Vegan Bibimbap House', title_ko: '비건 비빔밥',
    note: 'Jeju greens and mushrooms', lat: 33.4990, lng: 126.5290, rating: 4.4,
    uvType: 'INDOOR_SHELTER', isLocalBusiness: true, crowdLevel: 0.2,
    dietaryTags: ['TAG_VEGAN', 'TAG_NO_SHELLFISH'] },
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
    uvType: 'OUTDOOR_SUN', isLocalBusiness: false, crowdLevel: 0.4 }
];
