import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import { agentsApi, voicesApi, settingsApi } from '../api/client';
import styles from './Agents.module.css';

const ENGINES = [
  { id: 'local',       label: 'Local (self-hosted, OSS)', badge: 'OSS' },
  { id: 'sarvam',      label: 'Sarvam AI',                badge: 'API' },
  { id: 'elevenlabs',  label: 'ElevenLabs',               badge: 'API' },
  { id: 'kuralai',     label: 'KuralAI Cloud',            badge: 'CLOUD' },
];

const LANGUAGES = [
  { code: 'ta-IN', label: 'Tamil (ta-IN)' },
  { code: 'hi-IN', label: 'Hindi (hi-IN)' },
  { code: 'en-IN', label: 'English (en-IN)' },
  { code: 'te-IN', label: 'Telugu (te-IN)' },
  { code: 'kn-IN', label: 'Kannada (kn-IN)' },
  { code: 'ml-IN', label: 'Malayalam (ml-IN)' },
];

const LLM_MODELS = [
  { id: 'qwen2.5:7b-instruct',   label: 'Qwen2.5-7B (Apache 2.0)' },
  { id: 'qwen2.5:14b-instruct',  label: 'Qwen2.5-14B (Apache 2.0)' },
  { id: 'llama3.1:8b-instruct',  label: 'Llama-3.1-8B-Instruct' },
  { id: 'gemma2:9b-instruct',    label: 'Gemma2-9B-Instruct' },
];

const AVATAR_PRESETS = ['🎙️', '👩', '👨', '👩‍💼', '👨‍💼', '🤖', '🧑‍🎓', '👵', '👴', '🦾', '✨', '💼', '📞', '🌟'];

const TEMPLATES = [
  {
    name: 'Tamil Collections Agent',
    avatar: '💼',
    description: 'Polite outbound collections for chit funds / loans.',
    language: 'ta-IN',
    greeting: 'வணக்கம், நான் சமுத்ரா. {{company_name}} சார்பாக அழைக்கிறேன். உங்களுக்கு இப்போது பேச நேரம் உள்ளதா?',
    systemPrompt: 'நீங்கள் ஒரு பணிவான, தொழில்முறை தமிழ் வசூல் முகவர். வாடிக்கையாளரிடம் நேர்மறையாக, மரியாதையுடன், ஆக்ரோஷமாக இல்லாமல் பேசுங்கள். நிலுவைத் தொகை, உரிய தேதி, செலுத்தும் வழிகளை தெளிவாகக் கூறுங்கள். பயனர் ஆட்சேபித்தால் அமைதியாகவும், புரிந்துகொண்டும் பதிலளிக்கவும்.',
    tags: ['tamil', 'female', 'collections', 'professional'],
    conversationMode: 'guided',
    temperature: 0.5,
  },
  {
    name: 'Customer Support Agent',
    avatar: '👩‍💼',
    description: 'Free-form general customer support in Tamil.',
    language: 'ta-IN',
    greeting: 'வணக்கம், நான் உங்கள் உதவி முகவர். எப்படி உதவலாம்?',
    systemPrompt: 'நீங்கள் ஒரு நட்பான, பொறுமையான தமிழ் வாடிக்கையாளர் ஆதரவு முகவர். வாடிக்கையாளரின் கேள்விகளை கவனமாக கேட்டு, தெளிவான, சுருக்கமான பதில்கள் வழங்குங்கள். தேவைப்பட்டால் தெளிவுபடுத்த கேளுங்கள்.',
    tags: ['tamil', 'female', 'support', 'warm'],
    conversationMode: 'freeform',
    temperature: 0.7,
  },
  {
    name: 'Lead Qualifier',
    avatar: '🌟',
    description: 'Outbound lead qualification — short, energetic.',
    language: 'ta-IN',
    greeting: 'ஹலோ! நான் ப்ரியா. {{company_name}}-இலிருந்து அழைக்கிறேன். ஒரு நிமிடம் பேசலாமா?',
    systemPrompt: 'நீங்கள் ஒரு ஆற்றல் மிக்க, நட்பான தமிழ் விற்பனை முகவர். வாடிக்கையாளரின் தேவைகளை விரைவாகப் புரிந்துகொண்டு, பொருத்தமான தீர்வுகளைச் சுருக்கமாக முன்மொழியுங்கள். அழைப்பு குறுகியதாக, மதிப்புள்ளதாக இருக்கட்டும்.',
    tags: ['tamil', 'female', 'sales', 'energetic'],
    conversationMode: 'freeform',
    temperature: 0.7,
  },
];

function gradientFor(id) {
  const palettes = [
    ['#6366f1', '#8b5cf6'], ['#ec4899', '#f43f5e'], ['#06b6d4', '#3b82f6'],
    ['#f59e0b', '#ef4444'], ['#10b981', '#06b6d4'], ['#8b5cf6', '#ec4899'],
  ];
  let h = 0;
  for (let i = 0; i < (id || '').length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return palettes[h % palettes.length];
}

export default function Agents() {
  const navigate = useNavigate();
  const [agents, setAgents] = useState([]);
  const [voices, setVoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterEngine, setFilterEngine] = useState('');
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);
  const [toast, setToast] = useState('');
  const [webhookToken, setWebhookToken] = useState('');

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [a, s] = await Promise.all([
        agentsApi.list(),
        settingsApi.get().catch(() => ({ data: {} })),
      ]);
      setAgents(a.data?.agents || []);
      setWebhookToken(s.data?.webhookToken || s.data?.exotelWebhookToken || '');
      try {
        const v = await fetch('/webhook/local-voices');
        const j = await v.json();
        setVoices(j.voices || []);
      } catch { /* ignore */ }
    } catch (e) { setToast(`Could not load: ${e.message}`); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { reload(); }, [reload]);

  function flash(msg) { setToast(msg); setTimeout(() => setToast(''), 3500); }

  async function save(payload, isEditing) {
    try {
      if (isEditing) await agentsApi.update(payload.id, payload);
      else await agentsApi.create(payload);
      flash(isEditing ? 'Agent updated.' : 'Agent created.');
      setEditing(null); setCreating(false);
      await reload();
    } catch (e) { flash(`Save failed: ${e.response?.data?.error || e.message}`); }
  }

  async function remove(agent) {
    if (!window.confirm(`Delete agent "${agent.name}"?`)) return;
    try {
      await agentsApi.delete(agent.id);
      flash('Agent deleted.');
      await reload();
    } catch (e) { flash(`Delete failed: ${e.message}`); }
  }

  async function setDefault(agent) {
    try {
      await agentsApi.update(agent.id, { isDefault: true });
      flash(`"${agent.name}" is now the default agent.`);
      await reload();
    } catch (e) { flash(`Could not set default: ${e.message}`); }
  }

  async function preview(agent) {
    if (!webhookToken) { flash('Set Webhook Token under Settings → Telephony first.'); return; }
    if (!agent.voice) { flash('Assign a voice to this agent first.'); return; }
    try {
      const r = await fetch(`/webhook/local-voices/preview?wt=${encodeURIComponent(webhookToken)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voice: agent.voice, text: agent.greeting || 'வணக்கம், நான் உங்கள் தமிழ் AI முகவர்.' }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      new Audio(url).play();
    } catch (e) { flash(`Preview failed: ${e.message}`); }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return agents.filter(a => {
      if (filterEngine && a.engine !== filterEngine) return false;
      if (!q) return true;
      return (a.name?.toLowerCase().includes(q) ||
              a.description?.toLowerCase().includes(q) ||
              (a.tags || []).some(t => t.toLowerCase().includes(q)));
    });
  }, [agents, search, filterEngine]);

  return (
    <div className={styles.layout}>
      <Sidebar />
      <main className={styles.main}>
        <header className={styles.hero}>
          <div>
            <div className={styles.kicker}>AI AGENTS · Multi-persona conversational engine</div>
            <h1 className={styles.title}>Build voice agents for every workflow</h1>
            <p className={styles.subtitle}>
              Each agent has its own voice, greeting, system prompt, and language. Create one for collections, another for support — pick the right agent per call.
            </p>
          </div>
          <div className={styles.heroActions}>
            <button className={styles.secondaryBtn} onClick={() => navigate('/voice-lab')}>🎙️ Voice Lab</button>
            <button className={styles.primaryBtn} onClick={() => setCreating(true)}>+ New Agent</button>
          </div>
        </header>

        {/* Templates strip — only when library is small */}
        {agents.length < 4 && (
          <section className={styles.templates}>
            <div className={styles.templatesHeader}>
              <h3>Start from a template</h3>
              <span className={styles.templatesHint}>Pre-configured agents you can customise</span>
            </div>
            <div className={styles.templateGrid}>
              {TEMPLATES.map(t => (
                <button key={t.name} className={styles.templateCard} onClick={() => setCreating({ ...t })}>
                  <div className={styles.templateAvatar}>{t.avatar}</div>
                  <div className={styles.templateBody}>
                    <div className={styles.templateName}>{t.name}</div>
                    <div className={styles.templateDesc}>{t.description}</div>
                  </div>
                  <div className={styles.templateAdd}>+</div>
                </button>
              ))}
            </div>
          </section>
        )}

        <section className={styles.filters}>
          <div className={styles.searchWrap}>
            <span className={styles.searchIcon}>🔍</span>
            <input className={styles.searchInput} placeholder="Search agents…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select className={styles.filter} value={filterEngine} onChange={e => setFilterEngine(e.target.value)}>
            <option value="">All engines</option>
            {ENGINES.map(e => <option key={e.id} value={e.id}>{e.label}</option>)}
          </select>
          <span className={styles.count}>{filtered.length} of {agents.length}</span>
        </section>

        {loading ? (
          <div className={styles.empty}>Loading agents…</div>
        ) : filtered.length === 0 ? (
          <div className={styles.empty}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>🤖</div>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>No agents yet</div>
            <div style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>Create your first agent or pick a template above.</div>
            <button className={styles.primaryBtn} onClick={() => setCreating(true)}>+ New Agent</button>
          </div>
        ) : (
          <section className={styles.list}>
            {filtered.map(a => (
              <AgentRow
                key={a.id}
                agent={a}
                voices={voices}
                onPreview={() => preview(a)}
                onEdit={() => setEditing(a)}
                onDelete={() => remove(a)}
                onSetDefault={() => setDefault(a)}
              />
            ))}
          </section>
        )}

        {(creating || editing) && (
          <AgentEditor
            initial={editing || creating}
            isEditing={!!editing}
            voices={voices}
            onSave={(p) => save(p, !!editing)}
            onClose={() => { setCreating(false); setEditing(null); }}
            onPreviewVoice={(voiceId, text) => {
              if (!voiceId || !webhookToken) return;
              fetch(`/webhook/local-voices/preview?wt=${encodeURIComponent(webhookToken)}`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ voice: voiceId, text }),
              }).then(r => r.ok ? r.blob() : null).then(b => b && new Audio(URL.createObjectURL(b)).play()).catch(() => {});
            }}
          />
        )}

        {toast && <div className={styles.toast}>{toast}</div>}
      </main>
    </div>
  );
}

function AgentRow({ agent, voices, onPreview, onEdit, onDelete, onSetDefault }) {
  const [g1, g2] = gradientFor(agent.id);
  const voice = voices.find(v => v.id === agent.voice);
  const engine = ENGINES.find(e => e.id === agent.engine) || { label: agent.engine, badge: '' };

  return (
    <article className={styles.row}>
      <div className={styles.rowAvatar} style={{ background: `linear-gradient(135deg, ${g1}, ${g2})` }}>
        <span>{agent.avatar || '🤖'}</span>
      </div>
      <div className={styles.rowMain}>
        <div className={styles.rowTop}>
          <h3 className={styles.rowName}>{agent.name}</h3>
          {agent.isDefault && <span className={styles.defaultBadge}>Default</span>}
          <span className={styles.engineBadge}>{engine.badge}</span>
        </div>
        <div className={styles.rowMeta}>
          <span>🎙 {voice?.displayName || agent.voice || 'No voice'}</span>
          <span>·</span>
          <span>🌐 {agent.language}</span>
          <span>·</span>
          <span>💬 {agent.conversationMode}</span>
          <span>·</span>
          <span>🤖 {agent.llmModel}</span>
        </div>
        {agent.description && <p className={styles.rowDesc}>{agent.description}</p>}
        {(agent.tags || []).length > 0 && (
          <div className={styles.tagRow}>{agent.tags.map(t => <span key={t} className={styles.tag}>{t}</span>)}</div>
        )}
      </div>
      <div className={styles.rowActions}>
        <button className={styles.iconAction} onClick={onPreview} title="Preview greeting">▶</button>
        <button className={styles.linkBtn} onClick={onEdit}>Edit</button>
        {!agent.isDefault && <button className={styles.linkBtn} onClick={onSetDefault}>Set Default</button>}
        <button className={styles.linkDanger} onClick={onDelete}>Delete</button>
      </div>
    </article>
  );
}

function AgentEditor({ initial, isEditing, voices, onSave, onClose, onPreviewVoice }) {
  const [f, setF] = useState({
    id:               initial?.id || '',
    name:             initial?.name || '',
    description:      initial?.description || '',
    avatar:           initial?.avatar || '🤖',
    voice:            initial?.voice || '',
    voiceDescription: initial?.voiceDescription || '',
    language:         initial?.language || 'ta-IN',
    greeting:         initial?.greeting || '',
    systemPrompt:     initial?.systemPrompt || '',
    engine:           initial?.engine || 'local',
    llmModel:         initial?.llmModel || 'qwen2.5:7b-instruct',
    temperature:      typeof initial?.temperature === 'number' ? initial.temperature : 0.6,
    maxTokens:        typeof initial?.maxTokens === 'number' ? initial.maxTokens : 256,
    engineFallbackChain: initial?.engineFallbackChain || 'local,sarvam',
    conversationMode: initial?.conversationMode || 'freeform',
    tags:             (initial?.tags || []).join(', '),
    isDefault:        !!initial?.isDefault,
  });
  const [tab, setTab] = useState('persona');

  const set = (k, v) => setF(s => ({ ...s, [k]: v }));

  function submit(e) {
    e?.preventDefault?.();
    if (!f.name.trim()) return alert('Name is required.');
    onSave({
      ...f,
      tags: f.tags.split(',').map(t => t.trim()).filter(Boolean),
      temperature: Number(f.temperature),
      maxTokens: Number(f.maxTokens),
    });
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <header className={styles.modalHeader}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className={styles.modalAvatar}>{f.avatar}</span>
            <div>
              <h3>{isEditing ? `Edit "${initial.name}"` : 'New agent'}</h3>
              <div className={styles.modalSub}>{isEditing ? 'Tune persona, voice, and behaviour.' : 'Define a new AI persona.'}</div>
            </div>
          </div>
          <button className={styles.iconBtn} onClick={onClose}>✕</button>
        </header>

        <nav className={styles.modalTabs}>
          {[
            { id: 'persona',  label: 'Persona' },
            { id: 'voice',    label: 'Voice & Language' },
            { id: 'brain',    label: 'Brain (LLM)' },
            { id: 'meta',     label: 'Tags & Defaults' },
          ].map(t => (
            <button key={t.id} className={`${styles.modalTab} ${tab === t.id ? styles.modalTabActive : ''}`} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </nav>

        <div className={styles.modalBody}>
          {tab === 'persona' && (
            <div className={styles.formGrid}>
              <div className={styles.field}>
                <label>Avatar</label>
                <div className={styles.avatarPicker}>
                  {AVATAR_PRESETS.map(em => (
                    <button key={em} type="button"
                            className={`${styles.avatarOption} ${f.avatar === em ? styles.avatarOptionActive : ''}`}
                            onClick={() => set('avatar', em)}>{em}</button>
                  ))}
                </div>
              </div>
              <div className={styles.field}>
                <label>Name</label>
                <input className={styles.input} value={f.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Priya — Tamil Collections" />
              </div>
              <div className={styles.fieldFull}>
                <label>Short description</label>
                <input className={styles.input} value={f.description} onChange={e => set('description', e.target.value)} placeholder="One-line summary shown on the agent card." />
              </div>
              <div className={styles.fieldFull}>
                <label>Greeting (first message)</label>
                <textarea className={styles.input} rows={2} value={f.greeting} onChange={e => set('greeting', e.target.value)}
                          placeholder="வணக்கம், நான் ப்ரியா. {{company_name}} சார்பாக அழைக்கிறேன்." />
                <div className={styles.hint}>Spoken first. Supports template vars like <code>{'{{customer_name}}'}</code>.</div>
              </div>
              <div className={styles.fieldFull}>
                <label>System prompt (instructions for the LLM)</label>
                <textarea className={styles.input} rows={6} value={f.systemPrompt} onChange={e => set('systemPrompt', e.target.value)}
                          placeholder="You are a polite, professional Tamil collections agent…" />
                <div className={styles.hint}>Defines the persona, knowledge boundaries, and conversational style.</div>
              </div>
            </div>
          )}

          {tab === 'voice' && (
            <div className={styles.formGrid}>
              <div className={styles.fieldFull}>
                <label>Voice</label>
                <div className={styles.voicePickGrid}>
                  {voices.length === 0 && <div className={styles.hint}>No voices yet. Open Voice Lab to add some.</div>}
                  {voices.map(v => (
                    <button key={v.id} type="button"
                            className={`${styles.voicePick} ${f.voice === v.id ? styles.voicePickActive : ''}`}
                            onClick={() => { set('voice', v.id); set('voiceDescription', v.description || ''); }}>
                      <div className={styles.voicePickName}>{v.displayName}</div>
                      <div className={styles.voicePickMeta}>{v.language} · {v.gender}</div>
                      <button type="button" className={styles.voicePickPlay}
                              onClick={(e) => { e.stopPropagation(); onPreviewVoice(v.id, f.greeting || 'வணக்கம்.'); }}>▶</button>
                    </button>
                  ))}
                </div>
              </div>
              <div className={styles.field}>
                <label>Language</label>
                <select className={styles.input} value={f.language} onChange={e => set('language', e.target.value)}>
                  {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
                </select>
              </div>
              <div className={styles.field}>
                <label>Engine</label>
                <select className={styles.input} value={f.engine} onChange={e => set('engine', e.target.value)}>
                  {ENGINES.map(en => <option key={en.id} value={en.id}>{en.label}</option>)}
                </select>
              </div>
              <div className={styles.fieldFull}>
                <label>Voice style override (optional)</label>
                <textarea className={styles.input} rows={3} value={f.voiceDescription} onChange={e => set('voiceDescription', e.target.value)}
                          placeholder="Per-agent style override for Parler-TTS. Defaults to the voice's stored description." />
              </div>
            </div>
          )}

          {tab === 'brain' && (
            <div className={styles.formGrid}>
              <div className={styles.field}>
                <label>LLM model</label>
                <select className={styles.input} value={f.llmModel} onChange={e => set('llmModel', e.target.value)}>
                  {LLM_MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                </select>
              </div>
              <div className={styles.field}>
                <label>Conversation mode</label>
                <select className={styles.input} value={f.conversationMode} onChange={e => set('conversationMode', e.target.value)}>
                  <option value="freeform">Free-form (no scripted flow)</option>
                  <option value="guided">Guided (use call workflows)</option>
                </select>
              </div>
              <div className={styles.field}>
                <label>Temperature: {f.temperature}</label>
                <input type="range" min="0" max="1" step="0.05" value={f.temperature} onChange={e => set('temperature', e.target.value)} />
                <div className={styles.hint}>0 = deterministic · 1 = creative</div>
              </div>
              <div className={styles.field}>
                <label>Max tokens per turn</label>
                <input type="number" className={styles.input} value={f.maxTokens} min="32" max="2048" step="16" onChange={e => set('maxTokens', e.target.value)} />
              </div>
              <div className={styles.fieldFull}>
                <label>Fallback chain</label>
                <input className={styles.input} value={f.engineFallbackChain}
                       onChange={e => set('engineFallbackChain', e.target.value)}
                       placeholder="local,sarvam" />
                <div className={styles.hint}>Comma-separated engines tried per turn (STT/LLM/TTS). E.g. <code>local,sarvam</code> keeps calls flowing if the GPU box is down.</div>
              </div>
            </div>
          )}

          {tab === 'meta' && (
            <div className={styles.formGrid}>
              <div className={styles.fieldFull}>
                <label>Tags (comma-separated)</label>
                <input className={styles.input} value={f.tags} onChange={e => set('tags', e.target.value)} placeholder="tamil, female, collections" />
              </div>
              <div className={styles.fieldFull}>
                <label>
                  <input type="checkbox" checked={f.isDefault} onChange={e => set('isDefault', e.target.checked)} style={{ marginRight: 8 }} />
                  Set as default agent
                </label>
                <div className={styles.hint}>The default agent runs when a call is initiated without an explicit agentId.</div>
              </div>
            </div>
          )}
        </div>

        <footer className={styles.modalFooter}>
          <button className={styles.linkBtn} onClick={onClose}>Cancel</button>
          <div style={{ flex: 1 }} />
          <button className={styles.primaryBtn} onClick={submit}>{isEditing ? 'Save changes' : 'Create agent'}</button>
        </footer>
      </div>
    </div>
  );
}
