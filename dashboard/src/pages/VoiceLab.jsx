import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import Sidebar from '../components/Sidebar';
import { settingsApi } from '../api/client';
import styles from './VoiceLab.module.css';

const DEFAULT_PREVIEW_TEXT = 'வணக்கம், நான் உங்கள் தமிழ் AI உதவியாளர். நான் எப்படி உதவலாம்?';

const LANGUAGES = [
  { code: 'ta', label: 'Tamil',     flag: '🇮🇳' },
  { code: 'hi', label: 'Hindi',     flag: '🇮🇳' },
  { code: 'en', label: 'English',   flag: '🌐' },
  { code: 'te', label: 'Telugu',    flag: '🇮🇳' },
  { code: 'kn', label: 'Kannada',   flag: '🇮🇳' },
  { code: 'ml', label: 'Malayalam', flag: '🇮🇳' },
];
const langLabel = c => (LANGUAGES.find(l => l.code === c) || { label: c, flag: '🌐' });

const TAG_PRESETS = [
  'warm', 'professional', 'friendly', 'energetic', 'calm', 'authoritative',
  'youthful', 'mature', 'bright', 'deep', 'expressive', 'measured',
  'collections', 'support', 'sales', 'reminder', 'survey', 'announcement',
];

// Deterministic gradient colour from voice id — gives each card a unique avatar.
function gradientFor(id) {
  const palettes = [
    ['#6366f1', '#8b5cf6'], ['#ec4899', '#f43f5e'], ['#06b6d4', '#3b82f6'],
    ['#f59e0b', '#ef4444'], ['#10b981', '#06b6d4'], ['#8b5cf6', '#ec4899'],
    ['#3b82f6', '#06b6d4'], ['#14b8a6', '#0ea5e9'], ['#f97316', '#eab308'],
    ['#a855f7', '#6366f1'], ['#22c55e', '#84cc16'], ['#ef4444', '#f97316'],
  ];
  let h = 0;
  for (let i = 0; i < (id || '').length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return palettes[h % palettes.length];
}
const initial = name => (name || '?').trim()[0]?.toUpperCase() || '?';

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function VoiceLab() {
  const [token, setToken] = useState('');
  const [voices, setVoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('library');     // library | design
  const [search, setSearch] = useState('');
  const [filterLang, setFilterLang] = useState('');
  const [filterGender, setFilterGender] = useState('');
  const [filterTag, setFilterTag] = useState('');
  const [previewText, setPreviewText] = useState(DEFAULT_PREVIEW_TEXT);
  const [editing, setEditing] = useState(null);     // voice obj being edited
  const [creating, setCreating] = useState(false);
  const [toast, setToast] = useState('');
  const [defaultVoice, setDefaultVoice] = useState('');

  // Audio playback state.
  const audioRef = useRef(null);
  const [playingId, setPlayingId] = useState('');
  const [playUrl, setPlayUrl] = useState(null);

  // Load settings (for webhook token + current default voice).
  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const [r, t] = await Promise.all([
          settingsApi.get(),
          settingsApi.getWebhookToken().catch(() => ({ data: {} })),
        ]);
        if (dead) return;
        setToken(t.data?.token || '');
        setDefaultVoice(r.data?.settings?.localTtsVoice || '');
      } catch { /* ignore */ }
    })();
    return () => { dead = true; };
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/webhook/local-voices');
      const j = await r.json();
      setVoices(j.voices || []);
    } catch (e) {
      setToast(`Could not load voices: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { reload(); }, [reload]);

  function flash(msg) { setToast(msg); setTimeout(() => setToast(''), 3500); }

  async function play(voice, text) {
    try {
      if (!token) { flash('Set the Webhook Token under Settings → Telephony first.'); return; }
      stopPlayback();
      setPlayingId(voice.id);
      const r = await fetch(`/webhook/local-voices/preview?wt=${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voice: voice.id, text: text || previewText }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${r.status}`);
      }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      setPlayUrl(url);
      setTimeout(() => audioRef.current?.play().catch(() => {}), 50);
    } catch (e) {
      flash(`Preview failed: ${e.message}`);
      setPlayingId('');
    }
  }
  function stopPlayback() {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = 0; }
    if (playUrl) { URL.revokeObjectURL(playUrl); setPlayUrl(null); }
    setPlayingId('');
  }

  async function handleSave(payload) {
    if (!token) { flash('Set the Webhook Token under Settings → Telephony first.'); return; }
    try {
      const url = payload._editing
        ? `/webhook/local-voices/${encodeURIComponent(payload.voiceId)}?wt=${encodeURIComponent(token)}`
        : `/webhook/local-voices?wt=${encodeURIComponent(token)}`;
      const method = payload._editing ? 'PATCH' : 'POST';
      const body = payload._editing
        ? {
            displayName: payload.displayName,
            language: payload.language,
            gender: payload.gender,
            description: payload.description,
            tags: payload.tags,
            useCase: payload.useCase,
            age: payload.age,
            accent: payload.accent,
          }
        : { ...payload };
      const r = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      flash(payload._editing ? 'Voice updated.' : 'Voice created.');
      setEditing(null); setCreating(false);
      await reload();
    } catch (e) { flash(`Save failed: ${e.message}`); }
  }

  async function handleDelete(voice) {
    if (!token) { flash('Set the Webhook Token under Settings → Telephony first.'); return; }
    if (!window.confirm(`Delete voice "${voice.displayName}"?`)) return;
    try {
      const r = await fetch(`/webhook/local-voices/${encodeURIComponent(voice.id)}?wt=${encodeURIComponent(token)}`, { method: 'DELETE' });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${r.status}`);
      }
      flash('Voice deleted.');
      await reload();
    } catch (e) { flash(`Delete failed: ${e.message}`); }
  }

  async function handleSetDefault(voice) {
    try {
      // Pull current settings, patch only localTtsVoice + localVoiceDescription.
      const cur = (await settingsApi.get()).data?.settings || {};
      await settingsApi.update({
        localTtsVoice: voice.id,
        localVoiceDescription: voice.description || cur.localVoiceDescription || '',
      });
      setDefaultVoice(voice.id);
      flash(`"${voice.displayName}" is now the default voice.`);
    } catch (e) { flash(`Could not set default: ${e.message}`); }
  }

  // Filtering.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return voices.filter(v => {
      if (filterLang && v.language !== filterLang) return false;
      if (filterGender && v.gender !== filterGender) return false;
      if (filterTag && !(v.tags || []).includes(filterTag)) return false;
      if (!q) return true;
      return (
        v.displayName?.toLowerCase().includes(q) ||
        v.id?.toLowerCase().includes(q) ||
        (v.description || '').toLowerCase().includes(q) ||
        (v.tags || []).some(t => t.toLowerCase().includes(q))
      );
    });
  }, [voices, search, filterLang, filterGender, filterTag]);

  const allTags = useMemo(() => {
    const s = new Set();
    voices.forEach(v => (v.tags || []).forEach(t => s.add(t)));
    return [...s].sort();
  }, [voices]);

  return (
    <div className={styles.layout}>
      <Sidebar />
      <main className={styles.main}>
        {/* Hero / header */}
        <header className={styles.hero}>
          <div>
            <div className={styles.kicker}>VOICE LAB · 100% open-source · Indic-Parler-TTS</div>
            <h1 className={styles.title}>Design and manage premium AI voices</h1>
            <p className={styles.subtitle}>
              Describe a voice in plain English. Pick from your library. Modify any voice anytime by editing the prompt — no re-recording required.
            </p>
          </div>
          <div className={styles.heroActions}>
            <button className={styles.secondaryBtn} onClick={() => setTab('design')}>✨ Design Voice</button>
            <button className={styles.primaryBtn} onClick={() => setCreating(true)}>+ New Voice</button>
          </div>
        </header>

        {/* Try-it preview bar */}
        <section className={styles.tryBar}>
          <span className={styles.tryLabel}>Try it</span>
          <input
            className={styles.tryInput}
            value={previewText}
            onChange={e => setPreviewText(e.target.value)}
            placeholder="Type any text and click ▶ on any voice…"
          />
          <button className={styles.tryReset} onClick={() => setPreviewText(DEFAULT_PREVIEW_TEXT)}>Reset</button>
        </section>

        {/* Tabs */}
        <nav className={styles.tabs}>
          {[
            { id: 'library', label: `My Library (${voices.length})` },
            { id: 'design',  label: 'Voice Design' },
          ].map(t => (
            <button key={t.id} className={`${styles.tab} ${tab === t.id ? styles.tabActive : ''}`} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </nav>

        {tab === 'library' && (
          <>
            {/* Filters */}
            <section className={styles.filters}>
              <div className={styles.searchWrap}>
                <span className={styles.searchIcon}>🔍</span>
                <input
                  className={styles.searchInput}
                  placeholder="Search by name, description, or tag"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
              <select className={styles.filter} value={filterLang} onChange={e => setFilterLang(e.target.value)}>
                <option value="">All languages</option>
                {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.flag} {l.label}</option>)}
              </select>
              <select className={styles.filter} value={filterGender} onChange={e => setFilterGender(e.target.value)}>
                <option value="">All genders</option>
                <option value="female">Female</option>
                <option value="male">Male</option>
                <option value="unknown">Unknown</option>
              </select>
              <select className={styles.filter} value={filterTag} onChange={e => setFilterTag(e.target.value)}>
                <option value="">All tags</option>
                {allTags.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <span className={styles.count}>{filtered.length} of {voices.length}</span>
            </section>

            {/* Grid */}
            {loading ? (
              <div className={styles.empty}>Loading voices…</div>
            ) : filtered.length === 0 ? (
              <div className={styles.empty}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>🎙️</div>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>No voices yet</div>
                <div style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>
                  Create your first voice by describing how it should sound, or use the Voice Design tab to generate variants.
                </div>
                <button className={styles.primaryBtn} onClick={() => setCreating(true)}>+ New Voice</button>
              </div>
            ) : (
              <section className={styles.grid}>
                {filtered.map(v => (
                  <VoiceCard
                    key={v.id}
                    voice={v}
                    isDefault={v.id === defaultVoice}
                    isPlaying={playingId === v.id}
                    onPlay={() => play(v)}
                    onStop={stopPlayback}
                    onEdit={() => setEditing(v)}
                    onDelete={() => handleDelete(v)}
                    onSetDefault={() => handleSetDefault(v)}
                  />
                ))}
              </section>
            )}
          </>
        )}

        {tab === 'design' && (
          <VoiceDesign token={token} previewText={previewText} onSaved={async () => { await reload(); setTab('library'); flash('Voice added to your library.'); }} />
        )}

        {/* Create / Edit modal */}
        {(creating || editing) && (
          <VoiceFormModal
            initial={editing}
            onSave={handleSave}
            onClose={() => { setCreating(false); setEditing(null); }}
            tagPresets={TAG_PRESETS}
            onPreview={(text, draft) => {
              if (editing) play(editing, text);
              else flash('Save the voice first to preview.');
            }}
          />
        )}

        {/* Hidden audio element drives playback. */}
        {playUrl && (
          <audio
            ref={audioRef}
            src={playUrl}
            onEnded={stopPlayback}
            style={{ display: 'none' }}
          />
        )}

        {toast && <div className={styles.toast}>{toast}</div>}
      </main>
    </div>
  );
}

// ─── Voice Card ───────────────────────────────────────────────────────────────
function VoiceCard({ voice, isDefault, isPlaying, onPlay, onStop, onEdit, onDelete, onSetDefault }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [g1, g2] = gradientFor(voice.id);
  const lang = langLabel(voice.language);

  return (
    <article className={`${styles.card} ${isPlaying ? styles.cardPlaying : ''}`}>
      <button className={styles.cardPlay} onClick={isPlaying ? onStop : onPlay} aria-label="Preview">
        <div className={styles.avatar} style={{ background: `linear-gradient(135deg, ${g1}, ${g2})` }}>
          <span className={styles.avatarLetter}>{initial(voice.displayName)}</span>
          <span className={styles.playIcon}>{isPlaying ? '◼' : '▶'}</span>
        </div>
        {isPlaying && <div className={styles.waveform}><i/><i/><i/><i/><i/></div>}
      </button>

      <div className={styles.cardBody}>
        <div className={styles.cardHeader}>
          <h3 className={styles.cardName}>{voice.displayName}</h3>
          {isDefault && <span className={styles.defaultBadge}>Default</span>}
        </div>
        <div className={styles.cardMeta}>
          <span>{lang.flag} {lang.label}</span>
          <span>·</span>
          <span style={{ textTransform: 'capitalize' }}>{voice.gender}</span>
          {voice.builtin && <><span>·</span><span>Built-in</span></>}
        </div>
        {voice.description && (
          <p className={styles.cardDesc}>"{voice.description.length > 130 ? voice.description.slice(0, 130) + '…' : voice.description}"</p>
        )}
        {(voice.tags || []).length > 0 && (
          <div className={styles.tagRow}>
            {voice.tags.slice(0, 4).map(t => <span key={t} className={styles.tag}>{t}</span>)}
            {voice.tags.length > 4 && <span className={styles.tag}>+{voice.tags.length - 4}</span>}
          </div>
        )}
      </div>

      <div className={styles.cardFooter}>
        <button className={styles.linkBtn} onClick={onEdit}>Edit</button>
        {!isDefault && <button className={styles.linkBtn} onClick={onSetDefault}>Set Default</button>}
        <div className={styles.menuWrap}>
          <button className={styles.iconBtn} onClick={() => setMenuOpen(o => !o)}>⋮</button>
          {menuOpen && (
            <div className={styles.menu} onMouseLeave={() => setMenuOpen(false)}>
              <button onClick={() => { setMenuOpen(false); onPlay(); }}>▶ Play preview</button>
              <button onClick={() => { setMenuOpen(false); onEdit(); }}>✎ Edit</button>
              <button onClick={() => { setMenuOpen(false); navigator.clipboard?.writeText(voice.id); }}>⧉ Copy voice ID</button>
              {!voice.builtin && <button onClick={() => { setMenuOpen(false); onDelete(); }} className={styles.menuDanger}>🗑 Delete</button>}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

// ─── Voice Design (3-variant generator) ───────────────────────────────────────
function VoiceDesign({ token, previewText, onSaved }) {
  const [desc, setDesc] = useState('A warm, professional female speaker in Tamil with a friendly conversational tone.');
  const [text, setText] = useState(previewText);
  const [busy, setBusy] = useState(false);
  const [variants, setVariants] = useState([]);
  const [chosen, setChosen] = useState(null);
  const audioRef = useRef(null);
  const [playingIdx, setPlayingIdx] = useState(-1);
  const [meta, setMeta] = useState({ voiceId: '', displayName: '', language: 'ta', gender: 'female', tags: '' });

  async function generate() {
    if (!token) { alert('Set the Webhook Token under Settings → Telephony first.'); return; }
    if (!desc.trim()) return;
    setBusy(true); setVariants([]); setChosen(null);
    try {
      const r = await fetch(`/webhook/local-voices/design?wt=${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: desc, text, language: 'ta' }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setVariants(j.variants || []);
    } catch (e) { alert(`Generation failed: ${e.message}`); }
    finally { setBusy(false); }
  }

  function playVariant(i) {
    const v = variants[i];
    if (!v?.audioBase64) return;
    const blob = b64ToBlob(v.audioBase64, 'audio/wav');
    const url = URL.createObjectURL(blob);
    if (audioRef.current) {
      audioRef.current.src = url;
      audioRef.current.play().catch(() => {});
    }
    setPlayingIdx(i);
  }

  async function commit() {
    if (chosen == null || !variants[chosen]) return;
    if (!meta.voiceId) { alert('Give your voice an ID (e.g. priya-tamil-warm).'); return; }
    if (!token) { alert('Set the Webhook Token under Settings → Telephony first.'); return; }
    try {
      const tags = meta.tags.split(',').map(t => t.trim()).filter(Boolean);
      const r = await fetch(`/webhook/local-voices?wt=${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          voiceId: meta.voiceId,
          displayName: meta.displayName || meta.voiceId,
          language: meta.language,
          gender: meta.gender,
          description: variants[chosen].description,
          tags,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      onSaved?.();
    } catch (e) { alert(`Save failed: ${e.message}`); }
  }

  return (
    <section className={styles.designPanel}>
      <div className={styles.designIntro}>
        <h2>Voice Design</h2>
        <p>Describe how the voice should sound. We'll generate 3 audio variants — pick your favourite and save it to your library.</p>
      </div>

      <div className={styles.designForm}>
        <label className={styles.fieldLabel}>Voice description (the prompt)</label>
        <textarea
          className={styles.designTextarea}
          rows={4}
          value={desc}
          onChange={e => setDesc(e.target.value)}
          placeholder="e.g. A warm female Tamil speaker, slow expressive delivery, slightly breathy, professional studio recording with no background noise."
        />

        <label className={styles.fieldLabel}>Preview text (what to speak)</label>
        <textarea
          className={styles.designTextarea}
          rows={2}
          value={text}
          onChange={e => setText(e.target.value)}
        />

        <button className={styles.primaryBtn} onClick={generate} disabled={busy}>
          {busy ? '✨ Generating 3 variants…' : '✨ Generate 3 Variants'}
        </button>
      </div>

      {variants.length > 0 && (
        <div className={styles.variants}>
          <h3 className={styles.variantsTitle}>Pick your favourite</h3>
          <div className={styles.variantGrid}>
            {variants.map((v, i) => (
              <article
                key={i}
                className={`${styles.variantCard} ${chosen === i ? styles.variantChosen : ''}`}
                onClick={() => setChosen(i)}
              >
                <div className={styles.variantLabel}>
                  <span className={styles.variantBadge}>{String.fromCharCode(65 + i)}</span>
                  {v.label}
                </div>
                <button
                  className={styles.variantPlay}
                  onClick={(e) => { e.stopPropagation(); playVariant(i); }}
                  disabled={!v.audioBase64}
                >
                  {playingIdx === i ? '◼ Stop' : '▶ Play'}
                </button>
                <p className={styles.variantDesc}>{v.description}</p>
                {v.error && <div className={styles.variantError}>{v.error}</div>}
              </article>
            ))}
          </div>

          {chosen != null && (
            <div className={styles.commit}>
              <h4>Save "{variants[chosen].label}" variant to your library</h4>
              <div className={styles.commitGrid}>
                <input className={styles.input} placeholder="voice-id (e.g. priya-tamil-warm)" value={meta.voiceId}
                       onChange={e => setMeta(m => ({ ...m, voiceId: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') }))} />
                <input className={styles.input} placeholder="Display name" value={meta.displayName}
                       onChange={e => setMeta(m => ({ ...m, displayName: e.target.value }))} />
                <select className={styles.input} value={meta.language} onChange={e => setMeta(m => ({ ...m, language: e.target.value }))}>
                  {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
                </select>
                <select className={styles.input} value={meta.gender} onChange={e => setMeta(m => ({ ...m, gender: e.target.value }))}>
                  <option value="female">Female</option><option value="male">Male</option><option value="unknown">Unknown</option>
                </select>
                <input className={styles.input} placeholder="tags, comma, separated" value={meta.tags}
                       onChange={e => setMeta(m => ({ ...m, tags: e.target.value }))} style={{ gridColumn: '1 / -1' }} />
              </div>
              <button className={styles.primaryBtn} onClick={commit}>Save to library</button>
            </div>
          )}
        </div>
      )}

      <audio ref={audioRef} onEnded={() => setPlayingIdx(-1)} style={{ display: 'none' }} />
    </section>
  );
}

// ─── Voice Form Modal (create/edit) ───────────────────────────────────────────
function VoiceFormModal({ initial, onSave, onClose, tagPresets, onPreview }) {
  const editing = !!initial;
  const [f, setF] = useState({
    voiceId:     initial?.id          || '',
    displayName: initial?.displayName || '',
    language:    initial?.language    || 'ta',
    gender:      initial?.gender      || 'female',
    description: initial?.description || 'A warm, professional female speaker in Tamil with a friendly tone, moderate pace, and very high studio audio quality.',
    tags:        (initial?.tags || []).join(', '),
    useCase:     initial?.useCase     || '',
    age:         initial?.age         || '',
    accent:      initial?.accent      || '',
  });
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));

  function submit(e) {
    e.preventDefault();
    if (!f.voiceId) return alert('Voice ID required.');
    if (!f.description.trim()) return alert('Description required.');
    onSave({
      voiceId: f.voiceId,
      displayName: f.displayName || f.voiceId,
      language: f.language,
      gender: f.gender,
      description: f.description,
      tags: f.tags.split(',').map(t => t.trim()).filter(Boolean),
      useCase: f.useCase, age: f.age, accent: f.accent,
      _editing: editing,
    });
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <header className={styles.modalHeader}>
          <h3>{editing ? `Edit "${initial.displayName}"` : 'New voice'}</h3>
          <button className={styles.iconBtn} onClick={onClose}>✕</button>
        </header>
        <form onSubmit={submit} className={styles.modalBody}>
          <div className={styles.formGrid}>
            <div className={styles.field}>
              <label>Voice ID</label>
              <input
                className={styles.input}
                value={f.voiceId}
                disabled={editing}
                onChange={e => set('voiceId', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                placeholder="priya-tamil-warm"
              />
            </div>
            <div className={styles.field}>
              <label>Display name</label>
              <input className={styles.input} value={f.displayName} onChange={e => set('displayName', e.target.value)} placeholder="Priya — Warm Tamil" />
            </div>
            <div className={styles.field}>
              <label>Language</label>
              <select className={styles.input} value={f.language} onChange={e => set('language', e.target.value)}>
                {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
              </select>
            </div>
            <div className={styles.field}>
              <label>Gender</label>
              <select className={styles.input} value={f.gender} onChange={e => set('gender', e.target.value)}>
                <option value="female">Female</option><option value="male">Male</option><option value="unknown">Unknown</option>
              </select>
            </div>
            <div className={styles.field}>
              <label>Age</label>
              <select className={styles.input} value={f.age} onChange={e => set('age', e.target.value)}>
                <option value="">—</option><option value="young">Young</option><option value="middle-aged">Middle-aged</option><option value="senior">Senior</option>
              </select>
            </div>
            <div className={styles.field}>
              <label>Accent</label>
              <input className={styles.input} value={f.accent} onChange={e => set('accent', e.target.value)} placeholder="e.g. Chennai, Madurai" />
            </div>
            <div className={styles.fieldFull}>
              <label>Use case</label>
              <select className={styles.input} value={f.useCase} onChange={e => set('useCase', e.target.value)}>
                <option value="">—</option><option value="general">General</option><option value="collections">Collections</option>
                <option value="support">Customer support</option><option value="sales">Sales</option>
                <option value="reminder">Reminders</option><option value="survey">Surveys</option><option value="announcement">Announcements</option>
              </select>
            </div>
            <div className={styles.fieldFull}>
              <label>Voice description (the style prompt)</label>
              <textarea className={styles.input} rows={4} value={f.description} onChange={e => set('description', e.target.value)} />
              <div className={styles.hint}>Edit anytime to retune pace, tone, gender, pitch — no re-recording needed.</div>
            </div>
            <div className={styles.fieldFull}>
              <label>Tags</label>
              <input className={styles.input} value={f.tags} onChange={e => set('tags', e.target.value)} placeholder="warm, professional, collections" />
              <div className={styles.tagRow}>
                {tagPresets.map(t => (
                  <button key={t} type="button" className={styles.tagPreset}
                          onClick={() => {
                            const cur = f.tags.split(',').map(s => s.trim()).filter(Boolean);
                            if (cur.includes(t)) return;
                            set('tags', [...cur, t].join(', '));
                          }}>+ {t}</button>
                ))}
              </div>
            </div>
          </div>
        </form>
        <footer className={styles.modalFooter}>
          {editing && <button className={styles.secondaryBtn} onClick={() => onPreview(f.description)}>▶ Preview current</button>}
          <div style={{ flex: 1 }} />
          <button className={styles.linkBtn} onClick={onClose}>Cancel</button>
          <button className={styles.primaryBtn} onClick={submit}>{editing ? 'Save changes' : 'Create voice'}</button>
        </footer>
      </div>
    </div>
  );
}

function b64ToBlob(b64, mime) {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}
