/**
 * Workflow Routes — CRUD for call workflows/campaigns
 * Stored in config/workflows.json
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { authenticateToken } = require('../middleware/auth');
const { checkPlanLimit } = require('../middleware/planLimits');

const WORKFLOWS_FILE = path.join(__dirname, '../../config/workflows.json');

function readWorkflows() {
  try {
    if (!fs.existsSync(WORKFLOWS_FILE)) return [];
    return JSON.parse(fs.readFileSync(WORKFLOWS_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function writeWorkflows(data) {
  fs.mkdirSync(path.dirname(WORKFLOWS_FILE), { recursive: true });
  fs.writeFileSync(WORKFLOWS_FILE, JSON.stringify(data, null, 2));
}

router.use(authenticateToken);

router.get('/', (req, res) => {
  res.json({ workflows: readWorkflows() });
});

router.post('/', checkPlanLimit('workflows'), (req, res) => {
  const workflows = readWorkflows();
  const workflow = {
    id: `wf_${Date.now()}`,
    organizationId: req.user?.organizationId || null,
    name: req.body.name || 'Untitled Workflow',
    description: req.body.description || '',
    script: req.body.script || '',
    schedule: req.body.schedule || 'manual',
    scheduleTime: req.body.scheduleTime || '',
    targetCount: req.body.targetCount || 0,
    status: 'draft',
    callsCompleted: 0,
    callsFailed: 0,
    callsTotal: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  workflows.push(workflow);
  writeWorkflows(workflows);
  res.status(201).json({ workflow });
});

router.put('/:id', (req, res) => {
  const workflows = readWorkflows();
  const idx = workflows.findIndex(w => w.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Workflow not found' });
  workflows[idx] = { ...workflows[idx], ...req.body, id: req.params.id, updatedAt: new Date().toISOString() };
  writeWorkflows(workflows);
  res.json({ workflow: workflows[idx] });
});

router.delete('/:id', (req, res) => {
  const workflows = readWorkflows();
  const filtered = workflows.filter(w => w.id !== req.params.id);
  if (filtered.length === workflows.length) return res.status(404).json({ error: 'Workflow not found' });
  writeWorkflows(filtered);
  res.json({ success: true });
});

module.exports = router;
