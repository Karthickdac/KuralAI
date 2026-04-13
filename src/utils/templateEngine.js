/**
 * Template Engine
 * Simple {{variable}} replacement used throughout Q&A, greetings, and scripts.
 * Formats numbers in Indian style (5,00,000 not 500,000).
 */

/**
 * Format an integer in Indian numbering: 500000 → 5,00,000
 */
function toIndianFormat(num) {
  const n = parseInt(num, 10);
  if (isNaN(n)) return String(num);
  const s = n.toString();
  if (s.length <= 3) return s;
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3);
  return rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3;
}

/**
 * Replace all {{key}} placeholders in text using vars object.
 * Unknown placeholders are left unchanged.
 */
function applyTemplate(text, vars) {
  if (!text || !vars || typeof vars !== 'object') return text;
  return text.replace(/\{\{(\w+)\}\}/g, (match, key) =>
    vars[key] !== undefined ? String(vars[key]) : match
  );
}

module.exports = { toIndianFormat, applyTemplate };
