import React, { useState, useEffect, useRef, useCallback } from 'react';
import { workflowsApi, ttsApi, templatesApi } from '../api/client';
import Sidebar from '../components/Sidebar';
import styles from './Workflows.module.css';

const SCHEDULE_LABELS = {
  manual: 'Manual', daily: 'Daily', weekly: 'Weekly', 'one-time': 'One-time',
};

const STATUS_CONFIG = {
  draft:    { label: 'Draft',    bg: '#F1F5F9',              color: '#64748B' },
  active:   { label: 'Active',   bg: 'var(--success-bg)',    color: 'var(--success-text)' },
  paused:   { label: 'Paused',   bg: 'var(--warning-bg)',    color: 'var(--warning-text)' },
  completed:{ label: 'Done',     bg: 'var(--primary-light)', color: 'var(--primary-text)' },
};

const TEMPLATE_VARS = [
  { key: '{{customerName}}',     desc: 'Customer name' },
  { key: '{{chitValue}}',        desc: 'Chit value' },
  { key: '{{dueAmount}}',        desc: 'Due amount' },
  { key: '{{nextDueDate}}',      desc: 'Next due date' },
  { key: '{{currentDue}}',       desc: 'Current due number' },
  { key: '{{withdrawalAmount}}', desc: 'Withdrawal amount' },
  { key: '{{otherChitDues}}',    desc: 'Other chit dues' },
  { key: '{{totalDues}}',        desc: 'Total dues' },
];

const ACTION_CONFIG = {
  continue: { label: 'Go to next step', color: 'var(--success-text)', bg: 'var(--success-bg)', icon: '→' },
  end_call: { label: 'End the call',    color: 'var(--danger-text)',  bg: 'var(--danger-bg)',  icon: '×' },
  escalate: { label: 'Transfer to human', color: 'var(--warning-text)', bg: 'var(--warning-bg)', icon: '↗' },
};

function useScriptPreview() {
  const [playing, setPlaying]   = useState(false);
  const [loading, setLoading]   = useState(false);
  const [progress, setProgress] = useState(0);
  const [ttsError, setTtsError] = useState('');
  const audioRef   = useRef(null);
  const blobUrlRef = useRef(null);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current = null;
    }
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
    setPlaying(false);
    setProgress(0);
  }, []);

  const play = useCallback(async (text, voice) => {
    if (!text?.trim()) return;
    if (playing) { stop(); return; }

    setLoading(true);
    setTtsError('');

    try {
      const response = await ttsApi.preview(text, voice);
      const blob = new Blob([response.data], { type: 'audio/mpeg' });
      const url = URL.createObjectURL(blob);
      blobUrlRef.current = url;

      const audio = new Audio(url);
      audioRef.current = audio;

      audio.ontimeupdate = () => {
        if (audio.duration) setProgress(audio.currentTime / audio.duration);
      };
      audio.onended = () => { setPlaying(false); setProgress(0); };
      audio.onerror = () => { setPlaying(false); setProgress(0); };

      await audio.play();
      setPlaying(true);
    } catch (err) {
      const msg = err.response?.data
        ? (() => { try { return JSON.parse(new TextDecoder().decode(err.response.data)).error; } catch { return ''; } })()
        : '';
      setTtsError(msg || 'Could not generate audio. Check your Azure Speech credentials in Settings.');
    } finally {
      setLoading(false);
    }
  }, [playing, stop]);

  useEffect(() => () => stop(), [stop]);

  return { playing, loading, progress, ttsError, play, stop };
}

function Waveform({ playing }) {
  const bars = [3, 5, 8, 12, 9, 6, 10, 7, 4, 11, 8, 5, 9, 6, 4];
  return (
    <div className={styles.waveform} aria-hidden="true">
      {bars.map((h, i) => (
        <span
          key={i}
          className={styles.waveBar}
          style={{
            height: playing ? `${h + Math.random() * 4}px` : '3px',
            animationDelay: `${i * 0.06}s`,
            animationPlayState: playing ? 'running' : 'paused',
          }}
        />
      ))}
    </div>
  );
}

function ScriptPreview({ script }) {
  const { playing, loading, progress, ttsError, play, stop } = useScriptPreview();
  const isEmpty = !script?.trim();
  const busy = loading || playing;

  return (
    <div className={styles.previewPanel}>
      <div className={styles.previewHeader}>
        <div className={styles.previewTitle}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
            <path d="M19.07 4.93a10 10 0 010 14.14"/><path d="M15.54 8.46a5 5 0 010 7.07"/>
          </svg>
          Script Preview
        </div>
        <span className={styles.previewBadge}>Azure Neural TTS · ta-IN</span>
      </div>

      <div className={styles.previewBody}>
        <div className={`${styles.scriptPreviewText} ${isEmpty ? styles.scriptEmpty : ''}`}>
          {isEmpty ? 'Type your AI script above to preview it…' : script}
        </div>

        {ttsError && (
          <div className={styles.ttsError}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            {ttsError}
          </div>
        )}

        {(playing || loading) && (
          <div className={styles.progressBar}>
            <div
              className={styles.progressFill}
              style={{
                width: loading ? '100%' : `${progress * 100}%`,
                transition: loading ? 'none' : 'width 0.1s linear',
                opacity: loading ? 0.4 : 1,
                animation: loading ? 'pulse 1.2s ease-in-out infinite' : 'none',
              }}
            />
          </div>
        )}

        <div className={styles.previewControls}>
          <Waveform playing={playing} />
          <div className={styles.previewBtns}>
            <button
              type="button"
              className={`${styles.playBtn} ${playing ? styles.stopBtn : ''}`}
              disabled={isEmpty || loading}
              onClick={() => playing ? stop() : play(script)}
            >
              {loading ? (
                <>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation:'spin 0.8s linear infinite' }}><path d="M21 12a9 9 0 11-6.22-8.56"/></svg>
                  Generating…
                </>
              ) : playing ? (
                <>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                  Stop
                </>
              ) : (
                <>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                  Play Script
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const INTENT_LABELS = {
  identity_confirm:     { label: 'அடையாளம் உறுதி', desc: 'Customer confirms identity' },
  seat_due_status:      { label: 'Due Status', desc: 'Customer asks about due amount / installment' },
  premature_withdrawal: { label: 'சீட் முன்கூட்டியே எடுக்கல்', desc: 'Premature withdrawal inquiry' },
  jamin_documents:      { label: 'Jamin ஆவணங்கள்', desc: 'Documents needed for withdrawal' },
  payment_complaint:    { label: 'Payment Complaint', desc: 'Customer says they cannot pay' },
  reduce_calls:         { label: 'Calls குறைக்கவும்', desc: 'Customer wants fewer callers' },
  no_office_calls:      { label: 'Office-க்கு Call வேண்டாம்', desc: 'Do not call at workplace' },
  lottery_participation:{ label: 'Lottery பங்கேற்பு', desc: 'Customer confirms lottery participation' },
  end_call:             { label: 'Call முடிக்க', desc: 'Customer wants to end the call' },
};

const INTENT_DEFAULT_QUESTION = {
  identity_confirm:      '{{customerName}} சார் பேசுறீங்களா?',
  seat_due_status:       '{{currentDue}}வது due ₹{{dueAmount}} பத்தி பேசலாமா சார்?',
  premature_withdrawal:  'இப்போ சீட் close பண்ணி ₹{{withdrawalAmount}} எடுக்கணும்னா ஆசை இருக்கா சார்?',
  jamin_documents:       'Jamin documents ready-ஆ இருக்கா சார்?',
  payment_complaint:     'Due amount இந்த மாசம் கட்ட முடியுமா சார்?',
  reduce_calls:          'Call-ல சிக்கல் இருக்கா சார்?',
  no_office_calls:       'Personal number-ல call பண்ணலாமா சார்?',
  lottery_participation: 'குலுக்கல்ல கலந்துகிறீங்களா சார்?',
  end_call:              'நன்றி சார்! வேற ஏதாவது கேள்வி இருக்கா?',
};

function QaPickerModal({ onClose, onPick }) {
  const [qaList, setQaList] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    templatesApi.listQa()
      .then(r => setQaList(r.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className={styles.qaPickerOverlay} onClick={onClose}>
      <div className={styles.qaPickerModal} onClick={e => e.stopPropagation()}>
        <div className={styles.qaPickerHead}>
          <span className={styles.qaPickerTitle}>Q&amp;A இருந்து Step சேர்க்கவும்</span>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>
        <p className={styles.qaPickerSub}>
          Select an intent — the agent question and branch phrases will be pre-filled from the Q&amp;A template.
        </p>
        {loading ? (
          <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)' }}>Loading…</div>
        ) : (
          <div className={styles.qaPickerGrid}>
            {qaList.map(qa => {
              const info = INTENT_LABELS[qa.intent] || { label: qa.intent, desc: '' };
              return (
                <button
                  key={qa.id}
                  className={styles.qaPickerCard}
                  onClick={() => onPick(qa)}
                >
                  <div className={styles.qaPickerCardLabel}>{info.label}</div>
                  <div className={styles.qaPickerCardDesc}>{info.desc}</div>
                  <div className={styles.qaPickerCardPhraseCount}>
                    {qa.phraseKeywords?.length || 0} phrases · {qa.responses?.length || 0} responses
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

const uid = () => `id_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

const emptyBranch = () => ({
  id: uid(),
  label: '',
  expectedPhrases: '',
  agentResponse: '',
  nextStep: '',
  action: 'continue',
});

const emptyStep = () => ({
  id: uid(),
  agentMessage: '',
  branches: [emptyBranch()],
  fallbackMessage: 'மறுபடியும் சொல்லுங்களா மாப்ளா?',
  maxRetries: 2,
});

const defaultScriptFlow = () => ({
  enabled: false,
  startStep: '',
  steps: [],
});

function normalizeScriptFlow(sf) {
  if (!sf) return defaultScriptFlow();
  return {
    enabled: !!sf.enabled,
    startStep: sf.startStep || '',
    steps: (sf.steps || []).map(s => ({
      ...s,
      branches: (s.branches || []).map(b => ({
        ...b,
        expectedPhrases: Array.isArray(b.expectedPhrases)
          ? b.expectedPhrases.join(', ')
          : (b.expectedPhrases || ''),
      })),
    })),
  };
}

function serializeScriptFlow(sf) {
  return {
    enabled: sf.enabled,
    startStep: sf.startStep || sf.steps[0]?.id || '',
    steps: sf.steps.map(s => ({
      ...s,
      branches: s.branches.map(b => ({
        ...b,
        expectedPhrases: b.expectedPhrases
          ? b.expectedPhrases.split(',').map(p => p.trim()).filter(Boolean)
          : [],
      })),
    })),
  };
}

function TemplateVarChips() {
  const [copied, setCopied] = useState('');
  function handleCopy(key) {
    navigator.clipboard.writeText(key).catch(() => {});
    setCopied(key);
    setTimeout(() => setCopied(''), 1200);
  }
  return (
    <div className={styles.templateVarSection}>
      <div className={styles.templateVarHead}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"/></svg>
        <span>Available Variables</span>
        <span className={styles.templateVarHint}>Click to copy, then paste into any message field</span>
      </div>
      <div className={styles.templateVarList}>
        {TEMPLATE_VARS.map(v => (
          <button
            key={v.key}
            type="button"
            className={`${styles.templateVarChip} ${copied === v.key ? styles.templateVarCopied : ''}`}
            onClick={() => handleCopy(v.key)}
            title={v.desc}
          >
            <code>{v.key}</code>
            <span className={styles.templateVarDesc}>{v.desc}</span>
            {copied === v.key && <span className={styles.copiedLabel}>Copied!</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

function FlowMiniMap({ steps, startStep }) {
  if (!steps.length) return null;

  const startIdx = steps.findIndex(s => s.id === startStep);
  const orderedSteps = startIdx > 0
    ? [steps[startIdx], ...steps.filter((_, i) => i !== startIdx)]
    : steps;

  return (
    <div className={styles.flowMap}>
      <div className={styles.flowMapLabel}>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        Conversation Flow
      </div>
      <div className={styles.flowMapPath}>
        {orderedSteps.map((step, i) => {
          const branchSummary = step.branches?.map(b => {
            const ac = ACTION_CONFIG[b.action] || ACTION_CONFIG.continue;
            const target = b.nextStep ? steps.find(s => s.id === b.nextStep) : null;
            const targetLabel = target ? `Step ${steps.indexOf(target) + 1}` : '';
            return { label: b.label || `Response ${step.branches.indexOf(b) + 1}`, action: b.action, targetLabel, ac };
          }) || [];

          return (
            <React.Fragment key={step.id}>
              <div className={`${styles.flowMapNode} ${i === 0 ? styles.flowMapNodeStart : ''}`}>
                <div className={styles.flowMapNodeNum}>{i + 1}</div>
                <div className={styles.flowMapNodeBody}>
                  <div className={styles.flowMapNodeText}>
                    {step.agentMessage?.slice(0, 45) || 'Empty step'}
                    {step.agentMessage?.length > 45 ? '…' : ''}
                  </div>
                  {branchSummary.length > 0 && (
                    <div className={styles.flowMapBranches}>
                      {branchSummary.map((br, bi) => (
                        <span key={bi} className={styles.flowMapBranchTag} style={{ background: br.ac.bg, color: br.ac.color }}>
                          {br.ac.icon} {br.label?.slice(0, 20)}{br.label?.length > 20 ? '…' : ''}
                          {br.targetLabel && ` → ${br.targetLabel}`}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              {i < orderedSteps.length - 1 && (
                <div className={styles.flowMapArrow}>
                  <svg width="10" height="16" viewBox="0 0 10 16"><path d="M5 0 L5 12 M2 9 L5 13 L8 9" stroke="var(--primary)" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

function HowItWorksGuide() {
  const [open, setOpen] = useState(false);

  return (
    <div className={styles.guideSection}>
      <button type="button" className={styles.guideToggle} onClick={() => setOpen(!open)}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        <span>How does the Call Flow work?</span>
        <svg
          width="12" height="12" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          className={`${styles.guideChevron} ${open ? styles.guideChevronOpen : ''}`}
        >
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {open && (
        <div className={styles.guideContent}>
          <div className={styles.guideGrid}>
            <div className={styles.guideCard}>
              <div className={styles.guideCardIcon} style={{ background: 'var(--primary-light)', color: 'var(--primary)' }}>1</div>
              <div>
                <div className={styles.guideCardTitle}>Agent speaks first</div>
                <div className={styles.guideCardDesc}>Each step starts with the AI agent (மகாலக்ஷ்மி) saying something to the customer — like asking their name or informing about a due.</div>
              </div>
            </div>
            <div className={styles.guideCard}>
              <div className={styles.guideCardIcon} style={{ background: 'var(--success-bg)', color: 'var(--success-text)' }}>2</div>
              <div>
                <div className={styles.guideCardTitle}>Customer responds</div>
                <div className={styles.guideCardDesc}>Each "branch" represents a possible customer response. The system matches what they say using hint keywords (like "ஆமா", "ok", "busy").</div>
              </div>
            </div>
            <div className={styles.guideCard}>
              <div className={styles.guideCardIcon} style={{ background: 'var(--warning-bg)', color: 'var(--warning-text)' }}>3</div>
              <div>
                <div className={styles.guideCardTitle}>Agent reacts</div>
                <div className={styles.guideCardDesc}>Each branch has an agent response and a next action — continue to the next step, end the call politely, or transfer to a human agent.</div>
              </div>
            </div>
            <div className={styles.guideCard}>
              <div className={styles.guideCardIcon} style={{ background: 'var(--danger-bg)', color: 'var(--danger-text)' }}>4</div>
              <div>
                <div className={styles.guideCardTitle}>Fallback for confusion</div>
                <div className={styles.guideCardDesc}>If no branch matches what the customer said, the agent repeats the question using the fallback message. After max retries, it escalates.</div>
              </div>
            </div>
          </div>

          <div className={styles.guideExample}>
            <div className={styles.guideExampleTitle}>Example conversation flow:</div>
            <div className={styles.guideTimeline}>
              <div className={styles.guideTimelineItem}>
                <span className={styles.guideTimelineDot} style={{ background: 'var(--primary)' }} />
                <span className={styles.guideTimelineLabel}>Agent:</span>
                <span>"வணக்கம் சார்! {{customerName}} சார்ங்களா?"</span>
              </div>
              <div className={styles.guideTimelineItem}>
                <span className={styles.guideTimelineDot} style={{ background: 'var(--success)' }} />
                <span className={styles.guideTimelineLabel}>Customer:</span>
                <span>"ஆமா, நான் தான்"</span>
              </div>
              <div className={styles.guideTimelineItem}>
                <span className={styles.guideTimelineDot} style={{ background: 'var(--primary)' }} />
                <span className={styles.guideTimelineLabel}>Agent:</span>
                <span>"நன்றி! உங்க due ₹{{dueAmount}} பற்றி..."</span>
                <span className={styles.guideTimelineAction}>→ Goes to Step 2</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ScriptFlowBuilder({ value, onChange }) {
  const [expandedSteps, setExpandedSteps] = useState({});
  const [showQaPicker, setShowQaPicker] = useState(false);

  function toggleStep(stepId) {
    setExpandedSteps(prev => ({ ...prev, [stepId]: !prev[stepId] }));
  }

  function updateFlow(patch) {
    onChange({ ...value, ...patch });
  }

  function addStep() {
    const step = emptyStep();
    const steps = [...value.steps, step];
    setExpandedSteps(prev => ({ ...prev, [step.id]: true }));
    updateFlow({
      steps,
      startStep: value.startStep || steps[0].id,
    });
  }

  function addStepFromQa(qa) {
    setShowQaPicker(false);
    const info  = INTENT_LABELS[qa.intent] || { label: qa.intent };
    const top5  = (qa.phraseKeywords || []).slice(0, 5).join(', ');
    const firstResponse = (qa.responses || [])[0] || '';
    const branch = {
      ...emptyBranch(),
      label:           info.label,
      expectedPhrases: top5,
      agentResponse:   firstResponse,
      action:          qa.action || 'continue',
    };
    const step = {
      ...emptyStep(),
      agentMessage: INTENT_DEFAULT_QUESTION[qa.intent] || '',
      branches:     [branch],
    };
    const steps = [...value.steps, step];
    setExpandedSteps(prev => ({ ...prev, [step.id]: true }));
    updateFlow({ steps, startStep: value.startStep || steps[0].id });
  }

  function removeStep(stepId) {
    const steps = value.steps.filter(s => s.id !== stepId);
    updateFlow({
      steps,
      startStep: value.startStep === stepId ? (steps[0]?.id || '') : value.startStep,
    });
  }

  function updateStep(stepId, patch) {
    updateFlow({
      steps: value.steps.map(s => s.id === stepId ? { ...s, ...patch } : s),
    });
  }

  function addBranch(stepId) {
    const step = value.steps.find(s => s.id === stepId);
    updateStep(stepId, { branches: [...step.branches, emptyBranch()] });
  }

  function removeBranch(stepId, branchId) {
    const step = value.steps.find(s => s.id === stepId);
    updateStep(stepId, { branches: step.branches.filter(b => b.id !== branchId) });
  }

  function updateBranch(stepId, branchId, patch) {
    const step = value.steps.find(s => s.id === stepId);
    updateStep(stepId, {
      branches: step.branches.map(b => b.id === branchId ? { ...b, ...patch } : b),
    });
  }

  function moveStep(idx, dir) {
    const steps = [...value.steps];
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= steps.length) return;
    [steps[idx], steps[newIdx]] = [steps[newIdx], steps[idx]];
    updateFlow({ steps });
  }

  const stepIds = value.steps.map(s => s.id);

  return (
    <div className={styles.scriptFlowSection}>
      <div className={styles.sfToggleRow}>
        <div>
          <div className={styles.sfToggleLabel}>Enable Structured Call Flow</div>
          <div className={styles.sfToggleSub}>
            Instead of free-form AI conversation, the agent follows a step-by-step script you define below
          </div>
        </div>
        <label className={styles.toggle}>
          <input
            type="checkbox"
            checked={value.enabled}
            onChange={e => updateFlow({ enabled: e.target.checked })}
          />
          <span className={styles.toggleSlider} />
        </label>
      </div>

      {value.enabled && (
        <>
          <HowItWorksGuide />

          <TemplateVarChips />

          <FlowMiniMap steps={value.steps} startStep={value.startStep} />

          {value.steps.length > 0 && (
            <div className={styles.sfStartRow}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              <span>Call starts at: <strong>{value.steps.find(s => s.id === value.startStep)?.agentMessage?.slice(0, 40) || 'Step 1'}{(value.steps.find(s => s.id === value.startStep)?.agentMessage?.length || 0) > 40 ? '…' : ''}</strong></span>
              {value.steps.length > 1 && (
                <select
                  className={styles.sfSelect}
                  value={value.startStep}
                  onChange={e => updateFlow({ startStep: e.target.value })}
                  style={{ marginLeft: 'auto', fontSize: 11 }}
                >
                  {value.steps.map(s => (
                    <option key={s.id} value={s.id}>
                      Step {stepIds.indexOf(s.id) + 1}: {s.agentMessage?.slice(0, 30) || s.id}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {value.steps.length === 0 ? (
            <div className={styles.sfEmptyHint}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 8 }}>
                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
              </svg>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>No conversation steps yet</div>
              <div>Start by adding your first step — define what the agent says when the call connects, and what to do based on the customer's response.</div>
            </div>
          ) : (
            <div className={styles.sfStepList}>
              {value.steps.map((step, stepIdx) => {
                const isOpen = expandedSteps[step.id] !== false;
                const isStart = step.id === value.startStep || (!value.startStep && stepIdx === 0);
                return (
                  <div key={step.id} className={`${styles.sfStep} ${isStart ? styles.sfStepStart : ''}`}>
                    <div className={styles.sfStepHead} onClick={() => toggleStep(step.id)}>
                      <div className={`${styles.sfStepNum} ${isStart ? styles.sfStepNumStart : ''}`}>{stepIdx + 1}</div>
                      <div className={styles.sfStepTitle} style={{ flex: 1 }}>
                        <div className={styles.sfStepTitleRow}>
                          {isStart && <span className={styles.sfStartTag}>START</span>}
                          {step.agentMessage?.slice(0, 55) || `Step ${stepIdx + 1} — (no message yet)`}
                          {step.agentMessage?.length > 55 && '…'}
                        </div>
                        <div className={styles.sfStepSub}>
                          {step.branches.length} {step.branches.length === 1 ? 'possible response' : 'possible responses'}
                          {step.branches.some(b => b.action === 'end_call') && ' · ends call'}
                          {step.branches.some(b => b.action === 'escalate') && ' · can escalate'}
                        </div>
                      </div>
                      <div className={styles.sfStepActions}>
                        {stepIdx > 0 && (
                          <button type="button" className={styles.sfMoveBtn} onClick={e => { e.stopPropagation(); moveStep(stepIdx, -1); }} title="Move up">↑</button>
                        )}
                        {stepIdx < value.steps.length - 1 && (
                          <button type="button" className={styles.sfMoveBtn} onClick={e => { e.stopPropagation(); moveStep(stepIdx, 1); }} title="Move down">↓</button>
                        )}
                      </div>
                      <svg
                        width="14" height="14" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                        className={`${styles.sfStepChevron} ${isOpen ? styles.sfStepChevronOpen : ''}`}
                      >
                        <polyline points="6 9 12 15 18 9"/>
                      </svg>
                      <button
                        type="button"
                        className={styles.sfStepDelBtn}
                        onClick={e => { e.stopPropagation(); removeStep(step.id); }}
                        title="Remove step"
                      >×</button>
                    </div>

                    {isOpen && (
                      <div className={styles.sfStepBody}>
                        <div className={styles.sfField}>
                          <label className={styles.sfLabel}>
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
                            What does the agent say?
                          </label>
                          <div className={styles.sfFieldHint}>This is the Tamil message மகாலக்ஷ்மி speaks to the customer at this step. You can use template variables like {'{{customerName}}'}.</div>
                          <textarea
                            className={`${styles.sfInput} ${styles.sfTextarea}`}
                            value={step.agentMessage}
                            onChange={e => updateStep(step.id, { agentMessage: e.target.value })}
                            placeholder="e.g. வணக்கம் சார்! நான் மகாலக்ஷ்மி பேசுறேன், Automystic Company-யிட இருந்து."
                            rows={3}
                          />
                        </div>

                        <div className={styles.sfBranchSection}>
                          <div className={styles.sfBranchHeader}>
                            <span className={styles.sfSectionLabel}>
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v-2"/><polyline points="3 7 8 12 3 17"/></svg>
                              How might the customer respond?
                            </span>
                            <span className={styles.sfBranchCount}>{step.branches.length} {step.branches.length === 1 ? 'branch' : 'branches'}</span>
                          </div>
                          <div className={styles.sfBranchHelpText}>
                            Each branch below handles a different type of customer response. Add hint keywords so the system knows which branch to take.
                          </div>
                          <div className={styles.sfBranchList}>
                            {step.branches.map((branch, bIdx) => {
                              const ac = ACTION_CONFIG[branch.action] || ACTION_CONFIG.continue;
                              return (
                                <div key={branch.id} className={styles.sfBranch} style={{ borderLeftColor: ac.color }}>
                                  <div className={styles.sfBranchTopRow}>
                                    <div className={styles.sfBranchNum} style={{ background: ac.bg, color: ac.color }}>{bIdx + 1}</div>
                                    <span className={styles.sfBranchTitle}>
                                      {branch.label || `Response option ${bIdx + 1}`}
                                    </span>
                                    <span className={styles.sfBranchActionTag} style={{ background: ac.bg, color: ac.color }}>
                                      {ac.icon} {ac.label}
                                    </span>
                                    <button
                                      type="button"
                                      className={styles.sfBranchDelBtn}
                                      onClick={() => removeBranch(step.id, branch.id)}
                                      title="Remove branch"
                                    >×</button>
                                  </div>

                                  <div className={styles.sfBranchGrid}>
                                    <div className={`${styles.sfField} ${styles.sfBranchFull}`}>
                                      <label className={styles.sfLabel}>Describe this response</label>
                                      <div className={styles.sfFieldHint}>A short label for this response type (e.g. "Customer says yes", "Customer is busy")</div>
                                      <input
                                        className={styles.sfInput}
                                        value={branch.label}
                                        onChange={e => updateBranch(step.id, branch.id, { label: e.target.value })}
                                        placeholder="e.g. Customer confirms identity"
                                      />
                                    </div>

                                    <div className={`${styles.sfField} ${styles.sfBranchFull}`}>
                                      <label className={styles.sfLabel}>
                                        Matching keywords
                                        <span className={styles.sfLabelHint}>(comma-separated)</span>
                                      </label>
                                      <div className={styles.sfFieldHint}>Words/phrases the customer might say. If any of these appear in their speech, this branch activates.</div>
                                      <input
                                        className={styles.sfInput}
                                        value={branch.expectedPhrases}
                                        onChange={e => updateBranch(step.id, branch.id, { expectedPhrases: e.target.value })}
                                        placeholder="e.g. ஆமா, yes, correct, நான் தான், சொல்லுங்க"
                                      />
                                      {branch.expectedPhrases && (
                                        <div className={styles.sfKeywordPreview}>
                                          {branch.expectedPhrases.split(',').filter(p => p.trim()).map((p, i) => (
                                            <span key={i} className={styles.sfKeywordTag}>{p.trim()}</span>
                                          ))}
                                        </div>
                                      )}
                                    </div>

                                    <div className={`${styles.sfField} ${styles.sfBranchFull}`}>
                                      <label className={styles.sfLabel}>Agent's reply for this response</label>
                                      <div className={styles.sfFieldHint}>What does the agent say after the customer gives this response?</div>
                                      <textarea
                                        className={`${styles.sfInput} ${styles.sfTextarea}`}
                                        style={{ minHeight: 56 }}
                                        value={branch.agentResponse}
                                        onChange={e => updateBranch(step.id, branch.id, { agentResponse: e.target.value })}
                                        placeholder="e.g. நன்றி சார்! உங்க details check பண்றேன்..."
                                        rows={2}
                                      />
                                    </div>

                                    <div className={styles.sfField}>
                                      <label className={styles.sfLabel}>Then what happens?</label>
                                      <select
                                        className={styles.sfSelect}
                                        value={branch.action}
                                        onChange={e => updateBranch(step.id, branch.id, { action: e.target.value })}
                                      >
                                        <option value="continue">→ Continue to another step</option>
                                        <option value="end_call">× End the call</option>
                                        <option value="escalate">↗ Transfer to human agent</option>
                                      </select>
                                    </div>

                                    {branch.action === 'continue' && (
                                      <div className={styles.sfField}>
                                        <label className={styles.sfLabel}>Go to which step?</label>
                                        <select
                                          className={styles.sfSelect}
                                          value={branch.nextStep}
                                          onChange={e => updateBranch(step.id, branch.id, { nextStep: e.target.value })}
                                        >
                                          <option value="">— Select a step —</option>
                                          {value.steps
                                            .filter(s => s.id !== step.id)
                                            .map(s => (
                                              <option key={s.id} value={s.id}>
                                                Step {stepIds.indexOf(s.id) + 1}: {s.agentMessage?.slice(0, 25) || s.id}
                                              </option>
                                            ))
                                          }
                                        </select>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })}

                            <button
                              type="button"
                              className={styles.sfAddBranchBtn}
                              onClick={() => addBranch(step.id)}
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                              Add another response option
                            </button>
                          </div>
                        </div>

                        <div className={styles.sfFallbackSection}>
                          <div className={styles.sfSectionLabel}>
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M16 16s-1.5-2-4-2-4 2-4 2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
                            If nothing matches (fallback)
                          </div>
                          <div className={styles.sfFieldHint} style={{ marginBottom: 6 }}>
                            When the customer says something unexpected, the agent says this message to try again.
                          </div>
                          <div className={styles.sfBranchGrid}>
                            <div className={styles.sfField}>
                              <label className={styles.sfLabel}>Retry message</label>
                              <input
                                className={styles.sfInput}
                                value={step.fallbackMessage}
                                onChange={e => updateStep(step.id, { fallbackMessage: e.target.value })}
                                placeholder="மறுபடியும் சொல்லுங்களா மாப்ளா?"
                              />
                            </div>
                            <div className={styles.sfField}>
                              <label className={styles.sfLabel}>How many retries?</label>
                              <div className={styles.sfFieldHint}>After this many failed attempts, the call escalates to a human</div>
                              <input
                                type="number"
                                min={1}
                                max={5}
                                className={styles.sfInput}
                                value={step.maxRetries}
                                onChange={e => updateStep(step.id, { maxRetries: Number(e.target.value) })}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {stepIdx < value.steps.length - 1 && (
                      <div className={styles.sfStepConnector}>
                        <svg width="10" height="20" viewBox="0 0 10 20"><path d="M5 0 L5 16 M2 13 L5 17 L8 13" stroke="var(--border)" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div className={styles.sfAddRow}>
            <button type="button" className={styles.sfAddStepBtn} onClick={addStep}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Add a new step
            </button>
            <button type="button" className={styles.sfAddFromQaBtn} onClick={() => setShowQaPicker(true)}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 12h6M9 16h6M17 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2z"/><polyline points="13 2 13 8 17 8"/></svg>
              Auto-fill from Q&amp;A template
            </button>
          </div>
          {showQaPicker && (
            <QaPickerModal
              onClose={() => setShowQaPicker(false)}
              onPick={addStepFromQa}
            />
          )}
        </>
      )}
    </div>
  );
}

function WorkflowModal({ onClose, onSaved, editWf }) {
  const [activeTab, setActiveTab] = useState('settings');
  const [form, setForm] = useState(editWf ? { ...editWf } : {
    name: '', description: '', script: '', schedule: 'manual', scheduleTime: '', targetCount: '',
  });
  const [scriptFlow, setScriptFlow] = useState(
    normalizeScriptFlow(editWf?.scriptFlow)
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const stepCount = scriptFlow.steps.length;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim()) { setError('Name is required'); return; }
    setSaving(true); setError('');
    try {
      const payload = { ...form, scriptFlow: serializeScriptFlow(scriptFlow) };
      if (editWf) {
        await workflowsApi.update(editWf.id, payload);
      } else {
        await workflowsApi.create(payload);
      }
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save workflow');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.modalHead}>
          <div>
            <h2 className={styles.modalTitle}>{editWf ? 'Edit Workflow' : 'New Workflow'}</h2>
            <p className={styles.modalSub}>Configure how the AI agent handles calls in this campaign</p>
          </div>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div className={styles.modalTabs}>
          <button
            type="button"
            className={`${styles.modalTab} ${activeTab === 'settings' ? styles.modalTabActive : ''}`}
            onClick={() => setActiveTab('settings')}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 010 14.14M4.93 4.93a10 10 0 000 14.14"/></svg>
            General Settings
          </button>
          <button
            type="button"
            className={`${styles.modalTab} ${activeTab === 'script' ? styles.modalTabActive : ''}`}
            onClick={() => setActiveTab('script')}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
            Call Flow
            <span className={`${styles.tabBadge} ${stepCount === 0 ? styles.tabBadgeGray : ''}`}>
              {stepCount} {stepCount === 1 ? 'step' : 'steps'}
            </span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          {error && <div className={styles.error}>{error}</div>}

          {activeTab === 'settings' && (
            <>
              <div className={styles.field}>
                <label className={styles.label}>Workflow Name *</label>
                <input
                  className={styles.input}
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Due Reminder Call, Lottery Participation"
                  required
                />
              </div>

              <div className={styles.field}>
                <label className={styles.label}>Description</label>
                <input
                  className={styles.input}
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Brief description of this workflow"
                />
              </div>

              <div className={styles.scriptRow}>
                <div className={styles.field} style={{ flex: 1 }}>
                  <label className={styles.label}>AI System Prompt (Free-form mode only)</label>
                  <p className={styles.hint}>Base instructions for the AI agent. Only used when the Call Flow is disabled — if you enable the structured call flow, the agent follows your step-by-step script instead.</p>
                  <textarea
                    className={`${styles.input} ${styles.textarea}`}
                    value={form.script}
                    onChange={e => setForm(f => ({ ...f, script: e.target.value }))}
                    placeholder={`நீங்கள் ஒரு customer service AI.\nவாடகையாளரின் ஆர்டர் நிலையை தமிழில் தெரிவியுங்கள்.\nகேள்விகளுக்கு தெளிவான மற்றும் நட்பான முறையில் பதில் அளியுங்கள்.`}
                    rows={6}
                  />
                </div>
                <ScriptPreview script={form.script} />
              </div>

              <div className={styles.row}>
                <div className={styles.field}>
                  <label className={styles.label}>Schedule</label>
                  <select
                    className={styles.input}
                    value={form.schedule}
                    onChange={e => setForm(f => ({ ...f, schedule: e.target.value }))}
                  >
                    <option value="manual">Manual trigger</option>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="one-time">One-time</option>
                  </select>
                </div>
                {form.schedule !== 'manual' && (
                  <div className={styles.field}>
                    <label className={styles.label}>Schedule Time</label>
                    <input
                      type="time"
                      className={styles.input}
                      value={form.scheduleTime}
                      onChange={e => setForm(f => ({ ...f, scheduleTime: e.target.value }))}
                    />
                  </div>
                )}
                <div className={styles.field}>
                  <label className={styles.label}>Target Call Count</label>
                  <input
                    type="number"
                    min={1}
                    className={styles.input}
                    value={form.targetCount}
                    onChange={e => setForm(f => ({ ...f, targetCount: e.target.value }))}
                    placeholder="0"
                  />
                </div>
              </div>
            </>
          )}

          {activeTab === 'script' && (
            <ScriptFlowBuilder
              value={scriptFlow}
              onChange={setScriptFlow}
            />
          )}

          <div className={styles.modalActions}>
            <button type="button" className={styles.cancelBtn} onClick={onClose}>Cancel</button>
            <button type="submit" className={styles.saveBtn} disabled={saving}>
              {saving ? 'Saving...' : editWf ? 'Save Changes' : 'Create Workflow'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Workflows() {
  const [workflows, setWorkflows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editWf, setEditWf] = useState(null);
  const [updatingId, setUpdatingId] = useState(null);

  async function fetchWorkflows() {
    setLoading(true);
    try {
      const { data } = await workflowsApi.list();
      setWorkflows(data.workflows);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchWorkflows(); }, []);

  async function handleStatusToggle(wf) {
    const newStatus = wf.status === 'active' ? 'paused' : 'active';
    setUpdatingId(wf.id);
    try {
      await workflowsApi.update(wf.id, { status: newStatus });
      fetchWorkflows();
    } catch (err) {
      console.error(err);
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleDelete(wf) {
    if (!window.confirm(`Delete workflow "${wf.name}"? This cannot be undone.`)) return;
    try {
      await workflowsApi.remove(wf.id);
      fetchWorkflows();
    } catch (err) {
      alert('Failed to delete workflow');
    }
  }

  const sc = (s) => STATUS_CONFIG[s] || { label: s, bg: '#F1F5F9', color: '#64748B' };

  return (
    <div className={styles.layout}>
      <Sidebar />
      <main className={styles.main}>
        <div className={styles.header}>
          <div>
            <h1 className={styles.pageTitle}>Workflows</h1>
            <p className={styles.pageSub}>{workflows.length} configured call campaign{workflows.length !== 1 ? 's' : ''}</p>
          </div>
          <button className={styles.addBtn} onClick={() => { setEditWf(null); setShowModal(true); }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            New Workflow
          </button>
        </div>

        <div className={styles.infoBanner}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink:0, color:'var(--info)' }}>
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <div>
            <strong>What is a workflow?</strong> Each workflow defines a reusable call campaign for the AI agent (மகாலக்ஷ்மி). Use <strong>General Settings</strong> for naming and scheduling, and <strong>Call Flow</strong> to build the step-by-step conversation script the agent follows during calls.
          </div>
        </div>

        {loading ? (
          <div className={styles.loadingState}>
            <div className={styles.spinner} /><p>Loading workflows...</p>
          </div>
        ) : workflows.length === 0 ? (
          <div className={styles.emptyState}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/>
              <polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/>
            </svg>
            <h3 style={{ fontSize:16, fontWeight:600, color:'var(--text-primary)', marginBottom:6 }}>No workflows yet</h3>
            <p style={{ color:'var(--text-muted)', fontSize:13, marginBottom:20 }}>Create your first Tamil AI call campaign workflow</p>
            <button className={styles.addBtn} onClick={() => setShowModal(true)}>+ New Workflow</button>
          </div>
        ) : (
          <div className={styles.wfGrid}>
            {workflows.map(wf => {
              const st = sc(wf.status);
              const successRate = wf.callsTotal > 0 ? Math.round((wf.callsCompleted / wf.callsTotal) * 100) : null;
              const hasScript = wf.scriptFlow?.enabled && wf.scriptFlow?.steps?.length > 0;
              return (
                <div key={wf.id} className={styles.wfCard}>
                  <div className={styles.wfCardHead}>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div className={styles.wfName}>{wf.name}</div>
                      {wf.description && <div className={styles.wfDesc}>{wf.description}</div>}
                    </div>
                    <span className={styles.statusPill} style={{ background: st.bg, color: st.color }}>
                      {st.label}
                    </span>
                  </div>

                  {hasScript && (
                    <div className={styles.wfCardFlowInfo}>
                      <span className={styles.wfScriptBadge}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
                        Structured Flow · {wf.scriptFlow.steps.length} step{wf.scriptFlow.steps.length !== 1 ? 's' : ''}
                      </span>
                      <span className={styles.wfFlowModeBadge}>
                        {wf.scriptFlow.steps.reduce((c, s) => c + (s.branches?.length || 0), 0)} branches
                      </span>
                    </div>
                  )}

                  {!hasScript && (
                    <div className={styles.wfCardFlowInfo}>
                      <span className={styles.wfFreeformBadge}>Free-form AI mode</span>
                    </div>
                  )}

                  {!hasScript && wf.script && (
                    <div className={styles.wfScript}>
                      {wf.script.slice(0, 120)}{wf.script.length > 120 ? '...' : ''}
                    </div>
                  )}

                  <div className={styles.wfMeta}>
                    <div className={styles.wfMetaItem}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                      {SCHEDULE_LABELS[wf.schedule] || wf.schedule}
                      {wf.scheduleTime && ` · ${wf.scheduleTime}`}
                    </div>
                    {wf.targetCount > 0 && (
                      <div className={styles.wfMetaItem}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.64A2 2 0 012 1h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L6.09 8.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"/></svg>
                        {wf.targetCount} targets
                      </div>
                    )}
                  </div>

                  {wf.callsTotal > 0 && (
                    <div className={styles.wfStats}>
                      <div className={styles.wfStat}>
                        <div className={styles.wfStatVal}>{wf.callsTotal}</div>
                        <div className={styles.wfStatLabel}>Total</div>
                      </div>
                      <div className={styles.wfStat}>
                        <div className={styles.wfStatVal} style={{ color:'var(--success)' }}>{wf.callsCompleted}</div>
                        <div className={styles.wfStatLabel}>Done</div>
                      </div>
                      <div className={styles.wfStat}>
                        <div className={styles.wfStatVal} style={{ color:'var(--danger)' }}>{wf.callsFailed}</div>
                        <div className={styles.wfStatLabel}>Failed</div>
                      </div>
                      {successRate !== null && (
                        <div className={styles.wfStat}>
                          <div className={styles.wfStatVal} style={{ color:'var(--primary)' }}>{successRate}%</div>
                          <div className={styles.wfStatLabel}>Success</div>
                        </div>
                      )}
                    </div>
                  )}

                  <div className={styles.wfActions}>
                    <button
                      className={`${styles.wfActionBtn} ${wf.status === 'active' ? styles.pauseBtn : styles.startBtn}`}
                      onClick={() => handleStatusToggle(wf)}
                      disabled={updatingId === wf.id || wf.status === 'completed'}
                    >
                      {wf.status === 'active' ? (
                        <><svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg> Pause</>
                      ) : (
                        <><svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg> {wf.status === 'draft' ? 'Start' : 'Resume'}</>
                      )}
                    </button>
                    <button className={styles.wfEditBtn} onClick={() => { setEditWf(wf); setShowModal(true); }}>Edit</button>
                    <button className={styles.wfDeleteBtn} onClick={() => handleDelete(wf)}>Delete</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {showModal && (
        <WorkflowModal
          editWf={editWf}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); fetchWorkflows(); }}
        />
      )}
    </div>
  );
}
