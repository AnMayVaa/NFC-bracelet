// Per-country helpers shared by the tourist app and the tests:
// the app language a nationality gets by default, and how a phone number is spaced.
(function (root) {
  // Nationality -> one of the 11 app languages. Anything not listed stays English.
  const COUNTRY_LANG = {
    KR: 'ko', KP: 'ko',
    CN: 'zh', TW: 'zh', HK: 'zh', MO: 'zh',
    JP: 'ja',
    TH: 'th',
    FR: 'fr', MC: 'fr', LU: 'fr', SN: 'fr', CI: 'fr', ML: 'fr', BF: 'fr', NE: 'fr', TG: 'fr', BJ: 'fr',
    GA: 'fr', CG: 'fr', CD: 'fr', MG: 'fr', HT: 'fr', NC: 'fr', PF: 'fr', RE: 'fr',
    DE: 'de', AT: 'de', CH: 'de', LI: 'de',
    ES: 'es', MX: 'es', AR: 'es', CO: 'es', CL: 'es', PE: 'es', VE: 'es', EC: 'es', GT: 'es', CU: 'es',
    BO: 'es', DO: 'es', HN: 'es', PY: 'es', SV: 'es', NI: 'es', CR: 'es', PA: 'es', UY: 'es', GQ: 'es',
    IT: 'it', SM: 'it', VA: 'it',
    PT: 'pt', BR: 'pt', AO: 'pt', MZ: 'pt', CV: 'pt', GW: 'pt', ST: 'pt', TL: 'pt',
    RU: 'ru', BY: 'ru', KZ: 'ru', KG: 'ru',
    VN: 'vi',
    ID: 'id',
    MY: 'ms', BN: 'ms'
  };

  // A sample national number (no trunk 0) per country; the gaps are the grouping the
  // number is spaced into while typing. Countries not listed use groups of three.
  const PHONE_SAMPLE = {
    KR: '10 1234 5678', JP: '90 1234 5678', CN: '138 1234 5678', TW: '912 345 678', HK: '9123 4567',
    MO: '6612 3456', SG: '9123 4567', TH: '81 234 5678', VN: '912 345 678', MY: '12 345 6789',
    ID: '812 3456 7890', PH: '917 123 4567', IN: '98765 43210', KH: '12 345 678', LA: '20 2345 6789',
    MM: '9 123 456 789', MN: '8812 3456', BD: '1812 345678', PK: '301 2345678', LK: '71 234 5678',
    NP: '984 1234567', AU: '412 345 678', NZ: '21 123 4567', US: '201 555 0123',
    GB: '7400 123456', IE: '85 012 3456', FR: '6 12 34 56 78', BE: '470 12 34 56', NL: '6 12345678',
    LU: '628 123 456', DE: '151 23456789', AT: '664 1234567', CH: '78 123 45 67', IT: '312 345 6789',
    ES: '612 34 56 78', PT: '912 345 678', BR: '11 96123 4567', AR: '9 11 2345 6789', MX: '55 1234 5678',
    CL: '9 6123 4567', CO: '321 1234567', PE: '912 345 678', RU: '912 345 67 89', KZ: '771 000 99 98',
    UA: '50 123 4567', BY: '29 491 1911', PL: '512 345 678', CZ: '601 123 456', SE: '70 123 45 67',
    NO: '406 12 345', DK: '32 12 34 56', FI: '41 2345678', GR: '691 234 5678', TR: '501 234 56 78',
    IL: '50 234 5678', AE: '50 123 4567', SA: '51 234 5678', QA: '3312 3456', EG: '100 123 4567',
    ZA: '71 123 4567', NG: '802 123 4567', KE: '712 123456', HU: '20 123 4567', RO: '712 034 567'
  };

  // All +1 countries dial like the US
  const sampleFor = (iso, dial) => PHONE_SAMPLE[iso] || (dial === '1' ? PHONE_SAMPLE.US : null);

  function groupsFor(iso, dial) {
    const s = sampleFor(iso, dial);
    return s ? s.split(' ').map(g => g.length) : null;
  }

  // "0812345678" + TH -> "081 234 5678". A trunk 0 typed in front stays with the first group.
  function formatPhone(input, iso, dial) {
    const digits = String(input || '').replace(/\D/g, '');
    const lead = /^0*/.exec(digits)[0];
    const rest = digits.slice(lead.length);
    if (!rest) return lead;
    const groups = groupsFor(iso, dial);
    const out = [];
    let i = 0;
    if (groups) {
      for (const n of groups) {
        if (i >= rest.length) break;
        out.push(rest.slice(i, i + n));
        i += n;
      }
      if (i < rest.length) out[out.length - 1] += rest.slice(i);   // longer than usual: keep the extra digits on the end
    } else {
      while (i < rest.length) { out.push(rest.slice(i, i + 3)); i += 3; }
      if (out.length > 1 && out[out.length - 1].length === 1) out[out.length - 2] += out.pop();
    }
    out[0] = lead + out[0];
    return out.join(' ');
  }

  const api = { COUNTRY_LANG, PHONE_SAMPLE, langForCountry: iso => COUNTRY_LANG[iso] || 'en', phoneSample: sampleFor, formatPhone };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CountryFormat = api;
})(typeof window !== 'undefined' ? window : globalThis);
