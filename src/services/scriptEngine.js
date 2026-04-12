/**
 * Script Engine — Predefined Q&A Flow for Tamil AI Calls
 *
 * How it works:
 *   1. Each workflow can have a `scriptFlow` with ordered steps.
 *   2. Each step has an agent message and branches (expected customer responses).
 *   3. When the customer speaks, GPT-4o classifies their response against the branches.
 *   4. The matched branch's response is played and the flow moves to the next step.
 *   5. Handles "slight differences" via semantic classification — not just keyword matching.
 *
 * Data structure:
 *   scriptFlow: {
 *     enabled: true,
 *     startStep: "step_1",
 *     steps: [
 *       {
 *         id: "step_1",
 *         agentMessage: "மாப்ளா, order number சொல்லுங்க",
 *         branches: [
 *           {
 *             id: "b1",
 *             label: "Customer provides order number",
 *             expectedPhrases: ["ORD", "number", "எண்"],
 *             agentResponse: "ஒரு நிமிஷம் மாப்ளா, check பண்றேன்",
 *             nextStep: "step_2"
 *           }
 *         ],
 *         fallbackMessage: "மறுபடியும் சொல்லுங்களா மாப்ளா?",
 *         maxRetries: 2
 *       }
 *     ]
 *   }
 */

const OpenAI = require('openai');
const logger = require('../utils/logger');

let _openai = null;
function getOpenAI() {
  if (!_openai) {
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || 'placeholder' });
  }
  return _openai;
}

// In-memory state: tracks current step + retry count per active call
const callStates = new Map();

/**
 * Start the script flow for a call.
 * Returns the first step's agent message.
 */
function startFlow(callId, scriptFlow) {
  const firstStep = getStep(scriptFlow, scriptFlow.startStep);
  if (!firstStep) throw new Error(`Script flow has no startStep: ${scriptFlow.startStep}`);

  callStates.set(callId, {
    currentStepId: firstStep.id,
    retryCount: 0,
    collectedData: {},
  });

  logger.info(`[ScriptEngine] Call ${callId} started at step: ${firstStep.id}`);
  return firstStep.agentMessage;
}

/**
 * Process customer speech against the current step.
 * Returns { response, nextStepMessage, done, escalate }
 */
async function processStep(callId, customerText, scriptFlow) {
  const state = callStates.get(callId);
  if (!state) {
    logger.warn(`[ScriptEngine] No state for call ${callId}, restarting flow`);
    return { response: scriptFlow.steps[0]?.agentMessage || '', done: false, escalate: false };
  }

  const currentStep = getStep(scriptFlow, state.currentStepId);
  if (!currentStep) {
    logger.warn(`[ScriptEngine] Step ${state.currentStepId} not found`);
    return { response: '', done: true, escalate: false };
  }

  // Classify the customer's response against the branches
  const match = await matchBranch(customerText, currentStep);

  if (!match.matched) {
    // No branch matched — retry with fallback
    state.retryCount += 1;
    const maxRetries = currentStep.maxRetries ?? 2;

    if (state.retryCount >= maxRetries) {
      logger.info(`[ScriptEngine] Max retries for step ${currentStep.id} — escalating`);
      clearFlow(callId);
      return { response: currentStep.fallbackMessage || 'மன்னிக்கணும் மாப்ளா, புரியல.', done: false, escalate: true };
    }

    logger.info(`[ScriptEngine] No match for step ${currentStep.id}, retry ${state.retryCount}/${maxRetries}`);
    return {
      response: currentStep.fallbackMessage || 'மறுபடியும் சொல்லுங்களா மாப்ளா?',
      done: false,
      escalate: false,
    };
  }

  // Branch matched
  const branch = match.branch;
  state.retryCount = 0;

  // Collect any data the branch extracts
  if (branch.collectAs) {
    state.collectedData[branch.collectAs] = customerText;
  }

  // Check if this branch ends the call or escalates
  if (branch.action === 'end_call') {
    clearFlow(callId);
    return { response: branch.agentResponse || '', done: true, escalate: false };
  }

  if (branch.action === 'escalate') {
    clearFlow(callId);
    return { response: branch.agentResponse || '', done: false, escalate: true };
  }

  // Move to next step
  const nextStep = branch.nextStep ? getStep(scriptFlow, branch.nextStep) : null;

  if (!nextStep) {
    // No next step — end the flow
    clearFlow(callId);
    return { response: branch.agentResponse || '', done: true, escalate: false };
  }

  state.currentStepId = nextStep.id;
  logger.info(`[ScriptEngine] Call ${callId} moved to step: ${nextStep.id}`);

  // Combine branch response + next step's question (with natural pause)
  const combined = [branch.agentResponse, nextStep.agentMessage]
    .filter(Boolean)
    .join('… ');

  return { response: combined, done: false, escalate: false };
}

/**
 * Use GPT-4o to semantically classify the customer's speech against branches.
 * Handles "slight differences" — paraphrases, dialect variations, etc.
 */
async function matchBranch(customerText, step) {
  const { branches } = step;
  if (!branches || branches.length === 0) return { matched: false };

  // Fast keyword pre-check (avoids GPT call for obvious matches)
  const keywordMatch = branches.find(b => {
    if (!b.expectedPhrases?.length) return false;
    const lower = customerText.toLowerCase();
    return b.expectedPhrases.some(p => lower.includes(p.toLowerCase()));
  });

  if (keywordMatch) {
    logger.info(`[ScriptEngine] Keyword match → branch: ${keywordMatch.label}`);
    return { matched: true, branch: keywordMatch };
  }

  // Semantic classification via GPT-4o
  try {
    const branchList = branches
      .map((b, i) => `${i + 1}. ${b.label}${b.expectedPhrases?.length ? ` [clues: ${b.expectedPhrases.join(', ')}]` : ''}`)
      .join('\n');

    const completion = await getOpenAI().chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'You classify Tamil/English customer speech into predefined categories. Reply with ONLY the number of the best matching category, or 0 if none match.',
        },
        {
          role: 'user',
          content: `Customer said: "${customerText}"\n\nCategories:\n${branchList}\n${branches.length + 1}. None of the above\n\nReply with only the number:`,
        },
      ],
      temperature: 0,
      max_tokens: 5,
    });

    const raw = completion.choices[0].message.content.trim();
    const choice = parseInt(raw, 10);

    if (choice >= 1 && choice <= branches.length) {
      logger.info(`[ScriptEngine] GPT matched branch ${choice}: ${branches[choice - 1].label}`);
      return { matched: true, branch: branches[choice - 1] };
    }

    logger.info(`[ScriptEngine] GPT: no match (replied ${raw})`);
    return { matched: false };

  } catch (err) {
    logger.error(`[ScriptEngine] GPT classification error: ${err.message}`);
    return { matched: false };
  }
}

/**
 * Get a step by ID from the flow.
 */
function getStep(scriptFlow, stepId) {
  return scriptFlow.steps?.find(s => s.id === stepId) || null;
}

/**
 * Get the current step message for a call (for greeting replay, etc.)
 */
function getCurrentStepMessage(callId, scriptFlow) {
  const state = callStates.get(callId);
  if (!state) return null;
  const step = getStep(scriptFlow, state.currentStepId);
  return step?.agentMessage || null;
}

/**
 * Get collected data for the call (order numbers, phone numbers, etc.)
 */
function getCollectedData(callId) {
  return callStates.get(callId)?.collectedData || {};
}

/**
 * Clear flow state when call ends.
 */
function clearFlow(callId) {
  callStates.delete(callId);
}

/**
 * Check if a call is currently running a script flow.
 */
function hasActiveFlow(callId) {
  return callStates.has(callId);
}

module.exports = {
  startFlow,
  processStep,
  clearFlow,
  hasActiveFlow,
  getCurrentStepMessage,
  getCollectedData,
};
