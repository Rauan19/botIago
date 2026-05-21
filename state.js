/**
 * Estado por cliente (em memória).
 * Campos: phone, current_filter, current_page, last_vehicle_id, stage, lastActivityAt.
 * Escalável: depois pode ser trocado por Redis/DB.
 */

const stages = {
  MENU: 'menu',
  FILTER: 'filter',
  LIST: 'list',
  VEHICLE_DETAIL: 'vehicle_detail',
  FINANCING: 'financing',
  TRADE: 'trade',
  ADDRESS: 'address',
  TRANSFER: 'transfer',
};

/** Sem atividade: reinicia fluxo (padrão 4h) */
const SESSION_IDLE_MS = Number(process.env.SESSION_IDLE_MS) || (4 * 60 * 60 * 1000);
/** Após transferir para humano: bot fica quieto (padrão 24h) */
const TRANSFER_SILENCE_MS = Number(process.env.TRANSFER_SILENCE_MS) || (24 * 60 * 60 * 1000);
/** Remove entradas antigas do Map (padrão 7 dias) */
const STATE_MAX_AGE_MS = Number(process.env.STATE_MAX_AGE_MS) || (7 * 24 * 60 * 60 * 1000);

const store = new Map();

function key(phone) {
  return String(phone).replace(/\D/g, '');
}

function defaultState(k) {
  const now = Date.now();
  return {
    phone: k,
    current_filter: null,
    current_page: 1,
    last_vehicle_id: null,
    stage: stages.MENU,
    list_ids: [],
    lastActivityAt: now,
    createdAt: now,
    transferredAt: null,
  };
}

function get(phone) {
  const k = key(phone);
  if (!store.has(k)) {
    store.set(k, defaultState(k));
  }
  return store.get(k);
}

function set(phone, data) {
  const k = key(phone);
  const current = get(phone);
  store.set(k, {
    ...current,
    ...data,
    lastActivityAt: Date.now(),
  });
  return get(phone);
}

function touch(phone) {
  const k = key(phone);
  const current = get(phone);
  store.set(k, { ...current, lastActivityAt: Date.now() });
  return get(phone);
}

function reset(phone) {
  store.delete(key(phone));
  return get(phone);
}

/** Sessão parada há muito tempo → limpa estado antes de responder */
function expireIfNeeded(phone) {
  const k = key(phone);
  if (!store.has(k)) return false;
  const s = store.get(k);
  const last = s.lastActivityAt || s.createdAt || 0;
  if (Date.now() - last > SESSION_IDLE_MS) {
    store.delete(k);
    return true;
  }
  return false;
}

function wantsExplicitRestart(text) {
  const t = (text || '').trim().toLowerCase();
  return (
    t === 'menu' ||
    t === 'iniciar' ||
    t === 'start' ||
    t === 'reiniciar' ||
    t === 'voltar' ||
    t === 'voltar ao menu' ||
    t === 'voltar ao menu principal'
  );
}

/** Cliente já foi para vendedor e ainda está no período de silêncio do bot */
function isHumanHandoffActive(phone) {
  const s = get(phone);
  if (s.stage !== stages.TRANSFER) return false;
  const at = s.transferredAt || s.lastActivityAt || 0;
  return Date.now() - at < TRANSFER_SILENCE_MS;
}

const ACTIVE_FLOW_STAGES = new Set([
  stages.FILTER,
  stages.LIST,
  stages.VEHICLE_DETAIL,
  stages.FINANCING,
  stages.TRADE,
]);

function isActiveFlowStage(stage) {
  return ACTIVE_FLOW_STAGES.has(stage);
}

// Limpeza periódica para não acumular milhares de clientes após dias de uptime
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  for (const [k, s] of store) {
    const last = s.lastActivityAt || s.createdAt || 0;
    if (now - last > STATE_MAX_AGE_MS) store.delete(k);
  }
}, CLEANUP_INTERVAL_MS).unref?.();

module.exports = {
  stages,
  SESSION_IDLE_MS,
  TRANSFER_SILENCE_MS,
  get,
  set,
  reset,
  touch,
  expireIfNeeded,
  wantsExplicitRestart,
  isHumanHandoffActive,
  isActiveFlowStage,
};
