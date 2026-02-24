/**
 * webhook-rules.js
 * Funções reutilizáveis para deduplicação, detecção de outgoing, grupos/status e normalização.
 *
 * Importante: essas funções são desenhadas para uso em projetos CommonJS (Node.js).
 * Ajuste conforme necessário para seu fluxo (enqueue, logging, storage externo).
 */
const IGNORE_NUMBERS = (process.env.IGNORE_NUMBERS || '')
  .split(',')
  .map(p => String(p || '').replace(/\D/g, ''))
  .filter(Boolean);

const DUP_TTL_MS = Number(process.env.DEDUPE_TTL_MS) || 30000;
const recentMsgIds = new Map();

function extractMessageId(body) {
  if (!body || typeof body !== 'object') return null;
  const candidates = [
    body?.key?.id,
    body?.message?.id,
    body?.message?.messageId,
    body?.message?.msgId,
    body?.data?.id,
    body?.data?.messageId,
    body?.id,
    body?.messageId,
  ];
  for (const c of candidates) {
    if (!c) continue;
    const s = String(c).trim();
    if (s) return s;
  }
  return null;
}

function normalizeNumber(v) {
  if (!v && v !== 0) return null;
  try {
    return String(v).replace(/@.*$/, '').replace(/\D/g, '') || null;
  } catch (_) {
    return null;
  }
}

function isOutgoingMessage(body) {
  try {
    const msg = body?.message ?? body;
    if (!msg || typeof msg !== 'object') return false;
    if (msg.fromMe === true) return true;
    if (msg?.key?.fromMe === true) return true;
    if (body?.fromMe === true) return true;
    if (body?.self === 'outgoing' || String(body?.self).toLowerCase() === 'outgoing') return true;
    if (msg?.direction && String(msg.direction).toLowerCase() === 'outgoing') return true;
    if (msg?.status && String(msg.status).toLowerCase() === 'sent') return true;

    // check ignore numbers
    const candidates = [
      body?.from,
      body?.sender,
      body?.remoteJid,
      msg?.author,
      msg?.key?.participant,
      body?.chat?.remoteJid,
    ];
    for (const c of candidates) {
      const n = normalizeNumber(c);
      if (!n) continue;
      if (IGNORE_NUMBERS.includes(n)) return true;
    }
  } catch (_) {}
  return false;
}

function isGroupOrStatus(body) {
  try {
    const remotes = [body?.remoteJid, body?.chat?.remoteJid, body?.data?.remoteJid].filter(Boolean);
    for (const r of remotes) {
      if (typeof r !== 'string') continue;
      const v = r.toLowerCase();
      if (v.endsWith('@g.us') || v.includes('status@broadcast') || v.endsWith('@broadcast')) return true;
    }
    if (body?.chat?.isGroup === true || body?.isGroup === true) return true;
    if (typeof body?.type === 'string' && body.type.toLowerCase().includes('status')) return true;
  } catch (_) {}
  return false;
}

function isDuplicate(body, parsedPhone = '', parsedText = '') {
  const now = Date.now();
  const mid = extractMessageId(body);
  if (mid) {
    const prev = recentMsgIds.get(mid);
    if (prev && now - prev < DUP_TTL_MS) return true;
    recentMsgIds.set(mid, now);
    return false;
  }
  const sig = `sig:${String(parsedPhone||'')}|${String(parsedText||'').slice(0,200)}|${Math.floor(now/5000)}`;
  const prev = recentMsgIds.get(sig);
  if (prev && now - prev < DUP_TTL_MS) return true;
  recentMsgIds.set(sig, now);
  // cleanup
  for (const [k, ts] of recentMsgIds) {
    if (now - ts > DUP_TTL_MS * 5) recentMsgIds.delete(k);
  }
  return false;
}

module.exports = {
  extractMessageId,
  normalizeNumber,
  isOutgoingMessage,
  isGroupOrStatus,
  isDuplicate,
  DUP_TTL_MS,
  IGNORE_NUMBERS,
};

