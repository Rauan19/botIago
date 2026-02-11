/**
 * Estoque de veículos.
 *
 * Em produção, buscamos da API:
 *   GET https://apiservice.iagoveiculos.com.br/api/estoque
 * e fazemos o filtro/paginação em memória.
 *
 * Cada veículo exposto aqui tem:
 *   id, nome, preco, km, cor, cambio, imagens (até 5 data URLs ou URLs HTTP).
 */

const MAX_VEHICLES_PER_PAGE = 5;
const MAX_IMAGES_PER_VEHICLE = 5;

const FILTERS = {
  ate30: 'ate30',
  ate50: 'ate50',
  ate80: 'ate80',
  automatico: 'automatico',
  economico: 'economico',
  todos: 'todos',
};

const PRICE_RANGES = {
  [FILTERS.ate30]: [0, 30000],
  [FILTERS.ate50]: [0, 50000],
  [FILTERS.ate80]: [0, 80000],
  [FILTERS.todos]: [0, Infinity],
};

// API real de estoque
const API_URL = 'https://apiservice.iagoveiculos.com.br/api/estoque';

// Cache em memória dos veículos vindos da API
let VEICULOS = [];
let lastLoadedAt = 0;
const CACHE_TTL_MS = 60 * 1000; // 1 minuto

function mapItemToVehicle(item) {
  const id = String(item.id);
  const nomeBase = `${item.brand ?? ''} ${item.model ?? ''}`.trim();
  const nome = item.year ? `${nomeBase} ${item.year}` : nomeBase;
  const preco = typeof item.promotionValue === 'number' && item.promotionValue > 0
    ? item.promotionValue
    : (item.value ?? 0);

  // Tipo/câmbio aproximado: se o modelo contém 'aut' consideramos automático
  const isAutomatic = typeof item.model === 'string' && /aut/i.test(item.model);
  const tipo = isAutomatic ? FILTERS.automatico : FILTERS.economico;
  const cambio = isAutomatic ? 'Automático' : 'Manual';

  let imagens = [];
  if (typeof item.photos === 'string' && item.photos.trim()) {
    try {
      const parsed = JSON.parse(item.photos);
      if (Array.isArray(parsed)) {
        imagens = parsed.filter((p) => typeof p === 'string' && p).slice(0, MAX_IMAGES_PER_VEHICLE);
      }
    } catch (e) {
      // se o JSON vier inválido, ignoramos silenciosamente
    }
  }

  return {
    id,
    nome,
    preco,
    km: item.km ?? null,
    cor: item.color ?? null,
    cambio,
    faixa: preco <= 30000 ? FILTERS.ate30 : (preco <= 50000 ? FILTERS.ate50 : (preco <= 80000 ? FILTERS.ate80 : FILTERS.todos)),
    tipo,
    imagens,
  };
}

async function fetchFromApi() {
  try {
    const res = await fetch(API_URL);
    if (!res.ok) {
      return;
    }
    const data = await res.json();
    const items = Array.isArray(data.items) ? data.items : [];
    VEICULOS = items.map(mapItemToVehicle);
    lastLoadedAt = Date.now();
  } catch (e) { /* silencioso em produção */ }
}

async function ensureLoaded() {
  const now = Date.now();
  if (VEICULOS.length === 0 || now - lastLoadedAt > CACHE_TTL_MS) {
    await fetchFromApi();
  }
}

function formatPrice(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(value);
}

function getByFilter(filter, page = 1) {
  let list;
  if (filter === FILTERS.todos) {
    list = [...VEICULOS];
  } else if (filter === FILTERS.economico || filter === FILTERS.automatico) {
    list = VEICULOS.filter((v) => v.tipo === filter);
  } else {
    const [minP, maxP] = PRICE_RANGES[filter] ?? [0, Infinity];
    list = VEICULOS.filter((v) => v.preco >= minP && v.preco <= maxP);
  }

  const start = (page - 1) * MAX_VEHICLES_PER_PAGE;
  const pageList = list.slice(start, start + MAX_VEHICLES_PER_PAGE);
  const total = list.length;
  const hasMore = start + pageList.length < total;

  return {
    items: pageList.map((v) => ({ ...v, precoFormatado: formatPrice(v.preco) })),
    total,
    page,
    hasMore,
    totalPages: Math.ceil(total / MAX_VEHICLES_PER_PAGE),
  };
}

function getById(id) {
  const v = VEICULOS.find((x) => x.id === String(id));
  if (!v) return null;
  const imagens = Array.isArray(v.imagens) ? v.imagens : (v.imagem ? [v.imagem] : []);
  return { ...v, precoFormatado: formatPrice(v.preco), imagens };
}

module.exports = {
  MAX_VEHICLES_PER_PAGE,
  MAX_IMAGES_PER_VEHICLE,
  FILTERS,
  VEICULOS,
   ensureLoaded,
  getByFilter,
  getById,
  formatPrice,
};
