import React, { useState, useEffect, useCallback } from 'react';
import Sidebar from '../components/Sidebar';
import { templatesApi } from '../api/client';
import styles from './Templates.module.css';

const AVAILABLE_VARS = [
  '{{customerName}}', '{{chitValue}}', '{{dueAmount}}', '{{currentDue}}',
  '{{completedDues}}', '{{pendingDues}}', '{{totalDues}}', '{{nextDueDate}}',
  '{{withdrawalAmount}}', '{{otherChitDues}}', '{{chitGroup}}',
  '{{familyJamin}}', '{{otherJamin}}', '{{chequeLeaf}}',
];

const ACTION_COLORS = {
  continue:  '#2563eb',
  end_call:  '#dc2626',
  escalate:  '#d97706',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function arrayToText(arr) {
  return (arr || []).join('\n');
}

function textToArray(text) {
  return text.split('\n').map(s => s.trim()).filter(Boolean);
}

// ─── QA Form Modal ────────────────────────────────────────────────────────────

function QaModal({ item, onSave, onClose }) {
  const [form, setForm] = useState({
    intent:        item?.intent        || '',
    label:         item?.label         || '',
    minScore:      item?.minScore      ?? 1,
    action:        item?.action        || 'continue',
    sortOrder:     item?.sortOrder     ?? 0,
    isActive:      item?.isActive      ?? true,
    phraseKeywords: arrayToText(item?.phraseKeywords),
    tokenKeywords:  arrayToText(item?.tokenKeywords),
    responses:      arrayToText(item?.responses),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function handleSave() {
    if (!form.intent.trim() || !form.label.trim()) {
      setError('Intent name and label are required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = {
        intent:        form.intent.trim(),
        label:         form.label.trim(),
        minScore:      Number(form.minScore),
        action:        form.action,
        sortOrder:     Number(form.sortOrder),
        isActive:      form.isActive,
        phraseKeywords: textToArray(form.phraseKeywords),
        tokenKeywords:  textToArray(form.tokenKeywords),
        responses:      textToArray(form.responses),
      };
      await onSave(payload);
    } catch (e) {
      setError(e?.response?.data?.error || e.message);
      setSaving(false);
    }
  }

  function insertVar(v) {
    setForm(f => ({ ...f, responses: f.responses ? f.responses + '\n' + v : v }));
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h3>{item ? 'Q&A Template திருத்தம்' : 'புதிய Q&A Template'}</h3>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        {error && <div className={styles.errorBanner}>{error}</div>}

        <div className={styles.modalBody}>
          <div className={styles.row2}>
            <label className={styles.field}>
              <span>Intent Name <em>(unique key)</em></span>
              <input value={form.intent} onChange={e => set('intent', e.target.value)}
                placeholder="e.g. seat_due_status" className={styles.input} />
            </label>
            <label className={styles.field}>
              <span>Label <em>(dashboard display)</em></span>
              <input value={form.label} onChange={e => set('label', e.target.value)}
                placeholder="e.g. இன்னொரு சீட் — எத்தனாவது due?" className={styles.input} />
            </label>
          </div>

          <div className={styles.row3}>
            <label className={styles.field}>
              <span>Action</span>
              <select value={form.action} onChange={e => set('action', e.target.value)} className={styles.input}>
                <option value="continue">continue</option>
                <option value="end_call">end_call</option>
                <option value="escalate">escalate</option>
              </select>
            </label>
            <label className={styles.field}>
              <span>Min Score</span>
              <input type="number" min="1" max="20" value={form.minScore}
                onChange={e => set('minScore', e.target.value)} className={styles.input} />
            </label>
            <label className={styles.field}>
              <span>Sort Order</span>
              <input type="number" min="0" value={form.sortOrder}
                onChange={e => set('sortOrder', e.target.value)} className={styles.input} />
            </label>
          </div>

          <label className={styles.field}>
            <span>Phrase Keywords <em>(+3 pts each — one per line)</em></span>
            <textarea value={form.phraseKeywords}
              onChange={e => set('phraseKeywords', e.target.value)}
              className={styles.textarea} rows={6}
              placeholder="இன்னொரு சீட்&#10;மத்த சீட்&#10;எத்தனாவது due" />
          </label>

          <label className={styles.field}>
            <span>Token Keywords <em>(+1 pt each — one per line)</em></span>
            <textarea value={form.tokenKeywords}
              onChange={e => set('tokenKeywords', e.target.value)}
              className={styles.textarea} rows={3}
              placeholder="எத்தனாவது&#10;எத்தன" />
          </label>

          <div className={styles.field}>
            <div className={styles.responsesHeader}>
              <span>Responses <em>{`(one per line — random pick. Use {{var}} for dynamic values)`}</em></span>
            </div>
            <div className={styles.varChips}>
              {AVAILABLE_VARS.map(v => (
                <button key={v} className={styles.varChip} onClick={() => insertVar(v)} type="button">
                  {v}
                </button>
              ))}
            </div>
            <textarea value={form.responses}
              onChange={e => set('responses', e.target.value)}
              className={styles.textarea} rows={5}
              placeholder={`{{otherChitDues}}வது due சார்.\nஅந்த சீட்ல {{otherChitDues}}வது due சார்.`} />
          </div>

          <label className={styles.checkField}>
            <input type="checkbox" checked={form.isActive}
              onChange={e => set('isActive', e.target.checked)} />
            <span>Active</span>
          </label>
        </div>

        <div className={styles.modalFooter}>
          <button className={styles.cancelBtn} onClick={onClose} disabled={saving}>Cancel</button>
          <button className={styles.saveBtn} onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save Template'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Prompt Form Modal ────────────────────────────────────────────────────────

function PromptModal({ item, onSave, onClose }) {
  const [form, setForm] = useState({
    key:         item?.key         || '',
    label:       item?.label       || '',
    text:        item?.text        || '',
    description: item?.description || '',
    isActive:    item?.isActive    ?? true,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function handleSave() {
    if (!form.key.trim() || !form.label.trim() || !form.text.trim()) {
      setError('Key, label and text are required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onSave({ ...form, key: form.key.trim(), label: form.label.trim() });
    } catch (e) {
      setError(e?.response?.data?.error || e.message);
      setSaving(false);
    }
  }

  function insertVar(v) {
    setForm(f => ({ ...f, text: f.text + v }));
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h3>{item ? 'System Prompt திருத்தம்' : 'புதிய System Prompt'}</h3>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        {error && <div className={styles.errorBanner}>{error}</div>}

        <div className={styles.modalBody}>
          <div className={styles.row2}>
            <label className={styles.field}>
              <span>Key <em>(unique identifier)</em></span>
              <input value={form.key} onChange={e => set('key', e.target.value)}
                placeholder="e.g. GREETING" className={styles.input}
                readOnly={!!item} style={item ? { opacity: 0.6, cursor: 'not-allowed' } : {}} />
            </label>
            <label className={styles.field}>
              <span>Label</span>
              <input value={form.label} onChange={e => set('label', e.target.value)}
                placeholder="e.g. Greeting — call திறக்கும்போது" className={styles.input} />
            </label>
          </div>

          <label className={styles.field}>
            <span>Description <em>(optional usage notes)</em></span>
            <input value={form.description} onChange={e => set('description', e.target.value)}
              placeholder="எப்போது இந்த prompt use ஆகும்?" className={styles.input} />
          </label>

          <div className={styles.field}>
            <div className={styles.responsesHeader}>
              <span>Prompt Text <em>{`(use {{var}} for dynamic values)`}</em></span>
            </div>
            <div className={styles.varChips}>
              {AVAILABLE_VARS.map(v => (
                <button key={v} className={styles.varChip} onClick={() => insertVar(v)} type="button">
                  {v}
                </button>
              ))}
            </div>
            <textarea value={form.text}
              onChange={e => set('text', e.target.value)}
              className={styles.textarea} rows={5}
              placeholder="வணக்கம் சார்! நான் மகாலக்ஷ்மி பேசுறேன் சார்..." />
          </div>

          <label className={styles.checkField}>
            <input type="checkbox" checked={form.isActive}
              onChange={e => set('isActive', e.target.checked)} />
            <span>Active</span>
          </label>
        </div>

        <div className={styles.modalFooter}>
          <button className={styles.cancelBtn} onClick={onClose} disabled={saving}>Cancel</button>
          <button className={styles.saveBtn} onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save Prompt'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Templates() {
  const [tab, setTab]           = useState('qa');
  const [qaList, setQaList]     = useState([]);
  const [prompts, setPrompts]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [modal, setModal]       = useState(null);   // null | { type:'qa'|'prompt', item?:obj }
  const [expanded, setExpanded] = useState(null);   // id of expanded row
  const [toast, setToast]       = useState('');

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2500); };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [qa, pr] = await Promise.all([templatesApi.listQa(), templatesApi.listPrompts()]);
      setQaList(qa.data);
      setPrompts(pr.data);
    } catch { }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── QA handlers ──
  async function handleSaveQa(payload) {
    if (modal.item) {
      await templatesApi.updateQa(modal.item.id, payload);
      showToast('Q&A template updated!');
    } else {
      await templatesApi.createQa(payload);
      showToast('Q&A template created!');
    }
    setModal(null);
    load();
  }

  async function handleDeleteQa(id) {
    if (!window.confirm('இந்த Q&A template delete பண்ணணுமா?')) return;
    await templatesApi.deleteQa(id);
    showToast('Deleted.');
    load();
  }

  async function handleToggleQa(item) {
    await templatesApi.updateQa(item.id, { ...item, isActive: !item.isActive });
    showToast(item.isActive ? 'Disabled.' : 'Enabled.');
    load();
  }

  // ── Prompt handlers ──
  async function handleSavePrompt(payload) {
    if (modal.item) {
      await templatesApi.updatePrompt(modal.item.id, payload);
      showToast('Prompt updated!');
    } else {
      await templatesApi.createPrompt(payload);
      showToast('Prompt created!');
    }
    setModal(null);
    load();
  }

  async function handleDeletePrompt(id) {
    if (!window.confirm('இந்த prompt delete பண்ணணுமா?')) return;
    await templatesApi.deletePrompt(id);
    showToast('Deleted.');
    load();
  }

  return (
    <div className={styles.layout}>
      <Sidebar />
      <main className={styles.main}>
      <div className={styles.page}>
        {/* Toast */}
        {toast && <div className={styles.toast}>{toast}</div>}

        {/* Header */}
        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>Templates & Q&A</h1>
            <p className={styles.sub}>AI responses-ஐ DB-ல store பண்ணி dashboard-ல edit பண்ணலாம்</p>
          </div>
          <button
            className={styles.addBtn}
            onClick={() => setModal({ type: tab === 'qa' ? 'qa' : 'prompt', item: null })}
          >
            + {tab === 'qa' ? 'New Q&A Pair' : 'New System Prompt'}
          </button>
        </div>

        {/* Tabs */}
        <div className={styles.tabs}>
          <button className={`${styles.tab} ${tab === 'qa'      ? styles.activeTab : ''}`} onClick={() => setTab('qa')}>
            Q&A Templates <span className={styles.badge}>{qaList.length}</span>
          </button>
          <button className={`${styles.tab} ${tab === 'prompts' ? styles.activeTab : ''}`} onClick={() => setTab('prompts')}>
            System Prompts <span className={styles.badge}>{prompts.length}</span>
          </button>
        </div>

        {/* Content */}
        {loading ? (
          <div className={styles.loading}>Loading…</div>
        ) : tab === 'qa' ? (
          <QaList
            items={qaList}
            expanded={expanded}
            setExpanded={setExpanded}
            onEdit={(item) => setModal({ type: 'qa', item })}
            onDelete={handleDeleteQa}
            onToggle={handleToggleQa}
          />
        ) : (
          <PromptList
            items={prompts}
            expanded={expanded}
            setExpanded={setExpanded}
            onEdit={(item) => setModal({ type: 'prompt', item })}
            onDelete={handleDeletePrompt}
          />
        )}
      </div>
      </main>

      {/* Modals */}
      {modal?.type === 'qa' && (
        <QaModal item={modal.item} onSave={handleSaveQa} onClose={() => setModal(null)} />
      )}
      {modal?.type === 'prompt' && (
        <PromptModal item={modal.item} onSave={handleSavePrompt} onClose={() => setModal(null)} />
      )}
    </div>
  );
}

// ─── QA List ──────────────────────────────────────────────────────────────────

function QaList({ items, expanded, setExpanded, onEdit, onDelete, onToggle }) {
  if (!items.length) return <div className={styles.empty}>No Q&A templates yet.</div>;
  return (
    <div className={styles.list}>
      {items.map((qa) => {
        const open = expanded === qa.id;
        return (
          <div key={qa.id} className={`${styles.card} ${!qa.isActive ? styles.inactive : ''}`}>
            <div className={styles.cardHead} onClick={() => setExpanded(open ? null : qa.id)}>
              <div className={styles.cardLeft}>
                <span className={styles.sortBadge}>#{qa.sortOrder}</span>
                <div>
                  <div className={styles.cardTitle}>{qa.label}</div>
                  <div className={styles.cardMeta}>
                    <code className={styles.intentCode}>{qa.intent}</code>
                    <span className={styles.actionBadge} style={{ background: ACTION_COLORS[qa.action] }}>
                      {qa.action}
                    </span>
                    <span className={styles.metaItem}>min score: {qa.minScore}</span>
                    <span className={styles.metaItem}>{(qa.phraseKeywords||[]).length} phrase keywords</span>
                    <span className={styles.metaItem}>{(qa.responses||[]).length} responses</span>
                  </div>
                </div>
              </div>
              <div className={styles.cardActions} onClick={e => e.stopPropagation()}>
                <button className={styles.toggleBtn} onClick={() => onToggle(qa)}
                  title={qa.isActive ? 'Disable' : 'Enable'}>
                  {qa.isActive ? '●' : '○'}
                </button>
                <button className={styles.editBtn} onClick={() => onEdit(qa)}>Edit</button>
                <button className={styles.delBtn} onClick={() => onDelete(qa.id)}>Delete</button>
                <span className={styles.chevron}>{open ? '▲' : '▼'}</span>
              </div>
            </div>

            {open && (
              <div className={styles.cardBody}>
                <Section title="Phrase Keywords (+3 pts each)">
                  <div className={styles.kwGrid}>
                    {(qa.phraseKeywords || []).map((kw, i) => (
                      <span key={i} className={styles.kwChip}>{kw}</span>
                    ))}
                  </div>
                </Section>
                {(qa.tokenKeywords || []).length > 0 && (
                  <Section title="Token Keywords (+1 pt each)">
                    <div className={styles.kwGrid}>
                      {(qa.tokenKeywords || []).map((kw, i) => (
                        <span key={i} className={`${styles.kwChip} ${styles.kwToken}`}>{kw}</span>
                      ))}
                    </div>
                  </Section>
                )}
                <Section title="Responses">
                  {(qa.responses || []).map((r, i) => (
                    <div key={i} className={styles.responseRow}>
                      <span className={styles.responseIdx}>{i + 1}</span>
                      <span className={styles.responseText}>{r}</span>
                    </div>
                  ))}
                </Section>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Prompt List ──────────────────────────────────────────────────────────────

function PromptList({ items, expanded, setExpanded, onEdit, onDelete }) {
  if (!items.length) return <div className={styles.empty}>No system prompts yet.</div>;
  return (
    <div className={styles.list}>
      {items.map((p) => {
        const open = expanded === p.id;
        return (
          <div key={p.id} className={`${styles.card} ${!p.isActive ? styles.inactive : ''}`}>
            <div className={styles.cardHead} onClick={() => setExpanded(open ? null : p.id)}>
              <div className={styles.cardLeft}>
                <div>
                  <div className={styles.cardTitle}>{p.label}</div>
                  <div className={styles.cardMeta}>
                    <code className={styles.intentCode}>{p.key}</code>
                    {p.description && <span className={styles.metaItem}>{p.description}</span>}
                  </div>
                </div>
              </div>
              <div className={styles.cardActions} onClick={e => e.stopPropagation()}>
                <button className={styles.editBtn} onClick={() => onEdit(p)}>Edit</button>
                <button className={styles.delBtn} onClick={() => onDelete(p.id)}>Delete</button>
                <span className={styles.chevron}>{open ? '▲' : '▼'}</span>
              </div>
            </div>

            {open && (
              <div className={styles.cardBody}>
                <div className={styles.promptText}>{p.text}</div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className={styles.section}>
      <div className={styles.sectionTitle}>{title}</div>
      {children}
    </div>
  );
}
