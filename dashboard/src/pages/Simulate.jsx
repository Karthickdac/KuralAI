import React, { useState, useRef, useEffect, useCallback } from 'react';
import Sidebar from '../components/Sidebar';
import { simulateApi, workflowsApi, customersApi } from '../api/client';
import styles from './Simulate.module.css';

const IDLE        = 'idle';
const STARTING    = 'starting';
const AI_SPEAKING = 'ai_speaking';
const USER_TURN   = 'user_turn';
const RECORDING   = 'recording';
const AI_TURN     = 'ai_turn';
const ENDED       = 'ended';

// ─── Transcript bubble ────────────────────────────────────────────────────────
function TurnBubble({ speaker, text, audioUrl, onPlay }) {
  const isAi = speaker === 'ai';
  return (
    <div className={`${styles.bubble} ${isAi ? styles.aiBubble : styles.userBubble}`}>
      <div className={styles.bubbleHeader}>
        <span className={styles.bubbleSpeaker}>{isAi ? 'மகாலக்ஷ்மி' : 'நீங்கள்'}</span>
        {isAi && audioUrl && (
          <button className={styles.replayBtn} onClick={() => onPlay(audioUrl)} title="Replay audio">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/>
            </svg>
          </button>
        )}
      </div>
      <p className={styles.bubbleText}>{text}</p>
    </div>
  );
}

// ─── Waveform bars (decorative, shown while recording) ────────────────────────
function WaveformBars() {
  return (
    <div className={styles.waveform}>
      {[...Array(12)].map((_, i) => (
        <span key={i} className={styles.bar} style={{ animationDelay: `${i * 0.07}s` }} />
      ))}
    </div>
  );
}

// ─── Customer card ────────────────────────────────────────────────────────────
function CustomerCard({ customer, selected, onSelect }) {
  const meta = customer.metadata || {};
  return (
    <button
      className={`${styles.customerCard} ${selected ? styles.customerCardSelected : ''}`}
      onClick={() => onSelect(customer)}
    >
      <div className={styles.customerCardName}>{customer.name}</div>
      <div className={styles.customerCardPhone}>{customer.phone}</div>
      {meta.chitValue && (
        <div className={styles.customerCardBadge}>₹{meta.chitValue} சீட்</div>
      )}
    </button>
  );
}

// ─── Chit detail panel ────────────────────────────────────────────────────────
function ChitPanel({ customer }) {
  const meta = customer.metadata || {};
  const pendingDues  = meta.pendingDues  ?? (meta.totalDues - meta.completedDues);
  const currentDue   = meta.currentDue   ?? (meta.completedDues + 1);

  return (
    <div className={styles.chitPanel}>
      <div className={styles.chitPanelHeader}>
        <span className={styles.chitPanelName}>{customer.name}</span>
        <span className={styles.chitPanelGroup}>{meta.chitGroup}</span>
      </div>

      <div className={styles.chitStats}>
        <div className={styles.chitStat}>
          <span className={styles.chitStatLabel}>சீட் Value</span>
          <span className={`${styles.chitStatValue} ${styles.chitStatHighlight}`}>₹{meta.chitValue}</span>
        </div>
        <div className={styles.chitStat}>
          <span className={styles.chitStatLabel}>Due Amount</span>
          <span className={styles.chitStatValue}>₹{meta.dueAmount}</span>
        </div>
        <div className={styles.chitStat}>
          <span className={styles.chitStatLabel}>Withdrawal</span>
          <span className={styles.chitStatValue}>₹{meta.withdrawalAmount}</span>
        </div>
        <div className={styles.chitStat}>
          <span className={styles.chitStatLabel}>Current Due</span>
          <span className={`${styles.chitStatValue} ${styles.chitStatHighlight}`}>{currentDue}வது</span>
        </div>
        <div className={styles.chitStat}>
          <span className={styles.chitStatLabel}>Completed</span>
          <span className={styles.chitStatValue}>{meta.completedDues} / {meta.totalDues}</span>
        </div>
        <div className={styles.chitStat}>
          <span className={styles.chitStatLabel}>Pending</span>
          <span className={styles.chitStatValue}>{pendingDues} dues</span>
        </div>
      </div>

      <div className={styles.chitDueRow}>
        <span className={styles.chitDueLabel}>குலுக்கல் தேதி</span>
        <span className={styles.chitDueValue}>{meta.nextDueDate}</span>
      </div>
      <div className={styles.chitDueRow}>
        <span className={styles.chitDueLabel}>Jamin Documents</span>
        <span className={styles.chitDueValue}>{meta.familyJamin} family + {meta.otherJamin} other + {meta.chequeLeaf} cheque leaf</span>
      </div>
      {meta.otherChitDues && (
        <div className={styles.chitDueRow}>
          <span className={styles.chitDueLabel}>இன்னொரு சீட் (other chit)</span>
          <span className={styles.chitDueValue}>{meta.otherChitDues}வது due</span>
        </div>
      )}
    </div>
  );
}

// Check Web Speech API support
const hasSpeechRecognition = !!(window.SpeechRecognition || window.webkitSpeechRecognition);

// ─── Main component ───────────────────────────────────────────────────────────
export default function Simulate() {
  const [phase, setPhase]                   = useState(IDLE);
  const [callId, setCallId]                 = useState(null);
  const [turn, setTurn]                     = useState(0);
  const [transcript, setTranscript]         = useState([]);
  const [textMode, setTextMode]             = useState(!hasSpeechRecognition);
  const [userInput, setUserInput]           = useState('');
  const [error, setError]                   = useState('');
  const [workflows, setWorkflows]           = useState([]);
  const [selectedWf, setSelectedWf]         = useState('');
  const [statusLabel, setStatusLabel]       = useState('');
  const [liveText, setLiveText]             = useState('');
  const [customers, setCustomers]           = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [loadingCustomers, setLoadingCustomers] = useState(true);

  const audioRef        = useRef(null);
  const recognitionRef  = useRef(null);
  const lastTextRef     = useRef('');
  const bottomRef       = useRef(null);
  const textInputRef    = useRef(null);
  const processingRef   = useRef(false);

  useEffect(() => {
    workflowsApi.list().then(r => setWorkflows(r.data || [])).catch(() => {});
    customersApi.list()
      .then(r => {
        const list = r.data || [];
        setCustomers(list);
        if (list.length > 0) setSelectedCustomer(list[0]);
      })
      .catch(() => {})
      .finally(() => setLoadingCustomers(false));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript, phase, liveText]);

  useEffect(() => {
    if (phase === USER_TURN && textMode) textInputRef.current?.focus();
  }, [phase, textMode]);

  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current = null;
    }
  }, []);

  const playAudio = useCallback((url) => {
    return new Promise((resolve) => {
      stopAudio();
      if (!url) return resolve();
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = resolve;
      audio.onerror = resolve;
      audio.play().catch(resolve);
    });
  }, [stopAudio]);

  function pushTurn(speaker, text, audioUrl) {
    setTranscript(prev => [...prev, { speaker, text, audioUrl }]);
  }

  // ─── Start call ─────────────────────────────────────────────────────────────
  async function startCall() {
    setError('');
    setTranscript([]);
    setLiveText('');
    setPhase(STARTING);
    setStatusLabel('Connecting…');
    try {
      const customerId = selectedCustomer?.id || null;
      const res = await simulateApi.start(selectedWf || null, customerId);
      const { callId: cid, text, audioUrl, turn: t } = res.data;
      setCallId(cid);
      setTurn(t);
      pushTurn('ai', text, audioUrl);

      if (audioUrl) {
        setPhase(AI_SPEAKING);
        setStatusLabel('மகாலக்ஷ்மி பேசுகிறார்…');
        await playAudio(audioUrl);
      }
      setPhase(USER_TURN);
      setStatusLabel('உங்கள் முறை — பேசுங்கள் அல்லது டைப் செய்யுங்கள்');
    } catch (e) {
      setError(e.response?.data?.error || e.message);
      setPhase(IDLE);
    }
  }

  // ─── Submit a text response ──────────────────────────────────────────────────
  async function submitText(text) {
    if (!text?.trim() || phase !== USER_TURN || processingRef.current) return;
    stopSpeechRecognition();
    setUserInput('');
    pushTurn('user', text.trim(), null);
    await processAiTurn(text.trim());
  }

  // ─── Process AI response after user input ───────────────────────────────────
  async function processAiTurn(userText) {
    if (processingRef.current) return;
    processingRef.current = true;
    setPhase(AI_TURN);
    setStatusLabel('KuralAI சிந்திக்கிறது…');
    setError('');
    try {
      const res = await simulateApi.turn(callId, turn, userText);
      const { text: aiText, audioUrl, turn: nextTurn, ended } = res.data;
      pushTurn('ai', aiText, audioUrl);
      setTurn(nextTurn);

      if (ended) {
        if (audioUrl) {
          setPhase(AI_SPEAKING);
          setStatusLabel('மகாலக்ஷ்மி பேசுகிறார்…');
          await playAudio(audioUrl);
        }
        setPhase(ENDED);
        setStatusLabel('');
      } else {
        if (audioUrl) {
          setPhase(AI_SPEAKING);
          setStatusLabel('மகாலக்ஷ்மி பேசுகிறார்…');
          await playAudio(audioUrl);
        }
        setPhase(USER_TURN);
        setStatusLabel('உங்கள் முறை — பேசுங்கள் அல்லது டைப் செய்யுங்கள்');
      }
    } catch (e) {
      setError(e.response?.data?.error || e.message);
      setPhase(USER_TURN);
      setStatusLabel('உங்கள் முறை — பேசுங்கள் அல்லது டைப் செய்யுங்கள்');
    } finally {
      processingRef.current = false;
    }
  }

  // ─── Web Speech API STT ──────────────────────────────────────────────────────
  function startSpeechRecognition() {
    if (!hasSpeechRecognition) {
      setTextMode(true);
      setError('Voice recognition is not supported in this browser. Please use Chrome or type your response.');
      return;
    }

    setError('');
    lastTextRef.current = '';
    setLiveText('');

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SR();
    recognition.lang = 'ta-IN';
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;
    recognitionRef.current = recognition;

    recognition.onresult = (event) => {
      let interim = '';
      let final = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) final += t;
        else interim += t;
      }
      lastTextRef.current = final || interim;
      setLiveText(lastTextRef.current);
    };

    recognition.onend = async () => {
      recognitionRef.current = null;
      setLiveText('');
      const spoken = lastTextRef.current.trim();
      lastTextRef.current = '';
      if (!spoken) {
        if (!processingRef.current) {
          setError('Nothing heard. Please try again or type your response.');
          setPhase(USER_TURN);
          setStatusLabel('உங்கள் முறை — பேசுங்கள் அல்லது டைப் செய்யுங்கள்');
        }
        return;
      }
      if (processingRef.current) return;
      pushTurn('user', spoken, null);
      await processAiTurn(spoken);
    };

    recognition.onerror = (event) => {
      recognitionRef.current = null;
      setLiveText('');
      if (event.error === 'no-speech') {
        setError('No speech detected. Please try again.');
      } else if (event.error === 'not-allowed') {
        setError('Microphone access denied. Please allow mic permission in your browser.');
      } else {
        setError(`Voice recognition error: ${event.error}. Please try again or type.`);
      }
      setPhase(USER_TURN);
      setStatusLabel('உங்கள் முறை — பேசுங்கள் அல்லது டைப் செய்யுங்கள்');
    };

    recognition.start();
    setPhase(RECORDING);
    setStatusLabel('கேட்கிறேன்… mic-ஐ tap செய்யுங்கள்');
  }

  function stopSpeechRecognition() {
    if (recognitionRef.current) recognitionRef.current.stop();
  }

  // ─── Hang up ────────────────────────────────────────────────────────────────
  async function hangUp() {
    stopAudio();
    stopSpeechRecognition();
    if (callId) simulateApi.end(callId).catch(() => {});
    pushTurn('ai', '— Call ended —', null);
    setPhase(ENDED);
    setStatusLabel('');
    setLiveText('');
  }

  function reset() {
    stopAudio();
    stopSpeechRecognition();
    processingRef.current = false;
    lastTextRef.current = '';
    setPhase(IDLE);
    setCallId(null);
    setTurn(0);
    setTranscript([]);
    setUserInput('');
    setError('');
    setStatusLabel('');
    setLiveText('');
    setTextMode(!hasSpeechRecognition);
  }

  const isActive    = phase !== IDLE && phase !== ENDED && phase !== STARTING;
  const canRecord   = phase === USER_TURN;
  const isRecording = phase === RECORDING;

  // Build dynamic info cards from selected customer
  const meta = selectedCustomer?.metadata || {};

  return (
    <div className={styles.layout}>
      <Sidebar />
      <main className={styles.main}>

        {/* Header */}
        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>Call Simulator</h1>
            <p className={styles.subtitle}>
              Customer data load பண்ணி, Tamil-ல் KuralAI-யோட பேசுங்கள்.
            </p>
          </div>
          <div className={styles.badge}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            No Exotel required
          </div>
        </div>

        {/* Phone panel */}
        <div className={styles.panel}>

          {/* Setup screen */}
          {phase === IDLE && (
            <div className={styles.setup}>
              <div className={styles.phoneIcon}>
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.64A2 2 0 012 1h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L6.09 8.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"/>
                </svg>
              </div>

              {/* Customer selector */}
              <div className={styles.customerSection}>
                <div className={styles.customerSectionTitle}>
                  Customer தேர்வு செய்யுங்கள்
                </div>

                {loadingCustomers ? (
                  <div className={styles.spinner} style={{ alignSelf: 'center' }} />
                ) : (
                  <div className={styles.customerGrid}>
                    {customers.map(c => (
                      <CustomerCard
                        key={c.id}
                        customer={c}
                        selected={selectedCustomer?.id === c.id}
                        onSelect={setSelectedCustomer}
                      />
                    ))}
                  </div>
                )}

                {/* Chit data panel for selected customer */}
                {selectedCustomer && (
                  <ChitPanel customer={selectedCustomer} />
                )}
              </div>

              {workflows.length > 0 && (
                <select className={styles.wfSelect} value={selectedWf} onChange={e => setSelectedWf(e.target.value)}>
                  <option value="">Free-form AI mode (no script)</option>
                  {workflows.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              )}

              <button className={styles.startBtn} onClick={startCall}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
                {selectedCustomer ? `${selectedCustomer.name}-க்கு Call செய்யுங்கள்` : 'Start Simulated Call'}
              </button>

              {!hasSpeechRecognition && (
                <p className={styles.setupText} style={{ color: '#F59E0B', marginTop: 4 }}>
                  Voice input requires Chrome or Edge — text mode enabled.
                </p>
              )}
            </div>
          )}

          {/* Starting */}
          {phase === STARTING && (
            <div className={styles.centreWrap}>
              <div className={styles.spinner}/>
              <p className={styles.statusText}>Connecting to {selectedCustomer?.name || 'customer'}…</p>
            </div>
          )}

          {/* Transcript (shown once call starts) */}
          {transcript.length > 0 && (
            <div className={styles.transcript}>
              <div className={styles.transcriptInner}>
                {transcript.map((t, i) => (
                  <TurnBubble key={i} speaker={t.speaker} text={t.text} audioUrl={t.audioUrl} onPlay={playAudio} />
                ))}
                {isRecording && liveText && (
                  <div className={`${styles.bubble} ${styles.userBubble} ${styles.liveText}`}>
                    <p className={styles.bubbleText}>{liveText}</p>
                  </div>
                )}
                {phase === AI_TURN && (
                  <div className={`${styles.bubble} ${styles.aiBubble} ${styles.thinking}`}>
                    <span className={styles.dot}/><span className={styles.dot}/><span className={styles.dot}/>
                  </div>
                )}
                <div ref={bottomRef}/>
              </div>
            </div>
          )}

          {/* Status bar */}
          {statusLabel && (
            <div className={styles.statusBar}>
              {phase === AI_SPEAKING && (
                <div className={styles.speakingWave}>
                  {[...Array(5)].map((_, i) => (
                    <span key={i} className={styles.speakBar} style={{ animationDelay: `${i * 0.1}s` }}/>
                  ))}
                </div>
              )}
              <span>{statusLabel}</span>
            </div>
          )}

          {/* Audio controls */}
          {isActive && (
            <div className={styles.controls}>

              {!textMode && (
                <div className={styles.micSection}>
                  {isRecording ? (
                    <button className={`${styles.micBtn} ${styles.micBtnRecording}`} onClick={stopSpeechRecognition}>
                      <WaveformBars />
                      <span className={styles.micLabel}>Tap to send</span>
                    </button>
                  ) : (
                    <button
                      className={`${styles.micBtn} ${canRecord ? styles.micBtnReady : styles.micBtnDisabled}`}
                      onClick={startSpeechRecognition}
                      disabled={!canRecord}
                    >
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/>
                        <path d="M19 10v2a7 7 0 01-14 0v-2"/>
                        <line x1="12" y1="19" x2="12" y2="23"/>
                        <line x1="8" y1="23" x2="16" y2="23"/>
                      </svg>
                      <span className={styles.micLabel}>
                        {canRecord ? 'Tap to speak' : phase === AI_SPEAKING ? 'Listening…' : 'Please wait'}
                      </span>
                    </button>
                  )}

                  {canRecord && !isRecording && (
                    <button className={styles.typeToggle} onClick={() => { stopSpeechRecognition(); setTextMode(true); }}>
                      Type instead
                    </button>
                  )}
                </div>
              )}

              {textMode && phase === USER_TURN && (
                <div className={styles.textRow}>
                  {hasSpeechRecognition && (
                    <button className={styles.micToggle} onClick={() => setTextMode(false)} title="Switch to voice">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/>
                        <path d="M19 10v2a7 7 0 01-14 0v-2"/>
                      </svg>
                    </button>
                  )}
                  <input
                    ref={textInputRef}
                    className={styles.textInput}
                    placeholder="Tamil அல்லது English-ல் type செய்யுங்கள்…"
                    value={userInput}
                    onChange={e => setUserInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitText(userInput); }}}
                  />
                  <button
                    className={styles.sendBtn}
                    onClick={() => submitText(userInput)}
                    disabled={!userInput.trim()}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                  </button>
                </div>
              )}

              {isActive && (
                <button className={styles.hangupBtn} onClick={hangUp} title="End call">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10.68 13.31a16 16 0 003.41 2.6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 17v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.42 19.42 0 013.07 9.81a19.79 19.79 0 01-3.07-8.63A2 2 0 012 1h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.18 8.91"/>
                    <line x1="1" y1="1" x2="23" y2="23"/>
                  </svg>
                </button>
              )}
            </div>
          )}

          {/* Ended bar */}
          {phase === ENDED && (
            <div className={styles.endedBar}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              Call ended
              <button className={styles.newCallBtn} onClick={reset}>New Simulation</button>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className={styles.errorBar}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              {error}
            </div>
          )}
        </div>

        {/* Dynamic info cards */}
        <div className={styles.infoGrid}>
          <div className={styles.infoCard}>
            <div className={styles.infoTitle}>
              {selectedCustomer ? `${selectedCustomer.name} — Scenario` : 'Scenario'}
            </div>
            <ul className={styles.infoList}>
              <li>Agent: மகாலக்ஷ்மி (Automystic Chit Fund)</li>
              {meta.chitValue    && <li>சீட்: ₹{meta.chitValue} — {meta.chitGroup}</li>}
              {meta.currentDue  && <li>{meta.currentDue}வது due — ₹{meta.dueAmount}</li>}
              {meta.nextDueDate && <li>குலுக்கல்: {meta.nextDueDate}</li>}
              {!selectedCustomer && <li>Customer தேர்வு செய்யவில்லை — default data</li>}
            </ul>
          </div>
          <div className={styles.infoCard}>
            <div className={styles.infoTitle}>Try these questions</div>
            <ul className={styles.infoList}>
              <li>"ஆமா சார், நான் {meta.customerName || 'பேசுறேன்'}"</li>
              <li>"இன்னொரு சீட் எத்தனாவது due?"</li>
              <li>"இப்போ எடுத்தா எவ்ளோ அமௌன்ட்?"</li>
              <li>"jamin என்ன குடுக்கணும்?"</li>
            </ul>
          </div>
          <div className={styles.infoCard}>
            <div className={styles.infoTitle}>More scenarios</div>
            <ul className={styles.infoList}>
              <li>"ஆமா கலந்துக்கிறேன்" — lottery accept</li>
              <li>"மாசம் மாசம் கேக்குறீங்க" — complaint</li>
              <li>"ஆஃபீஸ்ல இருந்து call பண்ணாதீங்க"</li>
              <li>"நன்றி சார்" — to end the call</li>
            </ul>
          </div>
        </div>
      </main>
    </div>
  );
}
