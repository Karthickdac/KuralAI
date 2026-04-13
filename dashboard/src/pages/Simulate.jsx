import React, { useState, useRef, useEffect, useCallback } from 'react';
import Sidebar from '../components/Sidebar';
import { simulateApi, workflowsApi } from '../api/client';
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
        <span className={styles.bubbleSpeaker}>{isAi ? 'KuralAI' : 'You'}</span>
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

// Check Web Speech API support
const hasSpeechRecognition = !!(window.SpeechRecognition || window.webkitSpeechRecognition);

// ─── Main component ───────────────────────────────────────────────────────────
export default function Simulate() {
  const [phase, setPhase]           = useState(IDLE);
  const [callId, setCallId]         = useState(null);
  const [turn, setTurn]             = useState(0);
  const [transcript, setTranscript] = useState([]);
  const [textMode, setTextMode]     = useState(!hasSpeechRecognition);
  const [userInput, setUserInput]   = useState('');
  const [error, setError]           = useState('');
  const [workflows, setWorkflows]   = useState([]);
  const [selectedWf, setSelectedWf] = useState('');
  const [statusLabel, setStatusLabel] = useState('');
  const [liveText, setLiveText]     = useState('');

  const audioRef        = useRef(null);
  const recognitionRef  = useRef(null);
  const lastTextRef     = useRef('');
  const bottomRef       = useRef(null);
  const textInputRef    = useRef(null);

  useEffect(() => {
    workflowsApi.list().then(r => setWorkflows(r.data || [])).catch(() => {});
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
      const res = await simulateApi.start(selectedWf || null);
      const { callId: cid, text, audioUrl, turn: t } = res.data;
      setCallId(cid);
      setTurn(t);
      pushTurn('ai', text, audioUrl);

      if (audioUrl) {
        setPhase(AI_SPEAKING);
        setStatusLabel('KuralAI is speaking…');
        await playAudio(audioUrl);
      }
      setPhase(USER_TURN);
      setStatusLabel('Your turn — speak or type');
    } catch (e) {
      setError(e.response?.data?.error || e.message);
      setPhase(IDLE);
    }
  }

  // ─── Submit a text response ──────────────────────────────────────────────────
  async function submitText(text) {
    if (!text?.trim() || phase !== USER_TURN) return;
    setUserInput('');
    pushTurn('user', text.trim(), null);
    await processAiTurn(text.trim());
  }

  // ─── Process AI response after user input ───────────────────────────────────
  async function processAiTurn(userText) {
    setPhase(AI_TURN);
    setStatusLabel('KuralAI is thinking…');
    setError('');
    try {
      const res = await simulateApi.turn(callId, turn, userText);
      const { text: aiText, audioUrl, turn: nextTurn, ended } = res.data;
      pushTurn('ai', aiText, audioUrl);
      setTurn(nextTurn);

      if (ended) {
        if (audioUrl) {
          setPhase(AI_SPEAKING);
          setStatusLabel('KuralAI is speaking…');
          await playAudio(audioUrl);
        }
        setPhase(ENDED);
        setStatusLabel('');
      } else {
        if (audioUrl) {
          setPhase(AI_SPEAKING);
          setStatusLabel('KuralAI is speaking…');
          await playAudio(audioUrl);
        }
        setPhase(USER_TURN);
        setStatusLabel('Your turn — speak or type');
      }
    } catch (e) {
      setError(e.response?.data?.error || e.message);
      setPhase(USER_TURN);
      setStatusLabel('Your turn — speak or type');
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
      if (!spoken) {
        setError('Nothing heard. Please try again or type your response.');
        setPhase(USER_TURN);
        setStatusLabel('Your turn — speak or type');
        return;
      }
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
      setStatusLabel('Your turn — speak or type');
    };

    recognition.start();
    setPhase(RECORDING);
    setStatusLabel('Listening… tap mic to send');
  }

  function stopSpeechRecognition() {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
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

  return (
    <div className={styles.layout}>
      <Sidebar />
      <main className={styles.main}>

        {/* Header */}
        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>Call Simulator</h1>
            <p className={styles.subtitle}>
              Full audio test — speak Tamil into your mic, hear KuralAI respond in Tamil.
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
              <h2 className={styles.setupTitle}>Ready to simulate a call</h2>
              <p className={styles.setupText}>
                Speak Tamil into your microphone and hear KuralAI respond.
                {!hasSpeechRecognition && ' Voice input requires Chrome or Edge — text mode enabled.'}
                {hasSpeechRecognition && ' Uses your browser\'s built-in voice recognition — no API key needed.'}
              </p>
              {workflows.length > 0 && (
                <select className={styles.wfSelect} value={selectedWf} onChange={e => setSelectedWf(e.target.value)}>
                  <option value="">Free-form AI mode (no script)</option>
                  {workflows.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              )}
              <button className={styles.startBtn} onClick={startCall}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
                Start Simulated Call
              </button>
            </div>
          )}

          {/* Starting */}
          {phase === STARTING && (
            <div className={styles.centreWrap}>
              <div className={styles.spinner}/>
              <p className={styles.statusText}>Connecting…</p>
            </div>
          )}

          {/* Transcript (shown once call starts) */}
          {transcript.length > 0 && (
            <div className={styles.transcript}>
              <div className={styles.transcriptInner}>
                {transcript.map((t, i) => (
                  <TurnBubble key={i} speaker={t.speaker} text={t.text} audioUrl={t.audioUrl} onPlay={playAudio} />
                ))}
                {/* Live interim text while recording */}
                {isRecording && liveText && (
                  <div className={`${styles.bubble} ${styles.userBubble} ${styles.liveText}`}>
                    <p className={styles.bubbleText}>{liveText}</p>
                  </div>
                )}
                {/* AI thinking indicator */}
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

          {/* Audio controls (shown when call is active) */}
          {isActive && (
            <div className={styles.controls}>

              {/* Primary: mic button */}
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
                    <button className={styles.typeToggle} onClick={() => setTextMode(true)}>
                      Type instead
                    </button>
                  )}
                </div>
              )}

              {/* Fallback: text input */}
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
                    placeholder="Type in Tamil or English…"
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

              {/* Hang up */}
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

        {/* Info cards */}
        <div className={styles.infoGrid}>
          <div className={styles.infoCard}>
            <div className={styles.infoTitle}>How it works</div>
            <ul className={styles.infoList}>
              <li>Tap mic → speak Tamil → tap again to send</li>
              <li>Browser voice recognition transcribes (free, no quota)</li>
              <li>GPT-4o generates a Tamil response</li>
              <li>Azure TTS speaks it back to you</li>
            </ul>
          </div>
          <div className={styles.infoCard}>
            <div className={styles.infoTitle}>Requirements</div>
            <ul className={styles.infoList}>
              <li>Chrome or Edge browser (for voice input)</li>
              <li>Azure Speech key (Settings → AI &amp; Voice)</li>
              <li>OpenAI key for AI responses (Settings → AI &amp; Voice)</li>
              <li>Microphone permission in browser</li>
            </ul>
          </div>
          <div className={styles.infoCard}>
            <div className={styles.infoTitle}>Try saying (in Tamil)</div>
            <ul className={styles.infoList}>
              <li>"வணக்கம்" — Hello (greeting)</li>
              <li>"agent வேணும்" — to test escalation</li>
              <li>"வேண்டாம் நன்றி" — to end the call</li>
              <li>Any question your callers might ask</li>
            </ul>
          </div>
        </div>
      </main>
    </div>
  );
}
