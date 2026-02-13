/**
 * Fluxo do bot Iago Veículos.
 * Menu interativo, listagem sem foto, 1 foto só ao escolher o carro.
 * Transferência para humano em: financiamento, troca, áudio, endereço, fora do fluxo.
 */

const { getByFilter, getById, FILTERS, ensureLoaded } = require('./vehicles');
const { sendMessage, sendImage, sendMenu, sendButtons } = require('./uazapi');
const { get, set, stages } = require('./state');

const ENDERECO_LOJA = 'Av. Getúlio Vargas\nCruz das Almas - BA, 44380-000';
const HORARIO_LOJA = 'Seg - Sáb: 8h às 18h';

const LABELS_FILTER = {
  [FILTERS.ate30]: 'Até R$30 mil',
  [FILTERS.ate50]: 'Até R$50 mil',
  [FILTERS.ate80]: 'Até R$80 mil',
  [FILTERS.automatico]: 'Automático',
  [FILTERS.economico]: 'Econômico',
  [FILTERS.todos]: 'Ver todos veículos',
};

/** Mensagem inicial + menu interativo (lista) */
async function sendWelcome(phone) {
  set(phone, { stage: stages.MENU });
  await sendMessage(
    phone,
    'Olá! 👋 Seja muito bem-vindo à Iago Veículos!\n\n' +
    'É um prazer ter você aqui. Vamos encontrar o carro perfeito pra você?'
  );
  await sendMenu(phone, {
    text: 'Como posso te ajudar hoje?',
    footerText: 'Iago Veículos',
    listButton: 'Ver opções',
    choices: [
      'Ver carros disponíveis|ver_carros|Veículos em estoque',
      'Simular financiamento|financiamento|Simule suas parcelas',
      'Avaliar meu carro na troca|troca|Avaliação para troca',
      'Falar com vendedor|vendedor|Atendimento humano',
      'Endereço da loja|endereco|Localização e horários',
    ],
  });
}

/** Menu principal: roteia pela escolha (texto digitado ou id do menu interativo) */
async function handleMenu(phone, text) {
  const t = (text || '').trim().toLowerCase();
  // Voltar ao menu (botão ou digitado)
  if (t === 'menu' || t === 'voltar' || t === 'voltar ao menu' || t === 'voltar ao menu principal') {
    return sendWelcome(phone);
  }
  // Qualquer mensagem que peça endereço/localização → mostrar endereço (não transferir)
  if (t.includes('endereço') || t.includes('endereco') || t.includes('localização') || t.includes('localizacao') || t.includes('onde fica')) {
    return sendAddress(phone);
  }
  const opt = t === 'ver_carros' || t === '1' || t === 'ver carros' || t === 'ver carros disponíveis' ? '1'
    : t === 'financiamento' || t === '2' || t === 'simular financiamento' ? '2'
    : t === 'troca' || t === '3' || t === 'avaliar' || t === 'avaliar meu carro na troca' ? '3'
    : t === 'vendedor' || t === '4' || t === 'falar com vendedor' ? '4'
    : t === 'endereco' || t === 'endereço' || t === '5' || t === 'endereço da loja' || t === 'localização' || t === 'localizacao' || t === 'ver endereço' || t === 'ver endereco' ? '5'
    : null;

  if (opt === '1') return askFilter(phone);
  if (opt === '2') return startFinancing(phone);
  if (opt === '3') return startTrade(phone);
  if (opt === '4') return transferToHuman(phone);
  if (opt === '5') return sendAddress(phone);

  await sendMessage(phone, 'Opção não encontrada. Toque em *Ver opções* ou digite 1, 2, 3, 4 ou 5.');
  return sendWelcome(phone);
}

/** Pergunta tipo de carro (filtro) */
async function askFilter(phone) {
  await ensureLoaded();
  set(phone, { stage: stages.FILTER });
  await sendMenu(phone, {
    text: 'Perfeito! Que tipo de carro você procura?',
    footerText: 'Iago Veículos',
    listButton: 'Filtrar',
    choices: [
      'Até R$30 mil|filter:ate30|',
      'Até R$50 mil|filter:ate50|',
      'Até R$80 mil|filter:ate80|',
      'Automático|filter:automatico|',
      'Ver todos veículos|filter:todos|',
      'Voltar ao menu principal|menu|',
    ],
  });
}

async function handleFilter(phone, text) {
  const t = (text || '').trim().toLowerCase();
  if (t === 'menu') return sendWelcome(phone);

  let filter = null;
  if (t.startsWith('filter:')) {
    const key = t.split(':')[1];
    filter = FILTERS[key] || key;
  }

  if (!filter) return; // travado: só responde se vier do menu

  set(phone, { current_filter: filter, current_page: 1, stage: stages.LIST });
  return sendVehicleList(phone);
}

/** Lista veículos: sempre usa lista grande de opções (sendMenu) para melhor visualização */
async function sendVehicleList(phone) {
  await ensureLoaded();
  const s = get(phone);
  const { items, hasMore, page } = getByFilter(s.current_filter, s.current_page);
  const listIds = items.map((v) => v.id);
  set(phone, { list_ids: listIds });

  const choices = items.map((v) => `${v.nome} – ${v.precoFormatado}|veh:${v.id}|`);
  if (hasMore) choices.push('Ver mais opções|mais|');
  choices.push('Falar com vendedor|vendedor|');
  choices.push('Voltar ao menu principal|menu|');

  await sendMessage(phone, 'Encontrei essas opções para você (sem fotos):');
  await sendMenu(phone, {
    text: 'Escolha o carro (nomes na lista):',
    footerText: `Página ${page}`,
    listButton: 'Ver carros',
    choices,
  });
}

async function handleList(phone, text) {
  const t = (text || '').trim().toLowerCase();
  const s = get(phone);

  if (t === 'vendedor' || t === 'falar com vendedor') return transferToHuman(phone);
  if (t === 'menu') return sendWelcome(phone);
  if (t === 'mais') {
    const next = getByFilter(s.current_filter, s.current_page + 1);
    if (next.items.length === 0) {
      return sendVehicleList(phone);
    }
    set(phone, { current_page: s.current_page + 1 });
    return sendVehicleList(phone);
  }

  if (!t.startsWith('veh:')) return; // travado: só responde se vier do menu
  const vehicleId = t.split(':')[1];
  set(phone, { last_vehicle_id: vehicleId, stage: stages.VEHICLE_DETAIL });
  return sendVehicleDetail(phone, vehicleId);
}

/** Detalhe do carro: informações (km, cor, câmbio) + até 5 imagens + botões */
async function sendVehicleDetail(phone, vehicleId) {
  await ensureLoaded();
  const v = getById(vehicleId);
  if (!v) {
    await sendMessage(phone, 'Veículo não encontrado.');
    return sendWelcome(phone);
  }

  const info =
    `🚗 *${v.nome}*\n` +
    `💰 ${v.precoFormatado}\n` +
    (v.km != null ? `📏 ${typeof v.km === 'number' ? v.km.toLocaleString('pt-BR') : v.km} km\n` : '') +
    (v.cor ? `🎨 Cor: ${v.cor}\n` : '') +
    (v.cambio ? `⚙️ Câmbio: ${v.cambio}\n` : '') +
    `📍 Disponível na Iago Veículos`;

  await sendMessage(phone, info);

  const imagens = (v.imagens || (v.imagem ? [v.imagem] : [])).slice(0, 5);
  for (const url of imagens) {
    await sendImage(phone, url, '');
  }

  await sendButtons(phone, {
    text: 'O que deseja fazer?',
    choices: [
      'Simular financiamento|financiamento',
      'Falar com vendedor|vendedor',
      'Voltar para a lista|voltar',
    ],
  });

  set(phone, { last_vehicle_id: vehicleId, stage: stages.VEHICLE_DETAIL });
}

async function handleVehicleDetail(phone, text) {
  const t = (text || '').trim().toLowerCase();
  if (t === 'vendedor' || t === 'falar com vendedor') return transferToHuman(phone);
  if (t === 'voltar' || t === 'voltar para a lista') {
    set(phone, { stage: stages.LIST });
    return sendVehicleList(phone);
  }
  if (t === 'financiamento' || t === 'simular financiamento') return startFinancing(phone);
}

/** Simular financiamento → encaminha para humano */
async function startFinancing(phone) {
  set(phone, { stage: stages.FINANCING });
  await sendMessage(phone,
    'Beleza! Para simular o financiamento, me informe:\n' +
    '• Valor de entrada, ou\n' +
    '• Valor da parcela desejada\n\n' +
    'Assim que você enviar, um vendedor vai te atender.'
  );
}

async function handleFinancing(phone, text) {
  if ((text || '').trim()) {
    await sendMessage(phone, 'Perfeito! Vou te encaminhar para um de nossos vendedores. Só um momento.');
    return transferToHuman(phone);
  }
}

/** Avaliar carro na troca → encaminha para humano */
async function startTrade(phone) {
  set(phone, { stage: stages.TRADE });
  await sendMessage(phone,
    'Certo! Para avaliar seu carro, me envie:\n' +
    '• Marca e modelo\n' +
    '• Ano\n' +
    '• Quilometragem\n' +
    '• Fotos do veículo (se puder)\n\n' +
    'Após sua resposta, um vendedor vai te atender.'
  );
}

async function handleTrade(phone, text) {
  if ((text || '').trim()) {
    await sendMessage(phone, 'Obrigado! Vou te encaminhar para um de nossos vendedores. Só um momento.');
    return transferToHuman(phone);
  }
}

async function transferToHuman(phone) {
  set(phone, { stage: stages.TRANSFER });
  await sendMessage(phone, 'Perfeito! Vou te encaminhar para um de nossos vendedores. Só um momento.');
}

/** Endereço da loja + botão Voltar ao menu principal */
async function sendAddress(phone) {
  set(phone, { stage: stages.MENU });
  await sendMessage(phone,
    '📍 *Iago Veículos*\n' +
    'Localização\n' +
    ENDERECO_LOJA +
    '\n\n' + HORARIO_LOJA
  );
  await sendButtons(phone, {
    text: 'Voltar ao menu principal',
    choices: ['Voltar ao menu principal|menu'],
  });
}

/** Detecta se deve transferir para humano (áudio, palavras-chave). Endereço NÃO transfere – mostramos o endereço. */
function shouldTransferToHuman(text, isAudio) {
  if (isAudio) return true;
  const t = (text || '').trim().toLowerCase();
  const transferKeywords = ['financiamento', 'troca', 'trocar', 'valor da parcela', 'entrada'];
  if (transferKeywords.some((k) => t.includes(k))) return true;
  return false;
}

/**
 * Processa mensagem recebida e responde.
 * @param {string} phone
 * @param {string} text - texto da mensagem (vazio se for áudio)
 * @param {boolean} isAudio
 */
async function processMessage(phone, text, isAudio = false, isInteractive = false) {
  const s = get(phone);

  // Travado: só responde quando o cliente está clicando no menu/lista/botões
  // (exceto saudação/primeiro contato, que é tratado no webhook)
  if (!isInteractive) return;

  if (shouldTransferToHuman(text, isAudio)) {
    if (isAudio) await sendMessage(phone, 'Recebi seu áudio. Vou te encaminhar para um vendedor.');
    return transferToHuman(phone);
  }

  switch (s.stage) {
    case stages.MENU:
      return handleMenu(phone, text);
    case stages.FILTER:
      return handleFilter(phone, text);
    case stages.LIST:
      return handleList(phone, text);
    case stages.VEHICLE_DETAIL:
      return handleVehicleDetail(phone, text);
    case stages.FINANCING:
      return handleFinancing(phone, text);
    case stages.TRADE:
      return handleTrade(phone, text);
    case stages.TRANSFER:
      return sendWelcome(phone);
    default:
      return sendWelcome(phone);
  }
}

module.exports = {
  sendWelcome,
  processMessage,
  transferToHuman,
  shouldTransferToHuman,
};
