/**
 * Registro simples de mensagens enviadas pelo bot (ids retornados pela API).
 * Usado para identificar webhooks que sejam eco das nossas próprias mensagens.
 * TTL configurável via env SENT_MSG_TTL_MS (default 5min).
 */
const SENT_MAP = new Map();
const TTL = Number(process.env.SENT_MSG_TTL_MS) || (5 * 60 * 1000);

function add(id) {
  if (!id) return;
  try {
    const now = Date.now();
    SENT_MAP.set(String(id), now);
    // cleanup agendado simples
    setTimeout(() => {
      const ts = SENT_MAP.get(String(id));
      if (!ts) return;
      if (Date.now() - ts >= TTL) SENT_MAP.delete(String(id));
    }, TTL + 1000);
  } catch (_) {}
}

function has(id) {
  if (!id) return false;
  try {
    const ts = SENT_MAP.get(String(id));
    if (!ts) return false;
    if (Date.now() - ts >= TTL) {
      SENT_MAP.delete(String(id));
      return false;
    }
    return true;
  } catch (_) {
    return false;
  }
}

module.exports = { add, has };

