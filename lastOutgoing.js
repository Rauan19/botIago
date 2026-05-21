/**
 * Gerencia últimos envios feitos pelo bot (em memória).
 * Usado para detectar eco/loop quando o provedor repassa mensagens enviadas pelo próprio bot.
 * Single-instance only — suficiente para uma única instância em produção.
 */
const LAST_MAP = new Map();
const DEFAULT_TTL_MS = Number(process.env.ECHO_TTL_MS) || (30 * 1000);

function setLast(phone, text, ttlMs = DEFAULT_TTL_MS) {
  try {
    const key = String(phone).replace(/\D/g, '');
    const now = Date.now();
    LAST_MAP.set(key, { text: String(text || ''), ts: now, ttl: Number(ttlMs) });
    // schedule cleanup
    setTimeout(() => {
      const cur = LAST_MAP.get(key);
      if (!cur) return;
      if (Date.now() - cur.ts >= cur.ttl) LAST_MAP.delete(key);
    }, ttlMs + 1000);
  } catch (_) {}
}

function getLast(phone) {
  try {
    const key = String(phone).replace(/\D/g, '');
    const v = LAST_MAP.get(key);
    if (!v) return null;
    // check ttl
    if (Date.now() - v.ts > v.ttl) {
      LAST_MAP.delete(key);
      return null;
    }
    return v;
  } catch (_) {
    return null;
  }
}

module.exports = { setLast, getLast };

