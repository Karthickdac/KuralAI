import React, { useState, useRef, useEffect, useCallback } from 'react';
import Sidebar from '../components/Sidebar';
import { simulateApi, workflowsApi } from '../api/client';
import styles from './Simulate.module.css';

const IDLE      = 'idle';
const STARTING  = 'starting';
const AI_TURN   = 'ai_turn';
const USER_TURN = 'user_turn';
const ENDED     = 'ended';

function TurnBubble({ speaker, text, audioUrl, onPlay }) {
  const isAi = speaker === 'ai';
  return (
    <div className={`${styles.bubble} ${isAi ? styles.aiBubble : styles.userBubble}`}>
      <div className={styles.bubbleHeader}>
        <span className={styles.bubbleSpeaker}>{isAi ? 'KuralAI' : 'You'}</span>
        {isAi && audioUrl && (
          <button className={styles.playBtn} onClick={() => onPlay(audioUrl)} title="Play audio">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
          </button>
        )}
      </div>
      <p className={styles.bubbleText}>{text}</p>
    </div>
  );
}

export default function Simulate() {
  const [phase, setPhase]           = useState(IDLE);
  const [callId, setCallId]         = useState(null);
  const [turn, setTurn]             = useState(0);
  const [transcript, setTranscript] = useState([]);
  const [userInput, setUserInput]   = useState('');
  const [error, setError]           = useState('');
  const [workflows, setWorkflows]   = useState([]);
  const [selectedWf, setSelectedWf] = useState('');
  const [isAutoPlaying, setIsAutoPlaying] = useState(false);
  const audioRef    = useRef(null);
  const bottomRef   = useRef(null);
  const inputRef    = useRef(null);

  useEffect(() => {
    workflowsApi.list()
      .then(r => setWorkflows(r.data || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript]);

  useEffect(() => {
    if (phase === USER_TURN) inputRef.current?.focus();
  }, [phase]);

  const playAudio = useCallback(async (url) => {
    if (!url) return;
    try {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      const audio = new Audio(url);
      audioRef.current = audio;
      await audio.play();
    } catch (e) {
      console.warn('Audio play error:', e);
    }
  }, []);

  const pushTurn = (speaker, text, audioUrl) => {
    setTranscript(prev => [...prev, { speaker, text, audioUrl }]);
  };

  async function startCall() {
    setError('');
    setTranscript([]);
    setPhase(STARTING);
    try {
      const res = await simulateApi.start(selectedWf || null);
      const { callId: cid, text, audioUrl, turn: t } = res.data;
      setCallId(cid);
      setTurn(t);
      pushTurn('ai', text, audioUrl);
      setPhase(USER_TURN);
      if (audioUrl) {
        setIsAutoPlaying(true);
        await playAudio(audioUrl);
        setIsAutoPlaying(false);
      }
    } catch (e) {
      setError(e.response?.data?.error || e.message);
      setPhase(IDLE);
    }
  }

  async function sendTurn() {
    const text = userInput.trim();
    if (!text || phase !== USER_TURN) return;
    setUserInput('');
    pushTurn('user', text, null);
    setPhase(AI_TURN);
    setError('');
    try {
      const res = await simulateApi.turn(callId, turn, text);
      const { text: aiText, audioUrl, turn: nextTurn, ended } = res.data;
      pushTurn('ai', aiText, audioUrl);
      setTurn(nextTurn);
      if (ended) {
        setPhase(ENDED);
      } else {
        setPhase(USER_TURN);
        if (audioUrl) {
          setIsAutoPlaying(true);
          await playAudio(audioUrl);
          setIsAutoPlaying(false);
        }
      }
    } catch (e) {
      setError(e.response?.data?.error || e.message);
      setPhase(USER_TURN);
    }
  }

  async function hangUp() {
    if (callId) {
      await simulateApi.end(callId).catch(() => {});
    }
    pushTurn('ai', '— Call ended —', null);
    setPhase(ENDED);
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
  }

  function reset() {
    setPhase(IDLE);
    setCallId(null);
    setTurn(0);
    setTranscript([]);
    setUserInput('');
    setError('');
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
  }

  const isActive = phase !== IDLE && phase !== ENDED;

  return (
    <div className={styles.layout}>
      <Sidebar />
      <main className={styles.main}>
        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>Call Simulator</h1>
            <p className={styles.subtitle}>
              Test the full Tamil AI conversation — audio, AI logic, and Q&amp;A scripts — without needing a real phone.
            </p>
          </div>
          <div className={styles.badge}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            No Exotel required
          </div>
        </div>

        <div className={styles.panel}>

          {/* Setup (shown when idle) */}
          {phase === IDLE && (
            <div className={styles.setup}>
              <div className={styles.phoneIcon}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.64A2 2 0 012 1h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L6.09 8.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"/>
                </svg>
              </div>
              <h2 className={styles.setupTitle}>Ready to simulate a call</h2>
              <p className={styles.setupText}>
                Optionally pick a workflow with a Q&amp;A script. Leave blank to use the free-form AI mode.
              </p>
              {workflows.length > 0 && (
                <select
                  className={styles.wfSelect}
                  value={selectedWf}
                  onChange={e => setSelectedWf(e.target.value)}
                >
                  <option value="">Free-form AI mode (no script)</option>
                  {workflows.map(w => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
              )}
              <button className={styles.startBtn} onClick={startCall}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
                Start Simulated Call
              </button>
            </div>
          )}

          {/* Starting spinner */}
          {phase === STARTING && (
            <div className={styles.spinnerWrap}>
              <div className={styles.spinner}/>
              <p className={styles.spinnerText}>Starting conversation…</p>
            </div>
          )}

          {/* Transcript */}
          {(transcript.length > 0) && (
            <div className={styles.transcript}>
              <div className={styles.transcriptInner}>
                {transcript.map((t, i) => (
                  <TurnBubble
                    key={i}
                    speaker={t.speaker}
                    text={t.text}
                    audioUrl={t.audioUrl}
                    onPlay={playAudio}
                  />
                ))}
                {phase === AI_TURN && (
                  <div className={`${styles.bubble} ${styles.aiBubble} ${styles.thinking}`}>
                    <span className={styles.dot}/><span className={styles.dot}/><span className={styles.dot}/>
                  </div>
                )}
                <div ref={bottomRef}/>
              </div>
            </div>
          )}

          {/* Input row */}
          {(phase === USER_TURN || phase === AI_TURN) && (
            <div className={styles.inputRow}>
              <input
                ref={inputRef}
                className={styles.textInput}
                placeholder="Type your response in Tamil or English…"
                value={userInput}
                disabled={phase !== USER_TURN}
                onChange={e => setUserInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendTurn(); } }}
              />
              <button
                className={styles.sendBtn}
                onClick={sendTurn}
                disabled={phase !== USER_TURN || !userInput.trim()}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
              </button>
              <button
                className={styles.hangupBtn}
                onClick={hangUp}
                title="Hang up"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.68 13.31a16 16 0 003.41 2.6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 17v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.42 19.42 0 013.07 9.81a19.79 19.79 0 01-3.07-8.63A2 2 0 012 1h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.18 8.91"/>
                  <line x1="1" y1="1" x2="23" y2="23"/>
                </svg>
              </button>
            </div>
          )}

          {/* Call ended */}
          {phase === ENDED && (
            <div className={styles.endedBar}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              Call ended
              <button className={styles.newCallBtn} onClick={reset}>New Simulation</button>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className={styles.errorBar}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              {error}
            </div>
          )}
        </div>

        {/* Info boxes */}
        <div className={styles.infoGrid}>
          <div className={styles.infoCard}>
            <div className={styles.infoTitle}>What this tests</div>
            <ul className={styles.infoList}>
              <li>Tamil TTS audio via Azure Neural Voice</li>
              <li>GPT-4o AI response generation</li>
              <li>Q&amp;A script flow logic</li>
              <li>Intent detection &amp; escalation rules</li>
              <li>Full conversation saved to database</li>
            </ul>
          </div>
          <div className={styles.infoCard}>
            <div className={styles.infoTitle}>Requirements</div>
            <ul className={styles.infoList}>
              <li>Azure Speech Key configured in Settings</li>
              <li>OpenAI API Key configured in Settings</li>
              <li>No Exotel account or phone needed</li>
              <li>Simulated calls appear in All Calls</li>
            </ul>
          </div>
          <div className={styles.infoCard}>
            <div className={styles.infoTitle}>Tips</div>
            <ul className={styles.infoList}>
              <li>Type responses in Tamil or English</li>
              <li>Say "வேண்டாம்" or "no" to trigger end-call</li>
              <li>Say "agent" or "human" to test escalation</li>
              <li>Click the play button to replay any audio</li>
            </ul>
          </div>
        </div>
      </main>
    </div>
  );
}
