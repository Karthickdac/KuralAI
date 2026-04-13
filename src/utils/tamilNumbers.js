/**
 * Tamil Number-to-Words Converter
 * Converts English numerals and currency in a Tamil sentence to spoken Tamil words.
 * Applied before ElevenLabs TTS so numbers are pronounced correctly.
 */

// ── Core number tables ────────────────────────────────────────────────────────

const ONES = [
  '', 'ஒன்று', 'இரண்டு', 'மூன்று', 'நான்கு', 'ஐந்து',
  'ஆறு', 'ஏழு', 'எட்டு', 'ஒன்பது',
];

const TEENS = [
  'பத்து', 'பதினொன்று', 'பன்னிரண்டு', 'பதின்மூன்று',
  'பதினான்கு', 'பதினைந்து', 'பதினாறு', 'பதினேழு',
  'பதினெட்டு', 'பத்தொன்பது',
];

const TENS = [
  '', '', 'இருபது', 'முப்பது', 'நாற்பது', 'ஐம்பது',
  'அறுபது', 'எழுபது', 'எண்பது', 'தொண்ணூறு',
];

// Hundreds have special Tamil compound forms
const HUNDREDS = [
  '', 'நூறு', 'இருநூறு', 'முன்னூறு', 'நானூறு',
  'ஐந்நூறு', 'அறுநூறு', 'எழுநூறு', 'எண்ணூறு', 'தொள்ளாயிரம்',
];

// Thousands have special Tamil compound forms when combined
const THOU_PREFIX = [
  '', 'ஆயிரம்', 'இரண்டாயிரம்', 'மூவாயிரம்', 'நாலாயிரம்',
  'ஐயாயிரம்', 'ஆறாயிரம்', 'ஏழாயிரம்', 'எட்டாயிரம்', 'ஒன்பதாயிரம்',
  'பத்தாயிரம்', 'பதினோராயிரம்', 'பன்னிரண்டாயிரம்', 'பதின்மூவாயிரம்',
  'பதினான்காயிரம்', 'பதினைந்தாயிரம்', 'பதினாறாயிரம்', 'பதினேழாயிரம்',
  'பதினெட்டாயிரம்', 'பத்தொன்பதாயிரம்', 'இருபதாயிரம்',
  'இருபத்தொன்றாயிரம்', 'இருபத்திரண்டாயிரம்', 'இருபத்துமூவாயிரம்',
  'இருபத்துநான்காயிரம்', 'இருபத்தைந்தாயிரம்', 'இருபத்தாறாயிரம்',
  'இருபத்தேழாயிரம்', 'இருபத்தெட்டாயிரம்', 'இருபத்தொன்பதாயிரம்',
  'முப்பதாயிரம்', 'முப்பத்தொன்றாயிரம்', 'முப்பத்திரண்டாயிரம்',
  'முப்பத்துமூவாயிரம்', 'முப்பத்துநான்காயிரம்', 'முப்பத்தைந்தாயிரம்',
  'முப்பத்தாறாயிரம்', 'முப்பத்தேழாயிரம்', 'முப்பத்தெட்டாயிரம்',
  'முப்பத்தொன்பதாயிரம்', 'நாற்பதாயிரம்', 'நாற்பத்தொன்றாயிரம்',
  'நாற்பத்திரண்டாயிரம்', 'நாற்பத்துமூவாயிரம்', 'நாற்பத்துநான்காயிரம்',
  'நாற்பத்தைந்தாயிரம்', 'நாற்பத்தாறாயிரம்', 'நாற்பத்தேழாயிரம்',
  'நாற்பத்தெட்டாயிரம்', 'நாற்பத்தொன்பதாயிரம்', 'ஐம்பதாயிரம்',
  'ஐம்பத்தொன்றாயிரம்', 'ஐம்பத்திரண்டாயிரம்', 'ஐம்பத்துமூவாயிரம்',
  'ஐம்பத்துநான்காயிரம்', 'ஐம்பத்தைந்தாயிரம்', 'ஐம்பத்தாறாயிரம்',
  'ஐம்பத்தேழாயிரம்', 'ஐம்பத்தெட்டாயிரம்', 'ஐம்பத்தொன்பதாயிரம்',
  'அறுபதாயிரம்', 'அறுபத்தொன்றாயிரம்', 'அறுபத்திரண்டாயிரம்',
  'அறுபத்துமூவாயிரம்', 'அறுபத்துநான்காயிரம்', 'அறுபத்தைந்தாயிரம்',
  'அறுபத்தாறாயிரம்', 'அறுபத்தேழாயிரம்', 'அறுபத்தெட்டாயிரம்',
  'அறுபத்தொன்பதாயிரம்', 'எழுபதாயிரம்', 'எழுபத்தொன்றாயிரம்',
  'எழுபத்திரண்டாயிரம்', 'எழுபத்துமூவாயிரம்', 'எழுபத்துநான்காயிரம்',
  'எழுபத்தைந்தாயிரம்', 'எழுபத்தாறாயிரம்', 'எழுபத்தேழாயிரம்',
  'எழுபத்தெட்டாயிரம்', 'எழுபத்தொன்பதாயிரம்', 'எண்பதாயிரம்',
  'எண்பத்தொன்றாயிரம்', 'எண்பத்திரண்டாயிரம்', 'எண்பத்துமூவாயிரம்',
  'எண்பத்துநான்காயிரம்', 'எண்பத்தைந்தாயிரம்', 'எண்பத்தாறாயிரம்',
  'எண்பத்தேழாயிரம்', 'எண்பத்தெட்டாயிரம்', 'எண்பத்தொன்பதாயிரம்',
  'தொண்ணூறாயிரம்', 'தொண்ணூத்தொன்றாயிரம்', 'தொண்ணூத்திரண்டாயிரம்',
  'தொண்ணூத்துமூவாயிரம்', 'தொண்ணூத்துநான்காயிரம்', 'தொண்ணூத்தைந்தாயிரம்',
  'தொண்ணூத்தாறாயிரம்', 'தொண்ணூத்தேழாயிரம்', 'தொண்ணூத்தெட்டாயிரம்',
  'தொண்ணூத்தொன்பதாயிரம்',
];

// Joining form when something follows thousands/hundreds (uses "த்து" suffix)
function thousandJoin(thou) {
  if (thou.endsWith('ம்')) return thou.slice(0, -2) + 'த்து';
  if (thou.endsWith('று')) return thou.slice(0, -2) + 'த்து';
  return thou + 'த்து';
}

function hundredJoin(h) {
  if (h === 'நூறு') return 'நூத்து';
  if (h.endsWith('று')) return h.slice(0, -2) + 'த்து';
  if (h.endsWith('டு')) return h.slice(0, -2) + 'த்து';
  if (h.endsWith('று')) return h.slice(0, -2) + 'த்து';
  if (h.endsWith('நூறு')) return h.slice(0, -4) + 'நூத்து';
  return h + 'த்து';
}

// Convert number < 100 to Tamil words
function belowHundred(n) {
  if (n === 0) return '';
  if (n < 10) return ONES[n];
  if (n < 20) return TEENS[n - 10];
  const t = Math.floor(n / 10);
  const u = n % 10;
  if (u === 0) return TENS[t];
  // compound tens: e.g. 21 → இருபத்தொன்று, 91 → தொண்ணூத்தொன்று
  let tenBase = TENS[t];
  if (tenBase.endsWith('து')) tenBase = tenBase.slice(0, -2) + 'த்து';
  else if (tenBase.endsWith('று')) tenBase = tenBase.slice(0, -2) + 'த்து';
  return tenBase + ONES[u];
}

/**
 * Convert an integer (0–99999) to Tamil words.
 */
function numberToTamil(n) {
  n = Math.round(n);
  if (n === 0) return 'பூஜ்யம்';
  if (n < 0) return 'மைனஸ் ' + numberToTamil(-n);

  const parts = [];

  // Lakhs (100000+)
  if (n >= 100000) {
    const l = Math.floor(n / 100000);
    n = n % 100000;
    const lWord = l === 1 ? 'ஒரு லட்சம்' : belowHundred(l) + ' லட்சம்';
    parts.push(n > 0 ? lWord.replace('லட்சம்', 'லட்சத்து') : lWord);
  }

  // Thousands (1000–99999)
  if (n >= 1000) {
    const th = Math.floor(n / 1000);
    n = n % 1000;
    if (th <= THOU_PREFIX.length - 1 && THOU_PREFIX[th]) {
      const tWord = THOU_PREFIX[th];
      parts.push(n > 0 ? thousandJoin(tWord) : tWord);
    } else {
      parts.push(belowHundred(th) + (n > 0 ? 'ஆயிரத்து' : 'ஆயிரம்'));
    }
  }

  // Hundreds (100–999)
  if (n >= 100) {
    const h = Math.floor(n / 100);
    n = n % 100;
    const hWord = HUNDREDS[h];
    parts.push(n > 0 ? hundredJoin(hWord) : hWord);
  }

  // Remainder < 100
  if (n > 0) {
    parts.push(belowHundred(n));
  }

  return parts.join(' ');
}

// ── Ordinal forms ─────────────────────────────────────────────────────────────

const ORDINAL_DATE = [
  '', 'முதல்', 'இரண்டாம்', 'மூன்றாம்', 'நான்காம்', 'ஐந்தாம்',
  'ஆறாம்', 'ஏழாம்', 'எட்டாம்', 'ஒன்பதாம்', 'பத்தாம்',
  'பதினொன்றாம்', 'பன்னிரண்டாம்', 'பதின்மூன்றாம்', 'பதினான்காம்',
  'பதினைந்தாம்', 'பதினாறாம்', 'பதினேழாம்', 'பதினெட்டாம்',
  'பத்தொன்பதாம்', 'இருபதாம்', 'இருபத்தொன்றாம்', 'இருபத்திரண்டாம்',
  'இருபத்துமூன்றாம்', 'இருபத்துநான்காம்', 'இருபத்தைந்தாம்',
  'இருபத்தாறாம்', 'இருபத்தேழாம்', 'இருபத்தெட்டாம்', 'இருபத்தொன்பதாம்',
  'முப்பதாம்', 'முப்பத்தொன்றாம்',
];

function ordinalDate(n) {
  if (n >= 1 && n <= ORDINAL_DATE.length - 1) return ORDINAL_DATE[n];
  return numberToTamil(n) + 'ஆம்';
}

const ORDINAL_VATU = [
  '', 'முதல்', 'இரண்டாவது', 'மூன்றாவது', 'நான்காவது', 'ஐந்தாவது',
  'ஆறாவது', 'ஏழாவது', 'எட்டாவது', 'ஒன்பதாவது', 'பத்தாவது',
  'பதினொன்றாவது', 'பன்னிரண்டாவது',
];

function ordinalVatu(n) {
  if (n >= 1 && n <= ORDINAL_VATU.length - 1) return ORDINAL_VATU[n];
  return numberToTamil(n) + 'ஆவது';
}

// ── Month name tables ─────────────────────────────────────────────────────────

const ENGLISH_MONTHS_FULL = [
  'january','february','march','april','may','june',
  'july','august','september','october','november','december',
];
const ENGLISH_MONTHS_SHORT = [
  'jan','feb','mar','apr','may','jun',
  'jul','aug','sep','oct','nov','dec',
];
const TAMIL_MONTHS = [
  'ஜனவரி','பிப்ரவரி','மார்ச்','ஏப்ரல்','மே','ஜூன்',
  'ஜூலை','ஆகஸ்ட்','செப்டம்பர்','அக்டோபர்','நவம்பர்','டிசம்பர்',
];
// Tamil month names that may already appear in text
const TAMIL_MONTH_NAMES = [
  'ஜனவரி','பிப்ரவரி','மார்ச்','ஏப்ரல்','மே','ஜூன்',
  'ஜூலை','ஆகஸ்ட்','செப்டம்பர்','அக்டோபர்','நவம்பர்','டிசம்பர்',
];

function englishMonthToTamil(monthStr) {
  const m = monthStr.toLowerCase();
  const fullIdx  = ENGLISH_MONTHS_FULL.indexOf(m);
  if (fullIdx  >= 0) return TAMIL_MONTHS[fullIdx];
  const shortIdx = ENGLISH_MONTHS_SHORT.indexOf(m.slice(0, 3));
  if (shortIdx >= 0) return TAMIL_MONTHS[shortIdx];
  return monthStr;
}

// ── Main text transformer ─────────────────────────────────────────────────────

/**
 * Convert all numerals, dates, and currency in a Tamil sentence to Tamil spoken words.
 * Runs BEFORE ElevenLabs TTS so numbers and dates are pronounced correctly.
 *
 * Date patterns handled:
 *   2025-04-15        →  ஏப்ரல் பதினைந்தாம் தேதி
 *   15/04/2025        →  ஏப்ரல் பதினைந்தாம் தேதி
 *   15-04-2025        →  ஏப்ரல் பதினைந்தாம் தேதி
 *   April 15          →  ஏப்ரல் பதினைந்தாம் தேதி
 *   Apr 15, 2025      →  ஏப்ரல் பதினைந்தாம் தேதி
 *   15 April 2025     →  ஏப்ரல் பதினைந்தாம் தேதி
 *   மே 7              →  மே ஏழாம் தேதி
 *   7ம் தேதி          →  ஏழாம் தேதி
 *   7 தேதி            →  ஏழாம் தேதி
 *   7ஆம் தேதி         →  ஏழாம் தேதி
 * Number/currency patterns:
 *   ₹2,500            →  இரண்டாயிரத்துஐந்நூறு ரூபாய்
 *   Rs.5000           →  ஐயாயிரம் ரூபாய்
 *   1வது              →  முதல்
 *   50,000            →  ஐம்பதாயிரம்
 */
function tamilizeText(text) {
  if (!text) return text;
  let t = text;

  // ── Date conversions (must run before number conversions) ─────────────────

  // 1a. ISO date: YYYY-MM-DD → "TamilMonth ordinalDay தேதி"
  t = t.replace(/\b(20\d{2}|19\d{2})-(\d{2})-(\d{2})\b/g, (_, y, m, d) => {
    const month = parseInt(m, 10);
    const day   = parseInt(d, 10);
    if (month < 1 || month > 12 || day < 1 || day > 31) return _;
    return `${TAMIL_MONTHS[month - 1]} ${ordinalDate(day)} தேதி`;
  });

  // 1b. DD/MM/YYYY or DD-MM-YYYY (ambiguous, assume D/M/Y for Indian locale)
  t = t.replace(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](20\d{2}|19\d{2})\b/g, (_, d, m, y) => {
    const day   = parseInt(d, 10);
    const month = parseInt(m, 10);
    if (month < 1 || month > 12 || day < 1 || day > 31) return _;
    return `${TAMIL_MONTHS[month - 1]} ${ordinalDate(day)} தேதி`;
  });

  // 1c. DD/MM (short — no year): e.g. "07/04" → "ஏப்ரல் ஏழாம் தேதி"
  t = t.replace(/\b(\d{1,2})\/(\d{1,2})\b(?!\d*[\/\-]\d)/g, (_, d, m) => {
    const day   = parseInt(d, 10);
    const month = parseInt(m, 10);
    if (month < 1 || month > 12 || day < 1 || day > 31) return _;
    return `${TAMIL_MONTHS[month - 1]} ${ordinalDate(day)} தேதி`;
  });

  // 1d. English month full/short + day (+ optional year):
  //     "April 15" / "Apr 15" / "April 15, 2025" / "Apr 15 2025"
  const engMonthPattern = ENGLISH_MONTHS_FULL.concat(ENGLISH_MONTHS_SHORT)
    .map(m => m[0].toUpperCase() + m.slice(1))
    .join('|');
  const engMonthRe = new RegExp(
    `\\b(${engMonthPattern})\\.?\\s+(\\d{1,2})(?:[,\\s]+(20\\d{2}|19\\d{2}))?\\b`, 'gi'
  );
  t = t.replace(engMonthRe, (_, mon, d) => {
    const day = parseInt(d, 10);
    if (day < 1 || day > 31) return _;
    return `${englishMonthToTamil(mon)} ${ordinalDate(day)} தேதி`;
  });

  // 1e. Day + English month (+ optional year): "15 April" / "15 April 2025"
  const dayMonthRe = new RegExp(
    `\\b(\\d{1,2})\\s+(${engMonthPattern})\\.?(?:[,\\s]+(20\\d{2}|19\\d{2}))?\\b`, 'gi'
  );
  t = t.replace(dayMonthRe, (_, d, mon) => {
    const day = parseInt(d, 10);
    if (day < 1 || day > 31) return _;
    return `${englishMonthToTamil(mon)} ${ordinalDate(day)} தேதி`;
  });

  // 1f. Tamil month + bare day number: "மே 7" / "ஏப்ரல் 15"
  const tamilMonthPat = TAMIL_MONTH_NAMES.join('|');
  const tamilMonthDayRe = new RegExp(`(${tamilMonthPat})\\s+(\\d{1,2})(?!ம்|ஆம்|வது)`, 'g');
  t = t.replace(tamilMonthDayRe, (_, mon, d) => {
    const day = parseInt(d, 10);
    if (day < 1 || day > 31) return _;
    return `${mon} ${ordinalDate(day)} தேதி`;
  });

  // ── Ordinal date patterns ─────────────────────────────────────────────────

  // 2a. "7ம் தேதி" → "ஏழாம் தேதி"
  t = t.replace(/(\d+)ம்\s*தேதி/g, (_, d) => ordinalDate(parseInt(d, 10)) + ' தேதி');

  // 2b. "7ஆம் தேதி" → "ஏழாம் தேதி"
  t = t.replace(/(\d+)ஆம்\s*தேதி/g, (_, d) => ordinalDate(parseInt(d, 10)) + ' தேதி');

  // 2c. "7 தேதி" (bare number before தேதி, no suffix) → "ஏழாம் தேதி"
  t = t.replace(/\b(\d{1,2})\s+தேதி/g, (_, d) => {
    const day = parseInt(d, 10);
    if (day < 1 || day > 31) return _;
    return ordinalDate(day) + ' தேதி';
  });

  // 3. Ordinal "வது": e.g. "1வது" or "1 வது" → "முதல்"
  //    Allow optional whitespace between number and வது
  t = t.replace(/(\d+)\s*வது/g, (_, d) => ordinalVatu(parseInt(d, 10)));

  // ── Number / currency conversions ─────────────────────────────────────────

  // 4. Currency with ₹ or Rs.
  t = t.replace(/(?:₹|Rs\.?)\s*([\d,]+)/g, (_, numStr) => {
    const n = parseInt(numStr.replace(/,/g, ''), 10);
    return numberToTamil(n) + ' ரூபாய்';
  });

  // 4b. "ரூபாய்" word used as suffix before OR prefix then number
  //     e.g. "ரூபாய் 18,750" — number already handled by rules 5/6/7,
  //     but Indian lakh format "5,00,000 ரூபாய்" needs stripping first.
  //     Indian lakh format: N,NN,NNN  (e.g. 5,00,000 / 15,50,000 / 1,00,00,000)
  t = t.replace(/(?<![₹\d])(\d{1,2},\d{2},\d{3})(?!\d)/g, (_, numStr) => {
    const n = parseInt(numStr.replace(/,/g, ''), 10);
    return numberToTamil(n);
  });
  // Crore-level Indian format: N,NN,NN,NNN
  t = t.replace(/(?<![₹\d])(\d{1,2},\d{2},\d{2},\d{3})(?!\d)/g, (_, numStr) => {
    const n = parseInt(numStr.replace(/,/g, ''), 10);
    return numberToTamil(n);
  });

  // 5. Standalone numbers with commas (Western thousands): "50,000" → "ஐம்பதாயிரம்"
  t = t.replace(/(?<![₹\d])(\d{1,3}(?:,\d{3})+)(?!\d)/g, (_, numStr) => {
    const n = parseInt(numStr.replace(/,/g, ''), 10);
    return numberToTamil(n);
  });

  // 6. Remaining plain numbers ≥ 100 (amounts); skip years and phone numbers
  t = t.replace(/(?<![₹.\d])(\d{3,6})(?!\d)/g, (match, numStr) => {
    const n = parseInt(numStr, 10);
    if (n >= 1900 && n <= 2099) return match; // skip years
    return numberToTamil(n);
  });

  // 7. Small standalone numbers 1–99 not already converted.
  //    Covers: "5 லட்சம்", "18 மாதம்", "50 பேர்", "10 நிமிஷம்", "2 தடவை" …
  //    Negative lookbehind excludes ₹, digits, hyphen (avoids IDs like CG-2024-A).
  t = t.replace(/(?<![₹\d\-\.])(\d{1,2})(?!\d)/g, (match, numStr) => {
    const n = parseInt(numStr, 10);
    if (n === 0) return 'பூஜ்யம்';
    return numberToTamil(n);
  });

  // 8. Clean up duplicate "தேதி" that occurs when the date converter adds "தேதி"
  //    but the original script already had " தேதி" right after the template variable.
  //    e.g. "மே ஏழாம் தேதி தேதி" → "மே ஏழாம் தேதி"
  t = t.replace(/தேதி(\s+தேதி)+/g, 'தேதி');

  return t;
}

module.exports = { tamilizeText, numberToTamil, ordinalDate, ordinalVatu };
