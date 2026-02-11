/**
 * Estado por cliente (em memória).
 * Campos: phone, current_filter, current_page, last_vehicle_id, stage.
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

const store = new Map();

function key(phone) {
  return String(phone).replace(/\D/g, '');
}

function get(phone) {
  const k = key(phone);
  if (!store.has(k)) {
    store.set(k, {
      phone: k,
      current_filter: null,
      current_page: 1,
      last_vehicle_id: null,
      stage: stages.MENU,
      list_ids: [], // ids da lista atual para "Ver carro 1" -> list_ids[0]
    });
  }
  return store.get(k);
}

function set(phone, data) {
  const k = key(phone);
  const current = get(phone);
  store.set(k, { ...current, ...data });
  return get(phone);
}

function reset(phone) {
  store.delete(key(phone));
  return get(phone);
}

module.exports = {
  stages,
  get,
  set,
  reset,
};
