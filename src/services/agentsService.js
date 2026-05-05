/**
 * Agents service — multi-persona AI agents for KuralAI.
 *
 * Each agent is a self-contained voice persona: name, avatar, voice, greeting,
 * system prompt, language, model, conversation mode (freeform/guided), engine
 * (local/sarvam/elevenlabs/kuralai), tags. Agents are stored in a single JSON
 * file (no migrations needed) and selected per-call via callMeta.agentId.
 *
 * When a call is initiated with an agentId, src/services/localStream.js (and
 * any other engine) loads the agent and overrides voice / system prompt /
 * greeting / language / model / conversation mode for that call.
 */
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const FILE = path.join(DATA_DIR, 'agents.json');

let cache = null;

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function read() {
  if (cache) return cache;
  try {
    if (fs.existsSync(FILE)) {
      cache = JSON.parse(fs.readFileSync(FILE, 'utf-8'));
      if (!Array.isArray(cache)) cache = [];
    } else {
      cache = seedDefaults();
      write(cache);
    }
  } catch (e) {
    logger.warn(`[agents] read failed: ${e.message}`);
    cache = [];
  }
  return cache;
}

function write(arr) {
  ensureDir();
  // Atomic write — write to a sibling temp file then rename, so a crash
  // mid-write never leaves a half-written agents.json on disk. Two concurrent
  // PATCHes can still race the read-modify-write cycle (acceptable for a
  // low-volume admin CRUD), but neither will ever produce corrupt JSON.
  const tmp = `${FILE}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(arr, null, 2));
  fs.renameSync(tmp, FILE);
  cache = arr;
}

function seedDefaults() {
  const now = new Date().toISOString();
  return [
    {
      id: 'agent_samuthra',
      name: 'Samuthra',
      description: 'Default warm, professional Tamil female voice agent. Free-form conversations.',
      avatar: '🎙️',
      voice: 'samuthra-female-tamil',
      voiceDescription: 'A warm, professional female speaker delivers her words clearly and naturally in Tamil with a friendly, conversational tone, moderate pace, and very high studio audio quality with no background noise.',
      language: 'ta-IN',
      greeting: 'வணக்கம், நான் சமுத்ரா. உங்களுக்கு எப்படி உதவலாம்?',
      systemPrompt: 'நீங்கள் ஒரு இயல்பான, உதவிகரமான, மனிதர் போன்ற தமிழ் AI உரையாடல் முகவர். பயனருடன் வெளிப்படையாக, இயற்கையாக, ஓட்டமாக உரையாடுங்கள். பதில்கள் சுருக்கமாக, உரையாடல் தொனியில் இருக்கட்டும்.',
      engine: 'local',
      llmModel: 'qwen2.5:7b-instruct',
      temperature: 0.6,
      maxTokens: 256,
      conversationMode: 'freeform',
      tags: ['tamil', 'female', 'warm', 'general'],
      isDefault: true,
      createdAt: now,
      updatedAt: now,
    },
  ];
}

function list() { return [...read()]; }
function get(id) { return read().find(a => a.id === id) || null; }
function getDefault() { return read().find(a => a.isDefault) || read()[0] || null; }

function create(input) {
  const all = read();
  const id = (input.id || `agent_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`).toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
  if (all.find(a => a.id === id)) throw new Error('agent id already exists');
  const now = new Date().toISOString();
  const item = {
    id,
    name: input.name || 'Untitled Agent',
    description: input.description || '',
    avatar: input.avatar || '🤖',
    voice: input.voice || '',
    voiceDescription: input.voiceDescription || '',
    language: input.language || 'ta-IN',
    greeting: input.greeting || '',
    systemPrompt: input.systemPrompt || '',
    engine: input.engine || 'local',
    llmModel: input.llmModel || 'qwen2.5:7b-instruct',
    temperature: typeof input.temperature === 'number' ? input.temperature : 0.6,
    maxTokens: typeof input.maxTokens === 'number' ? input.maxTokens : 256,
    conversationMode: input.conversationMode || 'freeform',
    tags: Array.isArray(input.tags) ? input.tags : [],
    isDefault: !!input.isDefault,
    createdAt: now,
    updatedAt: now,
  };
  if (item.isDefault) all.forEach(a => a.isDefault = false);
  all.push(item);
  write(all);
  return item;
}

function update(id, patch) {
  const all = read();
  const i = all.findIndex(a => a.id === id);
  if (i === -1) throw new Error('agent not found');
  const updated = { ...all[i], ...patch, id: all[i].id, updatedAt: new Date().toISOString() };
  if (patch.isDefault) all.forEach(a => a.isDefault = false);
  all[i] = updated;
  write(all);
  return updated;
}

function remove(id) {
  const all = read();
  const next = all.filter(a => a.id !== id);
  if (next.length === all.length) return false;
  write(next);
  return true;
}

function clearCache() { cache = null; }

module.exports = { list, get, getDefault, create, update, remove, clearCache };
