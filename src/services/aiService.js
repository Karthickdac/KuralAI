/**
 * AI Service
 * LLM-powered Tamil conversation engine
 * Intent detection, response generation, confidence scoring
 */

const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const { applyTemplate } = require('../utils/templateEngine');
const {
  TAMIL_PROMPTS,
  CONFIDENCE_THRESHOLDS,
  TAMIL_KEYWORDS
} = require('../config/tamilPrompts');

const SETTINGS_FILE = path.join(__dirname, '../../config/app-settings.json');

function getOpenAIKey() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const s = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
      if (s.openaiApiKey && s.openaiApiKey.length > 20) return s.openaiApiKey;
    }
  } catch {}
  return process.env.OPENAI_API_KEY || 'placeholder';
}

let _openai = null;
let _openaiKey = null;
function getOpenAI() {
  const key = getOpenAIKey();
  if (!_openai || key !== _openaiKey) {
    _openai = new OpenAI({ apiKey: key });
    _openaiKey = key;
  }
  return _openai;
}
const openai = new Proxy({}, { get(_, prop) { return getOpenAI()[prop]; } });

// ─── Comprehensive Q&A Engine (LLM-independent) ────────────────────────────────
//
// Q&A pairs are now loaded from the qa_templates DB table.
// An in-memory cache (60 s TTL) keeps hot reads fast.
// Call invalidateTemplateCache() after any DB mutation.

let _qaCache = null;
let _qaCacheAt = 0;
let _promptCache = null;
let _promptCacheAt = 0;
const QA_CACHE_TTL = 60_000;

function invalidateTemplateCache() {
  _qaCache = null;
  _qaCacheAt = 0;
  _promptCache = null;
  _promptCacheAt = 0;
  logger.debug('Template cache invalidated');
}

async function loadPrompts() {
  const now = Date.now();
  if (_promptCache && now - _promptCacheAt < QA_CACHE_TTL) return _promptCache;
  try {
    const PromptTemplate = require('../models/PromptTemplate');
    const rows = await PromptTemplate.findAll({ where: { isActive: true } });
    _promptCache = Object.fromEntries(rows.map(r => [r.key, r.text]));
    _promptCacheAt = now;
    return _promptCache;
  } catch (err) {
    logger.warn('loadPrompts DB error, using hardcoded fallback:', err.message);
    return {};
  }
}

/**
 * Get a system prompt text by key, resolved from the DB with fallback to
 * the hardcoded TAMIL_PROMPTS constant. Template variables are substituted.
 */
async function getPromptText(key, metadata = {}) {
  const prompts = await loadPrompts();
  const raw = prompts[key];
  if (raw) return applyTemplate(raw, metadata);
  const fallback = TAMIL_PROMPTS[key] || '';
  return applyTemplate(fallback, metadata);
}

async function loadQaPairs() {
  const now = Date.now();
  if (_qaCache && now - _qaCacheAt < QA_CACHE_TTL) return _qaCache;
  try {
    const QaTemplate = require('../models/QaTemplate');
    const rows = await QaTemplate.findAll({
      where: { isActive: true },
      order: [['sortOrder', 'ASC'], ['createdAt', 'ASC']],
    });
    _qaCache = rows.map(r => ({
      intent:        r.intent,
      phraseKeywords: r.phraseKeywords || [],
      tokenKeywords:  r.tokenKeywords  || [],
      minScore:       r.minScore  ?? 1,
      responses:      r.responses || [],
      action:         r.action || 'continue',
    }));
    _qaCacheAt = now;
    return _qaCache;
  } catch (err) {
    logger.warn('loadQaPairs DB error — using fallback:', err.message);
    return _qaCache || HARDCODED_QA_PAIRS;
  }
}

// ── Fallback when DB is unavailable ──────────────────────────────────────────
const HARDCODED_QA_PAIRS = [
  // ── 1. Another seat — how many dues pending ─────────────────────────────
  {
    intent: 'seat_due_status',
    minScore: 1,
    phraseKeywords: [
      'இன்னொரு சீட்', 'இன்னொரு சீட்டு', 'மத்த சீட்', 'வேற சீட்', 'other seat',
      'எத்தனாவது சீட்', 'எத்தன சீட்', 'எத்தனை சீட்', 'எத்தனைவது சீட்',
      'எத்தனாவது due', 'எத்தனாவது டியூ', 'எத்தனவது due', 'எத்தனவது டியூ',
      'எத்தன due', 'எத்தன டியூ', 'எத்தனை due',
      'due போய்ட்டு இருக்கு', 'due போய்ட்டே', 'டியூ போய்ட்டு',
      'due எத்தன', 'due எத்தனாவது', 'due balance',
      'எத்தனாவது month', 'எத்தனாவது மாதம்',
    ],
    tokenKeywords: [
      'எத்தனாவது', 'எத்தன', 'எத்தனை', 'எத்தனவது',
    ],
    responses: [
      '{{otherChitDues}}வது due சார்.',
      'அந்த சீட்ல {{otherChitDues}}வது due சார்.',
      'இன்னொரு சீட்ல {{otherChitDues}}வது due போய்ட்டு இருக்கு சார்.',
    ],
    action: 'continue',
  },

  // ── 2. Premature withdrawal — how much amount ────────────────────────────
  {
    intent: 'premature_withdrawal',
    minScore: 1,
    phraseKeywords: [
      'இப்போ எடுத்தா', 'இப்பவே எடுத்தா', 'இப்போவே எடுத்தா', 'இப்ப எடுத்தா',
      'இப்போ எடுக்கணும்', 'இப்போவே எடுக்கணும்',
      'எடுத்தா எவ்ளோ', 'எடுத்தா எவ்வளவு', 'எடுத்தா என்ன',
      'எவ்ளோ அமௌன்ட்', 'எவ்வளவு அமௌன்ட்', 'எவ்ளோ amount',
      'எவ்ளோ குடுப்பிங்க', 'எவ்வளவு குடுப்பீங்க', 'எவ்ளோ கொடுப்பீங்க',
      'amount கிடைக்கும்', 'அமௌன்ட் கிடைக்கும்',
      'premature withdrawal', 'premature amount',
      'surrender value', 'முன்கூட்டியே', 'முன்பே எடுத்தா',
      'இப்போதே எடுத்தா', 'now எடுத்தா',
    ],
    tokenKeywords: [
      'premature', 'withdraw', 'withdrawal',
      'எடுத்தா', 'எடுக்கணும்',
    ],
    responses: [
      'இப்போ எடுத்தா ₹{{withdrawalAmount}} சார்.',
      'Premature-ஆ எடுத்தா ₹{{withdrawalAmount}} கிடைக்கும் சார்.',
      '₹{{withdrawalAmount}} சார் — இப்போ surrender பண்ணா.',
    ],
    action: 'continue',
  },

  // ── 3. Security documents (jamin / cheque) ──────────────────────────────
  {
    intent: 'jamin_documents',
    minScore: 1,
    phraseKeywords: [
      'jamin என்ன', 'jamin என்னென்ன', 'ஜாமீன் என்ன',
      'என்ன குடுக்கணும்', 'என்னென்ன குடுக்கணும்', 'என்ன கொடுக்கணும்',
      'என்ன document', 'என்ன documents', 'என்ன தரணும்',
      'cheque leaf', 'cheque leaves', 'cheque எத்தன',
      'document என்ன', 'security என்ன', 'guarantee என்ன',
      'என்ன jamin', 'என்ன ஜாமீன்', 'jamin எத்தன',
      'property document', 'land document', 'family document',
    ],
    tokenKeywords: [
      'jamin', 'ஜாமீன்', 'cheque', 'செக்', 'document',
      'security', 'guarantee', 'collateral',
    ],
    responses: [
      '{{familyJamin}} family jamin, {{otherJamin}} other jamin, {{chequeLeaf}} cheque leaf குடுக்கணும் சார்.',
      'Documents: {{familyJamin}} family jamin, {{otherJamin}} other property jamin, {{chequeLeaf}} cheque leaf சார்.',
      '{{familyJamin}} family, {{otherJamin}} other property jamin — அதோட {{chequeLeaf}} cheque leaf வேணும் சார்.',
    ],
    action: 'continue',
  },

  // ── 4. Payment complaint — can't pay / always asking ────────────────────
  {
    intent: 'payment_complaint',
    minScore: 2,
    phraseKeywords: [
      'குடுக்க மாட்டிங்க', 'குடுக்க மாற்றிங்க', 'கொடுக்க மாட்டிங்க',
      'amount குடுக்க மாட்டிங்க', 'pay பண்ண மாட்டிங்க',
      'மாசம் மாசம் கேக்குறீங்க', 'மாதம் மாதம் கேக்குறீங்க',
      'கேக்குறீங்க ஆனா', 'கேக்குறீங்க ஆனால்', 'கேக்குறீங்க but',
      'குலுக்கலுக்கு கேக்குறீங்க ஆனா', 'குலுக்கல் கேக்குறீங்க ஆனா',
      'எங்களால முடியல', 'முடியல சார்',
      'பணம் இல்ல', 'காசு இல்ல', 'கஷ்டமா இருக்கு',
    ],
    tokenKeywords: [
      'afford', 'கஷ்டம்', 'மாட்டிங்க', 'மாற்றிங்க', 'முடியல',
    ],
    responses: [
      'மன்னிக்கணும் சார். Convenient-ஆன நேரம் பாத்து arrange பண்றோம் சார். கஷ்டப்படாதீங்க சார்.',
      'புரிஞ்சுக்கிறோம் சார். உங்களுக்கு okay-ஆன time பாத்து பேசுவோம் சார்.',
      'Sorry சார். உங்க situation புரியுது. Convenient time பாத்து contact பண்றோம் சார்.',
    ],
    action: 'continue',
  },

  // ── 5. Too many people calling — one person only ─────────────────────────
  {
    intent: 'reduce_calls',
    minScore: 1,
    phraseKeywords: [
      'எத்தன பேரு கால்', 'எத்தன பேரு call', 'எத்தனை பேர் call', 'எத்தனை பேரு call',
      'யாரது ஒருத்தர் பண்ணுங்க', 'யாரோட ஒருத்தர்', 'ஒருத்தர் மட்டும் கால்',
      'ஒருத்தர் மட்டும் call', 'ஒருத்தர் மட்டும் பண்ணுங்க',
      'ஒரே ஒருத்தர்', 'single person', 'one person call',
      'ஒரு பேரு மட்டும்', 'ஒரு ஆளு மட்டும்',
      'பல பேரு கால்', 'different people call', 'வேற வேற பேரு',
    ],
    tokenKeywords: [],
    responses: [
      'ஓகே சார். இனிமே ஒருத்தர் மட்டும் call பண்றோம் சார். Inconvenience-க்கு மன்னிக்கணும் சார். நன்றி சார்.',
      'சரி சார். ஒரே ஒரு person மட்டும் call பண்றோம் சார். Sorry சார். நன்றி சார்.',
      'புரிஞ்சது சார். ஒருத்தர் மட்டும் contact பண்றோம். மன்னிக்கணும் சார்.',
    ],
    action: 'end_call',
  },

  // ── 6. Don't call from office ────────────────────────────────────────────
  {
    intent: 'no_office_calls',
    minScore: 1,
    phraseKeywords: [
      'ஆஃபீஸ்ல இருந்து call', 'ஆஃபீஸ்ல இருந்து கால்', 'office இருந்து call',
      'ஆஃபீஸ்ல கால் பண்டீங்க', 'ஆஃபீஸ்ல call பண்டீங்க',
      'ஆஃபீஸ்ல call பண்ணாதீங்க', 'ஆஃபீஸ்ல கால் பண்ணாதீங்க',
      'ஸ்டாஃப் கிட்ட கேட்டுக்குறோம்', 'staff கிட்ட கேட்டுக்கிறோம்',
      'ஸ்டாஃப் கிட்ட கேட்டுக்கோம்', 'நாங்க staff கிட்ட',
      'ஆஃபீஸ்ல இருந்து வேண்டாம்', 'office call வேண்டாம்',
      'work place call', 'office நம்பர்',
    ],
    tokenKeywords: [
      'ஆஃபீஸ்', 'office', 'ஸ்டாஃப்', 'staff', 'workplace',
    ],
    responses: [
      'சரி சார். புரிஞ்சது. இனிமே ஆஃபீஸ்ல இருந்து call பண்ண மாட்டோம் சார். மன்னிக்கணும் சார். நன்றி சார்.',
      'ஓகே சார். ஆஃபீஸ்ல call பண்ண மாட்டோம். Sorry சார். நன்றி சார்.',
      'புரிஞ்சது சார். Office-ல call இனிமே இல்ல சார். Inconvenience-க்கு மன்னிக்கணும் சார்.',
    ],
    action: 'end_call',
  },

  // ── 7. Lottery participation — interested ────────────────────────────────
  {
    intent: 'lottery_participation',
    minScore: 1,
    phraseKeywords: [
      'குலுக்கல்ல கலந்துக்கிறேன்', 'குலுக்கல் கலந்துக்கிறேன்',
      'ஆமா கலந்துக்கிறேன்', 'ஓகே கலந்துக்கிறேன்', 'சரி கலந்துக்கிறேன்',
      'கலந்துக்க விரும்புறேன்', 'கலந்துக்க ready', 'கலந்துக்கிறேன் சார்',
      'விருப்பம் இருக்கு', 'interest இருக்கு', 'interested சார்',
      'lottery ok', 'குலுக்கல் ok', 'குலுக்கல் ஓகே',
      'yes கலந்துக்கிறேன்', 'participate பண்றேன்',
    ],
    tokenKeywords: [
      'கலந்துக்கிறேன்', 'கலந்துக்கிறோம்', 'interested',
    ],
    responses: [
      'நல்லது {{customerName}} சார்! {{nextDueDate}} குலுக்கல் சார். Due amount ₹{{dueAmount}} ready-ஆ வைங்க சார். நன்றி சார்!',
      'Super {{customerName}} சார்! {{nextDueDate}} lottery சார். ₹{{dueAmount}} due amount time-க்கு குடுங்க சார். நன்றி சார்!',
      'நல்லது சார். {{nextDueDate}} குலுக்கல். ₹{{dueAmount}} due prepare பண்ணுங்க சார். நன்றி!',
    ],
    action: 'continue',
  },

  // ── 8. Confirm identity / greeting ──────────────────────────────────────
  {
    intent: 'identity_confirm',
    minScore: 2,
    phraseKeywords: [
      'ஆமா நான்', 'ஆமா சார்', 'ஆமாம் சார்', 'yes சார்',
      'நான் தான்', 'பேசுறேன்', 'நான் பேசுறேன்',
      'ஆமாண்டா', 'yeah', 'yes',
    ],
    tokenKeywords: [
      'ஆமா', 'ஆமாம்', 'yes',
    ],
    responses: [
      'நல்லது {{customerName}} சார்! சார், {{nextDueDate}} உங்களுக்கு {{chitValue}} சீட் இருக்கு சார். {{currentDue}}வது due, amount ₹{{dueAmount}} சார். குலுக்கல்ல கலந்துகிறதுக்கு விருப்பம் இருக்கா சார்?',
      '{{customerName}} சார் தான்ல சார்! சார், {{chitValue}} சீட் — {{nextDueDate}}. {{currentDue}}வது due ₹{{dueAmount}} சார். குலுக்கல்ல participate பண்ண விரும்புறீங்களா சார்?',
    ],
    action: 'continue',
  },

  // ── 9. End call / thanks ─────────────────────────────────────────────────
  {
    intent: 'end_call',
    minScore: 2,
    phraseKeywords: [
      'நன்றி சார்', 'thank you சார்', 'சரி நன்றி', 'ok நன்றி',
      'சரி வைங்க', 'வச்சுக்கோங்க', 'வைங்க சார்',
      'bye சார்', 'ok bye', 'போகிறேன் சார்', 'போறேன் சார்',
      'வேண்டாம் நன்றி', 'ok thanks', 'that\'s all', 'முடிஞ்சது சார்',
    ],
    tokenKeywords: [
      'நன்றி', 'thanks', 'bye', 'goodbye',
    ],
    responses: [
      'நன்றி சார். உங்க time-க்கு நன்றி. வணக்கம் சார்!',
      'Thank you சார். Have a nice day சார். வணக்கம்!',
      'நன்றி சார். நல்லா இருங்க சார். வணக்கம்!',
    ],
    action: 'end_call',
  },

  // ── 10. Lottery decline ────────────────────────────────────────────────
  {
    intent: 'lottery_decline',
    minScore: 1,
    phraseKeywords: [
      'குலுக்கல் வேண்டாம்', 'lottery வேண்டாம்', 'participate வேண்டாம்',
      'இப்போ வேண்டாம்', 'this time வேண்டாம்', 'skip பண்றேன்',
      'அடுத்த தடவை பாக்குறேன்', 'next time', 'இல்ல வேண்டாம்',
    ],
    tokenKeywords: ['skip', 'வேண்டாம்'],
    responses: [
      'சரி {{customerName}} சார். Next time பாக்கலாம் சார். Due மட்டும் time-க்கு கட்டுங்க சார். நன்றி சார்.',
      'ஓகே சார். அடுத்த தடவை participate பண்ணலாம் சார். Due ₹{{dueAmount}} ready-ஆ வைங்க சார். நன்றி சார்.',
    ],
    action: 'continue',
  },

  // ── 11. Identity deny / wrong person ──────────────────────────────────
  {
    intent: 'identity_deny',
    minScore: 1,
    phraseKeywords: [
      'தப்பு', 'wrong number', 'wrong person', 'நான் இல்ல', 'வேற ஆளு',
      'இது wrong number', 'தவறான number', 'அவரு இல்ல', 'available இல்ல',
      'not available', 'அவரு வெளியில', 'busy-ஆ இருக்காரு',
    ],
    tokenKeywords: ['wrong', 'தப்பு', 'தவறான'],
    responses: [
      'மன்னிக்கணும் சார். Inconvenience-க்கு sorry சார். நன்றி சார்.',
      'மன்னிக்கணும் சார். Wrong number-க்கு sorry. நல்ல நாள் சார். வணக்கம்.',
    ],
    action: 'end_call',
  },

  // ── 12. Already paid ──────────────────────────────────────────────────
  {
    intent: 'already_paid',
    minScore: 1,
    phraseKeywords: [
      'already paid', 'கட்டிட்டேன்', 'கட்டாச்சு', 'போட்டாச்சு', 'pay பண்ணிட்டேன்',
      'amount குடுத்தாச்சு', 'already குடுத்தாச்சு', 'செலுத்திட்டேன்',
      'நேத்து கட்டினேன்', 'online transfer பண்ணிட்டேன்',
      'UPI பண்ணிட்டேன்', 'GPay-ல போட்டேன்', 'PhonePe-ல போட்டேன்', 'bank-ல போட்டேன்',
    ],
    tokenKeywords: ['கட்டிட்டேன்', 'கட்டாச்சு', 'போட்டாச்சு', 'paid'],
    responses: [
      'நன்றி {{customerName}} சார்! Payment receive ஆனதும் update பண்றோம் சார். Inconvenience-க்கு மன்னிக்கணும் சார்.',
      'Thank you சார். எங்க accounts team verify பண்ணிடுவாங்க சார். நன்றி சார்.',
      'ஓகே சார். Payment confirm ஆனதும் records update ஆகிடும் சார். நன்றி!',
    ],
    action: 'continue',
  },

  // ── 13. Callback request ──────────────────────────────────────────────
  {
    intent: 'callback_request',
    minScore: 1,
    phraseKeywords: [
      'அப்புறம் call பண்ணுங்க', 'later call', 'பின்னாடி call', 'இப்போ busy',
      'meeting-ல இருக்கேன்', 'busy-ஆ இருக்கேன்', 'driving', 'drive பண்றேன்',
      'கொஞ்ச நேரம் கழிச்சு', 'evening call பண்ணுங்க', 'tomorrow call',
      'நாளைக்கு call', 'free-ஆ இருக்கும்போது', 'அப்புறம் பேசுவோம்',
    ],
    tokenKeywords: ['busy', 'later', 'driving', 'tomorrow', 'நாளைக்கு'],
    responses: [
      'சரி {{customerName}} சார்! அப்புறம் call பண்றோம் சார். Inconvenience-க்கு மன்னிக்கணும் சார். நன்றி சார்.',
      'ஓகே சார். Convenient-ஆ இருக்கும்போது call பண்றோம் சார். நன்றி சார்.',
    ],
    action: 'end_call',
  },

  // ── 14. Payment date inquiry ──────────────────────────────────────────
  {
    intent: 'payment_date_inquiry',
    minScore: 1,
    phraseKeywords: [
      'எப்போ கட்டணும்', 'due date', 'எந்த தேதி', 'last date', 'due date என்ன',
      'எப்போ pay', 'deadline', 'அடுத்த due எப்போ', 'எந்த date-க்குள்ள',
      'late-ஆ கட்டினா', 'fine வருமா', 'penalty',
    ],
    tokenKeywords: ['deadline', 'penalty', 'fine'],
    responses: [
      '{{nextDueDate}} தேதிக்குள்ள கட்டிடணும் சார். Due amount ₹{{dueAmount}} சார். Time-க்கு கட்டுங்க சார்.',
      'அடுத்த due date {{nextDueDate}} சார். ₹{{dueAmount}} ready-ஆ வைங்க சார்.',
    ],
    action: 'continue',
  },

  // ── 15. Chit value inquiry ────────────────────────────────────────────
  {
    intent: 'chit_value_inquiry',
    minScore: 1,
    phraseKeywords: [
      'சீட் value என்ன', 'எவ்ளோ சீட்', 'chit value', 'எவ்ளோ amount சீட்',
      'scheme details', 'plan details', 'scheme என்ன', 'plan என்ன',
      'total value', 'மொத்தம் எவ்ளோ',
    ],
    tokenKeywords: ['scheme', 'plan', 'value'],
    responses: [
      'உங்க சீட் value {{chitValue}} சார். {{currentDue}}வது due — ₹{{dueAmount}} சார். {{nextDueDate}} last date சார்.',
      '{{chitValue}} சீட் சார். Total {{totalDues}} dues-ல {{currentDue}}வது due போய்ட்டு இருக்கு சார்.',
    ],
    action: 'continue',
  },

  // ── 16. Payment mode inquiry ──────────────────────────────────────────
  {
    intent: 'payment_mode',
    minScore: 1,
    phraseKeywords: [
      'எப்படி கட்டணும்', 'online pay', 'account number', 'account details',
      'bank details', 'QR code', 'payment link', 'payment method',
      'எந்த account', 'எந்த bank', 'how to pay',
    ],
    tokenKeywords: ['UPI', 'GPay', 'PhonePe', 'NEFT', 'account', 'bank'],
    responses: [
      'சார், office-ல direct-ஆ cash கட்டலாம் அல்லது bank transfer/UPI பண்ணலாம் சார். Account details-க்கு எங்க office-ஐ contact பண்ணுங்க சார்.',
      'Cash, UPI, NEFT எதுவேணும்னாலும் okay சார். Exact bank details-க்கு எங்க accounts team-கிட்ட check பண்ணுங்க சார். Number WhatsApp-ல அனுப்புறோம் சார்.',
    ],
    action: 'continue',
  },

  // ── 17. Partial payment negotiation ──────────────────────────────────
  {
    intent: 'partial_payment',
    minScore: 1,
    phraseKeywords: [
      'கொஞ்சம் கட்டலாமா', 'partial pay', 'partial amount', 'half கட்டலாமா',
      'பாதி கட்டலாமா', 'கொஞ்சம் மட்டும்', 'கொஞ்சம் கட்டுறேன்',
      'full amount இல்ல', 'full இல்ல', 'சில்லறை இல்ல',
      'installment-ஆ', 'EMI-ஆ கட்டலாமா', 'split பண்ணலாமா',
      'ரெண்டு தடவையா', 'two installments', 'part payment',
    ],
    tokenKeywords: ['partial', 'installment', 'half', 'பாதி', 'கொஞ்சம்'],
    responses: [
      'Partial payment okay சார். எவ்ளோ possible-ஓ அவ்ளோ கட்டுங்க சார் — remaining-ஐ due date-க்குள்ள settle பண்ணுங்க சார். Office-ல discuss பண்ணலாம் சார்.',
      'சார், கொஞ்சம் கட்டினாலும் okay. Balance-ஐ due date-க்குள்ள கட்டினா penalty avoid ஆகும் சார். Office-ல payment plan arrange பண்ணலாம் சார்.',
    ],
    action: 'continue',
  },

  // ── 18. Send details on WhatsApp ────────────────────────────────────
  {
    intent: 'whatsapp_request',
    minScore: 1,
    phraseKeywords: [
      'WhatsApp-ல', 'whatsapp message', 'whatsapp அனுப்புங்க',
      'message அனுப்புங்க', 'SMS அனுப்புங்க', 'text பண்ணுங்க',
      'details அனுப்புங்க', 'message போடுங்க', 'WhatsApp-ல போடுங்க',
      'phone-ல அனுப்புங்க', 'details send பண்ணுங்க',
    ],
    tokenKeywords: ['whatsapp', 'message', 'SMS', 'text'],
    responses: [
      'சரி சார்! Due details-ஐ உங்க WhatsApp-க்கு send பண்றோம் சார். நன்றி சார்.',
      'ஓகே சார்! எங்க team WhatsApp-ல details அனுப்புவாங்க சார். நன்றி சார்.',
    ],
    action: 'continue',
  },

  // ── 19. Chit completion / maturity questions ────────────────────────
  {
    intent: 'chit_completion',
    minScore: 1,
    phraseKeywords: [
      'எப்போ முடியும்', 'எத்தன மாசம் இருக்கு', 'எத்தன month balance',
      'சீட் எப்போ முடியும்', 'chit completion', 'maturity date',
      'எத்தன due இருக்கு', 'இன்னும் எத்தன', 'balance due எத்தன',
      'எப்போ complete ஆகும்', 'chit முடியும்', 'எத்தன மாதம் remaining',
      'total எத்தன மாசம்', 'full term', 'tenure எவ்ளோ',
    ],
    tokenKeywords: ['completion', 'maturity', 'முடியும்', 'remaining', 'balance'],
    responses: [
      'உங்க சீட் {{chitValue}} சார். Total {{totalDues}} dues — இப்போ {{currentDue}}வது due போய்ட்டு இருக்கு சார். இன்னும் சீட் complete ஆக time இருக்கு சார்.',
      '{{currentDue}}வது due முடிஞ்சது சார். Total {{totalDues}} dues இருக்கு. Due time-க்கு கட்டுங்க சார்.',
    ],
    action: 'continue',
  },

  // ── 20. Angry / frustrated customer ─────────────────────────────────
  {
    intent: 'angry_customer',
    minScore: 2,
    phraseKeywords: [
      'ஏன் call பண்றீங்க', 'ஏன் திரும்ப திரும்ப', 'bore அடிக்குது',
      'irritating', 'disturb பண்றீங்க', 'disturb பண்ணாதீங்க',
      'நிறுத்துங்க', 'stop calling', 'don\'t call', 'call பண்ணாதீங்க',
      'வேண்டாம் call', 'harass பண்றீங்க', 'harassment',
      'tension ஆகுது', 'கோபம் வருது', 'torture பண்றீங்க',
      'கொஞ்சம் நிம்மதியா', 'peace-ஆ இருக்க விடுங்க',
    ],
    tokenKeywords: ['irritating', 'disturb', 'harass', 'stop', 'bore', 'torture'],
    responses: [
      'மிகவும் மன்னிக்கணும் சார். உங்களுக்கு trouble பண்ணும் intention இல்ல சார். உங்க request-ஐ note பண்றோம் சார். Inconvenience-க்கு sorry சார்.',
      'மன்னிக்கணும் சார். உங்க concern புரியுது. இனிமே unnecessary-ஆ call பண்ண மாட்டோம் சார். நன்றி சார்.',
      'Sorry சார். உங்களை disturb பண்றது எங்க intention இல்ல. உங்க feedback note பண்ணிக்கிறோம் சார். மன்னிக்கணும் சார்.',
    ],
    action: 'end_call',
  },

  // ── 21. "Who is this?" / unclear about caller ──────────────────────
  {
    intent: 'caller_identity',
    minScore: 1,
    phraseKeywords: [
      'யாரு பேசுறீங்க', 'யாரு call', 'யாரு நீங்க', 'who is calling',
      'எந்த company', 'எங்கிருந்து call', 'from where',
      'எந்த office', 'யாருடைய call', 'யாரு சார்',
    ],
    tokenKeywords: ['யாரு', 'who'],
    responses: [
      'நான் மகாலக்ஷ்மி பேசுறேன் சார், Automystic Chit Fund Company-யிட இருந்து. {{customerName}} சார்ங்களா சார்?',
      'சார், Automystic Chit Fund Company-யிலிருந்து மகாலக்ஷ்மி பேசுறேன் சார். உங்க சீட் due பற்றி call பண்றேன் சார்.',
    ],
    action: 'continue',
  },

  // ── 22. Nominee / beneficiary questions ─────────────────────────────
  {
    intent: 'nominee_inquiry',
    minScore: 1,
    phraseKeywords: [
      'nominee யாரு', 'nominee change', 'beneficiary', 'nominee மாற்றணும்',
      'வேற ஆள் பேரு போடணும்', 'name change', 'nominee update',
      'transfer to another person', 'வேற ஆளுக்கு மாற்ற',
    ],
    tokenKeywords: ['nominee', 'beneficiary'],
    responses: [
      'சார், nominee change/update-க்கு office-ல directly வந்து application submit பண்ணுங்க சார். ID proof-ம் கொண்டு வாங்க சார்.',
      'Nominee update-க்கு எங்க office visit பண்ணுங்க சார். Documents எடுத்துட்டு வாங்க சார்.',
    ],
    action: 'continue',
  },

  // ── 23. Profit / interest / dividend questions ──────────────────────
  {
    intent: 'profit_inquiry',
    minScore: 1,
    phraseKeywords: [
      'interest rate', 'லாபம் எவ்ளோ', 'profit எவ்ளோ', 'dividend',
      'return எவ்ளோ', 'yield', 'எவ்ளோ percentage', 'rate of return',
      'benefit என்ன', 'advantage என்ன', 'என்ன benefit',
      'profit rate', 'interest percentage',
    ],
    tokenKeywords: ['profit', 'லாபம்', 'dividend', 'yield'],
    responses: [
      'சார், chit fund-ல exact return bid amount-ஐ பொறுத்து மாறும் சார். Details-க்கு எங்க office-ஐ contact பண்ணுங்க சார். Overall good returns சார்.',
      'Chit fund returns bid-ஐ depend பண்ணும் சார். Detailed calculation-க்கு office-ல discuss பண்ணலாம் சார்.',
    ],
    action: 'continue',
  },

  // ── 24. "Tell me everything about my account" ──────────────────────
  {
    intent: 'account_summary',
    minScore: 1,
    phraseKeywords: [
      'full details', 'எல்லாமே சொல்லுங்க', 'account details',
      'en account', 'என் account', 'my account',
      'complete details', 'all details', 'summary சொல்லுங்க',
      'என் சீட் details', 'my chit details',
    ],
    tokenKeywords: ['summary', 'details'],
    responses: [
      '{{customerName}} சார், உங்க {{chitValue}} சீட் — {{currentDue}}வது due, ₹{{dueAmount}} சார். அடுத்த due date {{nextDueDate}} சார். Premature-ஆ எடுத்தா ₹{{withdrawalAmount}} கிடைக்கும் சார். வேற ஏதாவது கேள்வி இருக்கா சார்?',
    ],
    action: 'continue',
  },

  // ── 25. Repeat / didn't hear ───────────────────────────────────────
  {
    intent: 'repeat_request',
    minScore: 1,
    phraseKeywords: [
      'மறுபடியும் சொல்லுங்க', 'repeat பண்ணுங்க', 'என்ன சொன்னீங்க',
      'சரியா கேட்கல', 'புரியல', 'again சொல்லுங்க',
      'pardon', 'come again', 'கேட்கல', 'சொல்லுங்க please',
      'ஒரு தடவை சொல்லுங்க', 'once more', 'மறுபடி',
    ],
    tokenKeywords: ['repeat', 'again', 'pardon', 'மறுபடி'],
    responses: [
      'சரி சார்! {{customerName}} சார், உங்க {{chitValue}} சீட் — {{currentDue}}வது due ₹{{dueAmount}} சார். {{nextDueDate}} last date சார். வேற ஏதாவது கேள்வி சார்?',
    ],
    action: 'continue',
  },

  // ── 26. Thank you / appreciation ───────────────────────────────────
  {
    intent: 'appreciation',
    minScore: 2,
    phraseKeywords: [
      'நல்லா explain', 'நல்லா சொன்னீங்க', 'good service',
      'thanks for info', 'நன்றி information-க்கு',
      'clear-ஆ சொன்னீங்க', 'helpful', 'useful info',
    ],
    tokenKeywords: ['helpful', 'useful'],
    responses: [
      'நன்றி சார்! வேற ஏதாவது கேள்வி இருந்தா எப்பவும் call பண்ணுங்க சார். நல்லா இருங்க சார்.',
      'Thank you சார்! எப்பவும் help பண்ண ready சார். நன்றி சார்.',
    ],
    action: 'continue',
  },
];

/**
 * Score a Q&A pair against user text.
 * phraseKeywords = multi-word substring match → 3 points each
 * tokenKeywords  = single word match → 1 point each
 */
function scoreQaPair(qa, normalizedInput) {
  let score = 0;
  let phraseHits = 0;
  for (const phrase of qa.phraseKeywords || []) {
    if (normalizedInput.includes(phrase.toLowerCase())) {
      score += 3;
      phraseHits++;
    }
  }
  for (const token of qa.tokenKeywords || []) {
    if (token.length >= 2 && normalizedInput.includes(token.toLowerCase())) score += 1;
  }
  // Bonus: multiple phrase hits → stronger signal
  if (phraseHits >= 2) score += 2;
  return score;
}

/**
 * Pick a random response from the responses array.
 */
function pickResponse(qa) {
  const arr = qa.responses || [qa.response];
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Normalize input for Q&A matching:
 * - lowercase + trim
 * - remove punctuation characters common in STT output
 * - normalize common Romanized Tamil / Tanglish phonetic variants
 * - collapse repeated spaces
 */
function normalizeForQA(text) {
  let t = text
    .toLowerCase()
    .trim()
    .replace(/[.,!?;:'"(){}\[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const phonetics = [
    [/\baam[aā]\b/g, 'ஆமா'],
    [/\baamam\b/g, 'ஆமாம்'],
    [/\bhaan\b/g, 'ஆமா'],
    [/\bhmm+\b/g, 'ஆமா'],
    [/\byeah?\b/g, 'yes'],
    [/\byep\b/g, 'yes'],
    [/\bnope\b/g, 'no'],
    [/\bnah\b/g, 'no'],
    [/\bokay\b/g, 'ok'],
    [/\bvendaam\b/g, 'வேண்டாம்'],
    [/\bvenaam\b/g, 'வேண்டாம்'],
    [/\bvendum\b/g, 'வேணும்'],
    [/\billa\b/g, 'இல்ல'],
    [/\billai\b/g, 'இல்ல'],
    [/\bsari\b/g, 'சரி'],
    [/\bpanam\b/g, 'பணம்'],
    [/\bkashtam\b/g, 'கஷ்டம்'],
    [/\bkatturen\b/g, 'கட்டுறேன்'],
    [/\bkattiduren\b/g, 'கட்டிடுறேன்'],
    [/\bkattitten\b/g, 'கட்டிட்டேன்'],
    [/\bkattachu\b/g, 'கட்டாச்சு'],
    [/\bpottachu\b/g, 'போட்டாச்சு'],
    [/\bpottutten\b/g, 'போட்டுட்டேன்'],
    [/\bkudukanum\b/g, 'குடுக்கணும்'],
    [/\bkuduthaachu\b/g, 'குடுத்தாச்சு'],
    [/\bmudiyala?\b/g, 'முடியல'],
    [/\bpuriyala?\b/g, 'புரியல'],
    [/\bnandri\b/g, 'நன்றி'],
    [/\bvanakkam\b/g, 'வணக்கம்'],
    [/\bsollunga\b/g, 'சொல்லுங்க'],
    [/\bnaalaiku\b/g, 'நாளைக்கு'],
    [/\bnaalaikku\b/g, 'நாளைக்கு'],
    [/\bappuram\b/g, 'அப்புறம்'],
    [/\bg[\s-]?pay\b/g, 'gpay'],
    [/\bphone[\s-]?pe\b/g, 'phonepe'],
    [/\bkulukkal\b/g, 'குலுக்கல்'],
    [/\bkalanthukiren\b/g, 'கலந்துக்கிறேன்'],
    [/\bkalanthukka\b/g, 'கலந்துக்க'],
    [/\bjameen\b/g, 'jamin'],
    [/\bseetu?\b/g, 'சீட்'],
    [/\bwrong\s*number\b/g, 'wrong number'],
    [/\bwhatsapp?\b/g, 'whatsapp'],
    [/\bnominee?\b/g, 'nominee'],
    [/\binstall?ment\b/g, 'installment'],
    [/\bdisturb\b/g, 'disturb'],
    [/\birritat(?:ing|e)\b/g, 'irritating'],
    [/\bharass(?:ment)?\b/g, 'harass'],
    [/\binterest(?:ed)?\b/g, 'interested'],
    [/\beppo\b/g, 'எப்போ'],
    [/\beppadi\b/g, 'எப்படி'],
    [/\benna\b/g, 'என்ன'],
    [/\bevlo\b/g, 'எவ்ளோ'],
    [/\bethana\b/g, 'எத்தன'],
  ];

  for (const [pattern, replacement] of phonetics) {
    t = t.replace(pattern, replacement);
  }

  return t.replace(/\s+/g, ' ').trim();
}

async function findExactAnswer(userText, metadata = {}, silent = false) {
  const normalized = normalizeForQA(userText);
  const pairs = await loadQaPairs();

  let bestMatch = null;
  let bestScore = 0;

  for (const qa of pairs) {
    const score = scoreQaPair(qa, normalized);
    const min = qa.minScore ?? 1;
    if (score >= min && score > bestScore) {
      bestScore = score;
      bestMatch = qa;
    }
  }

  if (bestMatch) {
    const rawResponse = pickResponse(bestMatch);
    const response    = applyTemplate(rawResponse, metadata);
    if (!silent) logger.info(`Q&A match: intent="${bestMatch.intent}" score=${bestScore} → "${response}"`);
    return {
      response,
      intent: bestMatch.intent,
      action: bestMatch.action || 'continue',
      confidence: Math.min(0.99, 0.80 + bestScore * 0.04),
      data: {},
    };
  }

  return null;
}

// ─── Intent Detection ──────────────────────────────────────────────────────────

/**
 * Detect intent from Tamil user input
 * Uses keyword matching + LLM for maximum accuracy
 * @param {string} userText - Tamil text from STT
 * @returns {Object} { intent, confidence, keywords }
 */
const _lastExactMatch = new Map();

async function detectIntent(userText, metadata = {}) {
  if (!userText || userText.trim().length < 2) {
    return { intent: 'unknown', confidence: 0.0, keywords: [] };
  }

  // Step 0: Exact Q&A match → high confidence, no LLM needed (silent=true to avoid double-logging)
  const exact = await findExactAnswer(userText, metadata, true);
  if (exact) {
    _lastExactMatch.set(userText, exact);
    return { intent: exact.intent, confidence: 0.95, keywords: [] };
  }

  // Step 1: Fast keyword-based pre-detection
  const keywordResult = keywordDetect(userText);

  // Step 2: If keyword confidence is high enough, skip LLM call
  if (keywordResult.confidence >= CONFIDENCE_THRESHOLDS.HIGH) {
    logger.debug(`Intent from keywords: ${keywordResult.intent} (${keywordResult.confidence})`);
    return keywordResult;
  }

  // Step 3: Use LLM for nuanced intent detection (fast model for classification)
  try {
    const prompt = TAMIL_PROMPTS.INTENT_DETECTION_PROMPT.replace('{USER_TEXT}', userText);

    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_INTENT_MODEL || 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      max_tokens: 150,
      temperature: 0.1,
    });

    const result = JSON.parse(response.choices[0].message.content);

    // Combine keyword and LLM confidence
    let finalConfidence = result.confidence || 0.5;
    if (keywordResult.intent === result.intent) {
      // Both agree → boost confidence
      finalConfidence = Math.min(1.0, finalConfidence + 0.15);
    }

    logger.info(`Intent detected: ${result.intent} (confidence: ${finalConfidence.toFixed(2)})`);

    return {
      intent: result.intent || 'unknown',
      confidence: finalConfidence,
      keywords: result.keywords || keywordResult.keywords,
    };

  } catch (error) {
    logger.error('LLM intent detection error:', error.message);
    // Fall back to keyword detection
    return keywordResult;
  }
}

/**
 * Fast keyword-based intent detection (no API call)
 */
function keywordDetect(text) {
  const normalized = normalizeForQA(text);
  let bestIntent = 'unknown';
  let bestScore = 0;
  let matchedKeywords = [];

  for (const [intent, keywords] of Object.entries(TAMIL_KEYWORDS)) {
    const matches = keywords.filter(kw => normalized.includes(kw.toLowerCase()));
    const score = matches.length / keywords.length;

    if (score > bestScore) {
      bestScore = score;
      bestIntent = intent;
      matchedKeywords = matches;
    }
  }

  return {
    intent: bestIntent,
    confidence: Math.min(0.85, bestScore * 2),
    keywords: matchedKeywords,
  };
}

// ─── Response Generation ───────────────────────────────────────────────────────

/**
 * Generate AI response for a detected intent
 * Maintains conversation context across turns
 * @param {string} intent - Detected intent
 * @param {string} userText - User's Tamil input
 * @param {Array} conversationHistory - Previous turns [{role, content}]
 * @param {Object} callMetadata - Call context (order ID, customer info, etc.)
 * @returns {Object} { response, action, confidence, data }
 */
async function generateResponse(intent, userText, conversationHistory = [], callMetadata = {}) {
  const startTime = Date.now();

  // ── Step 0: Check exact Q&A lookup (use cache from detectIntent if available) ──
  const cachedExact = _lastExactMatch.get(userText);
  if (cachedExact) {
    _lastExactMatch.delete(userText);
    return { ...cachedExact, processingTimeMs: Date.now() - startTime };
  }
  const exact = await findExactAnswer(userText, callMetadata);
  if (exact) {
    return { ...exact, processingTimeMs: Date.now() - startTime };
  }

  // Build context-aware system prompt
  const systemPrompt = buildSystemPrompt(intent, callMetadata);

  // Prepare messages with conversation history (last 10 turns = 5 exchanges for better context)
  const recentHistory = conversationHistory.slice(-10);
  const messages = [
    { role: 'system', content: systemPrompt },
    ...recentHistory,
    { role: 'user', content: userText },
  ];

  try {
    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o',
      messages,
      response_format: { type: 'json_object' },
      max_tokens: 300,
      temperature: 0.5,
    });

    const result = JSON.parse(response.choices[0].message.content);
    const processingTime = Date.now() - startTime;

    logger.info(`AI response generated in ${processingTime}ms, action: ${result.action}`);

    const fallbackText = result.response ? null : await getPromptText('FALLBACK_LOW_CONFIDENCE', callMetadata);
    const rawResp = result.response || fallbackText;
    return {
      response: applyTemplate(rawResp, callMetadata),
      action: result.action || 'continue', // continue | escalate | end_call
      confidence: result.confidence || 0.7,
      intent: result.intent || intent,
      data: result.data || {},
      processingTimeMs: processingTime,
    };

  } catch (error) {
    logger.error('LLM response generation error:', error.message);

    // Return safe fallback from DB (with hardcoded fallback if DB is down)
    const fallbackResp = await getPromptText('FALLBACK_LOW_CONFIDENCE', callMetadata);
    return {
      response: fallbackResp,
      action: 'continue',
      confidence: 0.3,
      intent,
      data: {},
      processingTimeMs: Date.now() - startTime,
    };
  }
}

/**
 * Build intent-specific system prompt with context
 */
function buildSystemPrompt(intent, metadata = {}) {
  const CONTEXT_MAP = {
    seat_due_status: TAMIL_PROMPTS.SEAT_DUE_CONTEXT,
    premature_withdrawal: TAMIL_PROMPTS.PREMATURE_WITHDRAWAL_CONTEXT,
    jamin_documents: TAMIL_PROMPTS.JAMIN_CONTEXT,
    payment_complaint: TAMIL_PROMPTS.PAYMENT_COMPLAINT_CONTEXT,
    reduce_calls: TAMIL_PROMPTS.REDUCE_CALLS_CONTEXT,
    no_office_calls: TAMIL_PROMPTS.NO_OFFICE_CALLS_CONTEXT,
    lottery_participation: TAMIL_PROMPTS.LOTTERY_PARTICIPATION_CONTEXT,
    lottery_decline: TAMIL_PROMPTS.LOTTERY_PARTICIPATION_CONTEXT,
    partial_payment: TAMIL_PROMPTS.PARTIAL_PAYMENT_CONTEXT,
    angry_customer: TAMIL_PROMPTS.ANGRY_CUSTOMER_CONTEXT,
    chit_completion: TAMIL_PROMPTS.CHIT_COMPLETION_CONTEXT,
    account_summary: TAMIL_PROMPTS.ACCOUNT_SUMMARY_CONTEXT,
    identity_confirm: TAMIL_PROMPTS.GENERAL_HELP_CONTEXT,
    identity_deny: TAMIL_PROMPTS.GENERAL_HELP_CONTEXT,
    callback_request: TAMIL_PROMPTS.GENERAL_HELP_CONTEXT,
    caller_identity: TAMIL_PROMPTS.GENERAL_HELP_CONTEXT,
    repeat_request: TAMIL_PROMPTS.ACCOUNT_SUMMARY_CONTEXT,
    already_paid: TAMIL_PROMPTS.GENERAL_HELP_CONTEXT,
    payment_date_inquiry: TAMIL_PROMPTS.GENERAL_HELP_CONTEXT,
    payment_mode: TAMIL_PROMPTS.GENERAL_HELP_CONTEXT,
    chit_value_inquiry: TAMIL_PROMPTS.GENERAL_HELP_CONTEXT,
    whatsapp_request: TAMIL_PROMPTS.GENERAL_HELP_CONTEXT,
    nominee_inquiry: TAMIL_PROMPTS.GENERAL_HELP_CONTEXT,
    profit_inquiry: TAMIL_PROMPTS.GENERAL_HELP_CONTEXT,
    appreciation: TAMIL_PROMPTS.GENERAL_HELP_CONTEXT,
  };

  if (intent === 'human_request') {
    return applyTemplate(`${TAMIL_PROMPTS.SYSTEM_PROMPT}\n\nவாடிக்கையாளர் senior / manager-கிட்ட பேசணும்னு கேக்குறாங்க.
action: "escalate" என்று திரும்பவும்.
response: "${TAMIL_PROMPTS.HUMAN_REQUESTED}"`, metadata);
  }

  if (intent === 'end_call') {
    return applyTemplate(`${TAMIL_PROMPTS.SYSTEM_PROMPT}\n\nவாடிக்கையாளர் call முடிக்கணும்னு சொல்றாங்க.
action: "end_call" என்று திரும்பவும்.
response: "${TAMIL_PROMPTS.GOODBYE}"`, metadata);
  }

  let contextAddition = CONTEXT_MAP[intent] || TAMIL_PROMPTS.GENERAL_HELP_CONTEXT;

  if (metadata.customerName) {
    contextAddition += `\nவாடிக்கையாளர் பெயர்: ${metadata.customerName}`;
  }

  const rawPrompt = `${TAMIL_PROMPTS.SYSTEM_PROMPT}\n\n${contextAddition}`;
  return applyTemplate(rawPrompt, metadata);
}

// ─── Conversation Manager ──────────────────────────────────────────────────────

/**
 * In-memory conversation context store
 * For production, consider Redis for multi-instance support
 */
const conversationContexts = new Map();

/**
 * Get or create conversation context for a call
 */
function getConversationContext(callId) {
  if (!conversationContexts.has(callId)) {
    conversationContexts.set(callId, {
      history: [],
      turnCount: 0,
      lowConfidenceStreak: 0,
      silenceCount: 0,
      lastIntent: null,
    });
  }
  return conversationContexts.get(callId);
}

/**
 * Update conversation context after each turn
 */
function updateConversationContext(callId, userText, aiResponse, intent, confidence) {
  const ctx = getConversationContext(callId);

  // Add to history
  ctx.history.push({ role: 'user', content: userText });
  ctx.history.push({ role: 'assistant', content: aiResponse });
  ctx.turnCount++;
  ctx.lastIntent = intent;

  // Track low confidence streaks for escalation
  if (confidence < CONFIDENCE_THRESHOLDS.MEDIUM) {
    ctx.lowConfidenceStreak++;
  } else {
    ctx.lowConfidenceStreak = 0;
  }

  conversationContexts.set(callId, ctx);
  return ctx;
}

/**
 * Increment silence count
 */
function incrementSilenceCount(callId) {
  const ctx = getConversationContext(callId);
  ctx.silenceCount++;
  conversationContexts.set(callId, ctx);
  return ctx.silenceCount;
}

/**
 * Clear conversation context when call ends
 */
function clearConversationContext(callId) {
  conversationContexts.delete(callId);
}

/**
 * Determine if call should be escalated based on context
 * Escalate if: 3+ consecutive low confidence OR 2+ silences
 */
function shouldEscalate(callId, currentConfidence) {
  const ctx = getConversationContext(callId);

  if (ctx.lowConfidenceStreak >= 3) return { escalate: true, reason: 'repeated_low_confidence' };
  if (ctx.silenceCount >= 2) return { escalate: true, reason: 'repeated_silence' };

  return { escalate: false };
}

module.exports = {
  detectIntent,
  generateResponse,
  getConversationContext,
  updateConversationContext,
  incrementSilenceCount,
  clearConversationContext,
  shouldEscalate,
  invalidateTemplateCache,
  getPromptText,
};
