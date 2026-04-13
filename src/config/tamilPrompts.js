/**
 * Tamil Prompt Templates for KuralAI
 * Persona: மகாலக்ஷ்மி — Chit Fund Company Agent
 * Professional, warm, respectful tone using "சார்"
 */

const TAMIL_PROMPTS = {
  // ─── System Prompt ────────────────────────────────────────────────────────
  SYSTEM_PROMPT: `நீங்கள் மகாலக்ஷ்மி — Automystic Chit Fund Company-யிட இருந்து customer-களுக்கு call பண்ணும் professional AI agent.

Business Context:
- Customer Name: {{customerName}}
- சீட் Value: {{chitValue}}
- {{currentDue}}வது due — due amount: ₹{{dueAmount}}
- அடுத்த due date: {{nextDueDate}}
- மொத்த dues: {{totalDues}}
- Premature withdrawal amount: {{withdrawalAmount}}

பேசும் style:
- Professional, respectful — "சார்" னு address பண்ணுங்க
- Short, clear sentences — phone call feel
- Tamil with natural English mix (amount, due, chit, seat, cheque)
- Warm but not over-friendly

விதிகள்:
- எப்பவும் தமிழிலே பேசுங்க
- Customer கோபமா பேசினா — பொறுமையா, politely respond பண்ணு
- மனுஷன் வேணும்னா "ESCALATE" குறிப்பிடு
- Call முடியணும்னா "END_CALL" குறிப்பிடு
- Confidence score 0.0 – 1.0 கொடு

JSON format-ல பதில் கொடு:
{
  "response": "தமிழ் பதில் இங்கே",
  "intent": "detected_intent",
  "confidence": 0.95,
  "action": "continue|escalate|end_call",
  "data": {}
}`,

  // ─── Greeting ──────────────────────────────────────────────────────────────
  // Uses {{customerName}} — resolved at call time from customer metadata.
  GREETING: "வணக்கம் சார்! நான் மகாலக்ஷ்மி பேசுறேன் சார், Automystic Company-யிட இருந்து. {{customerName}} சார்ங்களா சார்?",

  GREETING_REPEAT: "ஒரு நிமிஷம் சார் — சரியா கேட்கல. மறுபடியும் சொல்லுங்களா சார்?",

  // ─── Intent Contexts ───────────────────────────────────────────────────────
  SEAT_DUE_CONTEXT: `Customer இன்னொரு சீட்-ல எத்தன due போய்ட்டு இருக்குன்னு கேக்குறாங்க.
சரியான பதில்: "6வது due சார்" னு direct-ஆ சொல்லு.`,

  PREMATURE_WITHDRAWAL_CONTEXT: `Customer இப்போவே சீட் எடுத்தா எவ்ளோ amount கிடைக்கும்னு கேக்குறாங்க.
சரியான பதில்: "இப்போ எடுத்தா ₹3,55,000 சார்" னு direct-ஆ சொல்லு.`,

  JAMIN_CONTEXT: `Customer jamin (security documents) என்ன குடுக்கணும்னு கேக்குறாங்க.
சரியான பதில்: "2 family jamin, 2 other jamin, 4 cheque leaf குடுக்கணும் சார்" னு சொல்லு.`,

  PAYMENT_COMPLAINT_CONTEXT: `Customer amount குடுக்க முடியல / afford பண்ண முடியல / மாசம் மாசம் கேக்குறீங்கன்னு complaint பண்றாங்க.
பொறுமையா, politely respond பண்ணு: "மன்னிக்கணும் சார். உங்களுக்கு convenient-ஆன நேரம் பாத்து arrange பண்றோம் சார். கஷ்டப்படாதீங்க சார்."`,

  REDUCE_CALLS_CONTEXT: `Customer too many people calling / ஒருத்தர் மட்டும் call பண்ணுங்கன்னு சொல்றாங்க.
பதில்: "சரி சார், இனிமே ஒருத்தர் மட்டும் call பண்றோம். Inconvenience-க்கு மன்னிக்கணும் சார். நன்றி சார்." — then END_CALL.`,

  NO_OFFICE_CALLS_CONTEXT: `Customer ஆஃபீஸ்-ல இருந்து call பண்டீங்க வேண்டாம் / staff-கிட்ட கேட்டுக்கிறோம்னு சொல்றாங்க.
பதில்: "சரி சார், புரிஞ்சது. மன்னிக்கணும் சார். இனிமே ஆஃபீஸ்-ல call பண்ண மாட்டோம் சார். நன்றி சார்." — then END_CALL.`,

  LOTTERY_PARTICIPATION_CONTEXT: `Customer குலுக்கல்ல (lottery) கலந்துக்க விருப்பம் இருக்கான்னு பேசுறாங்க.
விருப்பம் இருந்தா: "நல்லது சார்! அடுத்த மாசம் 7ம் தேதி குலுக்கல் சார். Due amount ₹18,750 சார். Ready-ஆ இருங்க சார்."
விருப்பம் இல்லன்னா: "சரி சார். Next time பாக்கலாம் சார். Due மட்டும் time-க்கு குடுங்க சார்."`,

  GENERAL_HELP_CONTEXT: `Customer general question கேக்குறாங்க.
Call purpose explain பண்ணு: "சார், அடுத்த மாசம் 7ம் தேதி உங்களுக்கு 5 லட்சம் சீட் இருக்கு சார். 3வது due, amount ₹18,750 சார். குலுக்கல்ல கலந்துகிறதுக்கு விருப்பம் இருக்கா சார்?"`,

  // ─── Fallback Messages ─────────────────────────────────────────────────────
  FALLBACK_LOW_CONFIDENCE: "ஒரு நிமிஷம் சார் — சரியா புரியல. கொஞ்சம் மறுபடியும் சொல்லுங்களா சார்?",

  FALLBACK_SILENCE: "ஹலோ சார்? கேக்குறீங்களா? மறுபடியும் பேசுங்களா சார்?",

  FALLBACK_REPEATED: "சரி சார், இந்த விஷயத்தை எங்க senior-கிட்ட பாக்குறோம். இப்போ transfer பண்றேன் சார்.",

  // ─── Escalation ────────────────────────────────────────────────────────────
  ESCALATION_MESSAGE: "சரி சார், நான் உங்களை எங்க senior-கிட்ட transfer பண்றேன். ஒரு நிமிஷம் இருங்க சார்.",

  HUMAN_REQUESTED: "சரி சார், உடனே ஒரு senior member-கிட்ட line போடுறேன். ஒரு நிமிஷம் இருங்க சார்.",

  // ─── Call End ──────────────────────────────────────────────────────────────
  GOODBYE: "நன்றி சார்! உங்களோட நேரம் எடுத்ததுக்கு மன்னிக்கணும் சார். நல்லா இருங்க சார். வணக்கம்!",

  // ─── Recording Consent ─────────────────────────────────────────────────────
  RECORDING_CONSENT: "இந்த call quality improvement-க்காக record ஆகும் சார். தொடர்ந்தா agree பண்றீங்கன்னு அர்த்தம்.",

  // ─── Intent Detection Prompt ───────────────────────────────────────────────
  INTENT_DETECTION_PROMPT: `கீழே உள்ள Tamil வாக்கியத்தோட intent என்னன்னு கண்டுபிடி:

"{USER_TEXT}"

Possible intents (chit fund context):
1. seat_due_status — இன்னொரு சீட்-ல எத்தன due போய்ட்டு இருக்குன்னு கேக்குறாங்க
2. premature_withdrawal — இப்போ எடுத்தா எவ்ளோ amount கிடைக்கும்னு / சீட் close / cancel / refund
3. jamin_documents — jamin / security / documents என்ன குடுக்கணும்னு கேக்குறாங்க
4. payment_complaint — amount குடுக்க மாட்டீங்க / afford பண்ண முடியல / salary வரல / EMI
5. reduce_calls — எத்தன பேரு call / ஒருத்தர் மட்டும் / DND / too many calls / disturb
6. no_office_calls — ஆஃபீஸ்-ல இருந்து call வேண்டாம் / staff-கிட்ட / workplace
7. lottery_participation — குலுக்கல்ல விருப்பம் / interested / கலந்துக்கிறேன் / participate
8. lottery_decline — குலுக்கல் வேண்டாம் / this time வேண்டாம் / skip
9. identity_confirm — ஆமா / நான் தான் / yes / correct / பேசுறேன்
10. identity_deny — wrong number / நான் இல்ல / தவறான number / available இல்ல
11. already_paid — கட்டிட்டேன் / paid already / UPI பண்ணிட்டேன் / GPay / bank-ல போட்டேன்
12. callback_request — later call / busy / driving / tomorrow / அப்புறம் call
13. payment_date_inquiry — எப்போ கட்டணும் / due date / last date / penalty / fine
14. chit_value_inquiry — சீட் value / எவ்ளோ சீட் / scheme details / plan details
15. payment_mode — எப்படி கட்டணும் / UPI / GPay / account details / bank details
16. human_request — ஆளை கூப்பிடுங்க / senior / manager / complaint / புகார்
17. end_call — நன்றி / bye / வேண்டாம் / முடிஞ்சது / ok thanks

JSON-ல பதில் கொடு:
{"intent": "intent_name", "confidence": 0.95, "keywords": ["detected", "keywords"]}`,
};

// ─── Intent Confidence Thresholds ──────────────────────────────────────────────
const CONFIDENCE_THRESHOLDS = {
  HIGH: 0.8,
  MEDIUM: 0.5,
  LOW: 0.3,
  ESCALATE: 0.2
};

// ─── Chit Fund Keywords for Fast Detection ────────────────────────────────────
const TAMIL_KEYWORDS = {
  seat_due_status: [
    'இன்னொரு சீட்', 'எத்தனாவது due', 'எத்தன due', 'due போய்ட்டு', 'due இருக்கு', '6வது', 'மத்த சீட்',
    'எத்தனாவது சீட்', 'வேற சீட்', 'other seat', 'மத்த chit', 'எத்தனாவது month', 'due balance',
    'எத்தனாவது மாதம்', 'due எத்தன', 'எத்தன installment', 'எத்தன தவணை', 'due status',
    'எத்தன மாசம் ஆச்சு', 'எத்தன மாதம் ஆச்சு', 'எத்தன போச்சு',
  ],
  premature_withdrawal: [
    'இப்போ எடுத்தா', 'எவ்ளோ அமௌன்ட்', 'எவ்ளோ குடுப்பிங்க', 'amount கிடைக்கும்', 'withdraw', 'premature', 'எடுத்தா',
    'இப்போவே எடுத்தா', 'இப்ப எடுத்தா', 'surrender value', 'முன்கூட்டியே', 'முன்பே எடுத்தா',
    'எடுத்தா எவ்ளோ', 'எவ்வளவு கிடைக்கும்', 'early withdrawal', 'close பண்ணா',
    'சீட் close', 'சீட் நிறுத்த', 'stop பண்ண', 'நிறுத்தணும்', 'cancel பண்ண',
    'refund', 'ரீஃபண்ட்', 'பணம் திரும்ப', 'return amount',
  ],
  jamin_documents: [
    'jamin', 'ஜாமீன்', 'document', 'cheque', 'cheque leaf', 'என்ன குடுக்கணும்', 'security', 'guarantee',
    'என்ன document', 'செக்', 'collateral', 'property document', 'land document', 'family document',
    'என்ன தரணும்', 'என்னென்ன தரணும்', 'surety', 'ஷ்யூரிட்டி', 'guarantor',
    'ஆவணம்', 'ஆவணங்கள்', 'என்னென்ன document', 'எத்தன cheque',
  ],
  payment_complaint: [
    'குடுக்க மாட்டிங்க', 'afford', 'கஷ்டம்', 'பணம் இல்ல', 'amount இல்ல', 'மாத மாதம்', 'மாசம் மாசம்', 'கேக்குறீங்க',
    'கஷ்டமா இருக்கு', 'முடியல', 'எங்களால முடியல', 'pay பண்ண முடியல',
    'salary வரல', 'சம்பளம் வரல', 'வேலை இல்ல', 'job இல்ல', 'financial problem',
    'கடன் இருக்கு', 'loan இருக்கு', 'EMI இருக்கு', 'EMI கட்டணும்',
    'இப்போ கொடுக்க முடியாது', 'later குடுக்கிறேன்', 'அப்புறம் குடுக்கிறேன்',
    'பணம் கஷ்டம்', 'pay later', 'time குடுங்க', 'நேரம் குடுங்க',
  ],
  reduce_calls: [
    'எத்தன பேரு', 'ஒருத்தர்', 'ஒரே ஒருத்தர்', 'பல பேரு call', 'யாரோட ஒருத்தர்', 'ஒருத்தர் மட்டும்',
    'ஒருத்தர் மட்டும் call', 'single person', 'one person', 'ஒரு பேரு மட்டும்',
    'too many calls', 'repeated calls', 'திரும்ப திரும்ப', 'again and again',
    'நிறுத்துங்க calls', 'daily call', 'தினமும் call', 'ரொம்ப call',
    'DND', 'do not disturb', 'disturb பண்ணாதீங்க', 'disturbance',
  ],
  no_office_calls: [
    'ஆஃபீஸ்', 'office', 'staff', 'ஸ்டாஃப்', 'கேட்டுக்குறோம்', 'வேண்டாம்',
    'office call வேண்டாம்', 'workplace', 'work place', 'company number',
    'office number', 'ஆஃபீஸ் நம்பர்', 'colleagues கிட்ட', 'boss கிட்ட',
    'office இருந்து வேண்டாம்', 'work-ல call', 'professional number',
  ],
  lottery_participation: [
    'குலுக்கல்', 'lottery', 'கலந்துக்கிறேன்', 'விருப்பம்', 'interested', 'ஆமா கலந்துக்கிறேன்',
    'participate', 'கலந்துக்க', 'participate பண்றேன்', 'lot போடு', 'lot எப்போ',
    'குலுக்கல் எப்போ', 'lottery date', 'draw date', 'next draw',
    'குலுக்கல்ல கலந்துக்கிறேன்', 'interested சார்', 'ready சார்', 'ஓகே participate',
    'எப்போ குலுக்கல்', 'lottery எப்போ',
  ],
  lottery_decline: [
    'குலுக்கல் வேண்டாம்', 'lottery வேண்டாம்', 'participate பண்ண வேண்டாம்',
    'இல்ல வேண்டாம்', 'this time வேண்டாம்', 'next time', 'அடுத்த தடவை',
    'இப்போ வேண்டாம் சார்', 'skip', 'skip பண்றேன்',
  ],
  identity_confirm: [
    'ஆமா', 'ஆமாம்', 'நான் தான்', 'பேசுறேன்', 'நான் பேசுறேன்', 'yes', 'yeah',
    'ஆமா நான்', 'ஆமா சார்', 'ஆமாம் சார்', 'yes சார்', 'ஆமாண்டா',
    'சரி சொல்லுங்க', 'சொல்லுங்க சார்', 'correct', 'right', 'haan',
  ],
  identity_deny: [
    'தப்பு', 'wrong number', 'wrong person', 'நான் இல்ல', 'வேற ஆளு', 'அவரு இல்ல',
    'இது wrong number', 'தவறான number', 'யாரோ', 'who is this', 'யாரு நீங்க',
    'அவரு வெளியில போயிருக்காரு', 'available இல்ல', 'not available',
    'அவரு இங்க இல்ல', 'வர மாட்டாரு', 'busy-ஆ இருக்காரு',
  ],
  already_paid: [
    'already paid', 'கட்டிட்டேன்', 'கட்டாச்சு', 'போட்டாச்சு', 'pay பண்ணிட்டேன்',
    'amount குடுத்தாச்சு', 'already குடுத்தாச்சு', 'செலுத்திட்டேன்', 'paid already',
    'நேத்து கட்டினேன்', 'yesterday paid', 'today morning கட்டினேன்',
    'online transfer பண்ணிட்டேன்', 'NEFT பண்ணிட்டேன்', 'UPI பண்ணிட்டேன்',
    'GPay-ல போட்டேன்', 'PhonePe-ல போட்டேன்', 'bank-ல போட்டேன்',
  ],
  callback_request: [
    'அப்புறம் call பண்ணுங்க', 'later call', 'பின்னாடி call', 'இப்போ busy',
    'meeting-ல இருக்கேன்', 'busy-ஆ இருக்கேன்', 'driving', 'drive பண்றேன்',
    'கொஞ்ச நேரம் கழிச்சு', 'half an hour கழிச்சு', 'evening call பண்ணுங்க',
    'tomorrow call', 'நாளைக்கு call', 'சாயங்காலம் call', 'later சார்',
    'மதியம் call பண்ணுங்க', 'free-ஆ இருக்கும்போது', 'அப்புறம் பேசுவோம்',
  ],
  payment_date_inquiry: [
    'எப்போ கட்டணும்', 'due date', 'எந்த தேதி', 'last date', 'due date என்ன',
    'எப்போ pay', 'deadline', 'எப்போ வரும்', 'அடுத்த due எப்போ',
    'எந்த date-க்குள்ள', 'time limit', 'எத்தனை நாள் இருக்கு',
    'due date கடந்துடுச்சா', 'late-ஆ கட்டினா', 'fine வருமா', 'penalty',
  ],
  chit_value_inquiry: [
    'சீட் value என்ன', 'எவ்ளோ சீட்', 'chit value', 'எவ்ளோ amount சீட்',
    'எவ்ளோ ரூபாய் சீட்', 'chit amount', 'total value', 'மொத்தம் எவ்ளோ',
    'scheme details', 'plan details', 'scheme என்ன', 'plan என்ன',
  ],
  payment_mode: [
    'எப்படி கட்டணும்', 'online pay', 'UPI', 'GPay', 'PhonePe', 'NEFT',
    'bank transfer', 'cash', 'கேஷ்', 'account number', 'account details',
    'bank details', 'QR code', 'payment link', 'payment method',
    'எந்த account', 'எந்த bank', 'how to pay',
  ],
  human_request: [
    'ஆளை', 'senior', 'manager', 'பேசணும்', 'transfer', 'line போடு', 'வேற ஆள்',
    'human', 'real person', 'actual person', 'agent கிட்ட', 'supervisor',
    'owner கிட்ட', 'MD கிட்ட', 'director கிட்ட', 'head office',
    'boss கிட்ட பேசணும்', 'யாரோட பேசணும்', 'in-charge',
    'complain', 'complaint', 'புகார்',
  ],
  end_call: [
    'நன்றி', 'bye', 'வேண்டாம்', 'முடிஞ்சது', 'ok thanks', 'சரி நன்றி', 'போகிறேன்', 'வச்சுக்கோங்க',
    'சரி வைங்க', 'ok bye', 'வைங்க சார்', 'that\'s all', 'goodbye', 'போறேன்',
    'thank you', 'thanks சார்', 'ok ok', 'சரி சரி', 'ok fine',
    'noted', 'கவனிச்சுக்கிறேன்', 'பாக்குறேன்', 'சரி பாக்குறேன்',
  ],
};

module.exports = { TAMIL_PROMPTS, CONFIDENCE_THRESHOLDS, TAMIL_KEYWORDS };
