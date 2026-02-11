/**
 * Cliente Uazapi – envio de mensagem de texto e de imagem.
 * Base URL e token vêm de variáveis de ambiente.
 * Regra: no máximo 1 imagem por mensagem.
 */

const MAX_IMAGES_PER_MESSAGE = 5;

const BASE_URL = process.env.UAZAPI_BASE_URL || 'https://iagoveiculos.uazapi.com';
const MENU_BASE_URL = process.env.UAZAPI_MENU_URL || BASE_URL;
const INSTANCE_TOKEN = process.env.UAZAPI_INSTANCE_TOKEN || '';
const SEND_TEXT_PATH = process.env.UAZAPI_SEND_TEXT_PATH || '/send/text';
const SEND_IMAGE_PATH = process.env.UAZAPI_SEND_IMAGE_PATH || '';

async function sendRequest(path, body, method = 'POST', baseUrl = BASE_URL, opts = {}) {
  const url = `${(baseUrl || BASE_URL).replace(/\/$/, '')}${path}`;
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${INSTANCE_TOKEN}`,
    'token': INSTANCE_TOKEN,
  };

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const responseText = await res.text();

  if (!res.ok) {
    if (opts.silent !== true) {
      console.error('[Uazapi] Erro ao enviar:', res.status, url, body, responseText);
    }
    throw new Error(`Uazapi ${res.status}: ${responseText}`);
  }

  const contentType = res.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    try {
      return JSON.parse(responseText);
    } catch (_) {
      return responseText;
    }
  }
  return responseText;
}

/**
 * Envia apenas texto.
 * Tenta /send/text (formato doc: number + text) e, se 405, /send-message (phone + message).
 * @param {string} phone - Número no formato 5511999999999 (sem +)
 */
async function sendMessage(phone, message) {
  const number = String(phone).replace(/\D/g, '');
  const text = String(message);
  const pathsToTry = [
    { path: SEND_TEXT_PATH, body: { number, text } },
    { path: '/send-message', body: { number, message: text } },
    { path: '/send-message', body: { phone: number, message: text } },
  ];
  let lastErr;
  for (const { path, body } of pathsToTry) {
    try {
      return await sendRequest(path, body, 'POST', BASE_URL);
    } catch (err) {
      lastErr = err;
      if (err.message && err.message.includes('405')) continue;
      throw err;
    }
  }
  throw lastErr;
}

/**
 * Envia imagem: { number, type: "image", file: "url" }.
 * Path configurável: UAZAPI_SEND_IMAGE_PATH no .env (ex.: /send/media).
 * A legenda (informações do veículo) é enviada separadamente via texto.
 */
async function sendImage(phone, imageUrl, caption = '') {
  const number = String(phone).replace(/\D/g, '');
  const captionStr = String(caption);
  const path = SEND_IMAGE_PATH || '/send/media';
  const bodyImage = { number, type: 'image', file: imageUrl };

  // Se o caller quiser mandar legenda junto, ele chama sendMessage(caption) antes.
  if (captionStr) {
    try {
      await sendMessage(phone, captionStr);
    } catch (e) {
      console.error('[Uazapi] Falha ao enviar texto da legenda:', e?.message ?? e);
    }
  }

  try {
    return await sendRequest(path, bodyImage, 'POST', BASE_URL, { silent: true });
  } catch (err) {
    return;
  }
}

/**
 * Estrutura base (doc Uazapi): number, type, text, choices, footerText, listButton.
 * Lista (type: "list"): listButton + choices "texto|id|descrição" ou "[Seção]".
 */
function sendMenu(phone, opts = {}) {
  const number = String(phone).replace(/\D/g, '');
  const body = {
    number,
    type: 'list',
    text: opts.text || 'Escolha uma opção:',
    choices: opts.choices || [],
    footerText: opts.footerText ?? 'Iago Veículos',
    listButton: opts.listButton || 'Ver opções',
    ...(opts.imageButton && { imageButton: opts.imageButton }),
    ...(opts.readchat != null && { readchat: opts.readchat }),
    ...(opts.readmessages != null && { readmessages: opts.readmessages }),
    ...(opts.delay != null && { delay: opts.delay }),
  };
  return sendRequest('/send/menu', body, 'POST', MENU_BASE_URL);
}

/**
 * Botões (type: "button") – choices: "texto|id" ou "texto|url:..." ou "texto|call:+55..."
 * Máx. 3 botões de resposta; com call/url/copy pode pedir para abrir no celular.
 */
function sendButtons(phone, opts = {}) {
  const number = String(phone).replace(/\D/g, '');
  const body = {
    number,
    type: 'button',
    text: opts.text || 'Escolha uma opção:',
    choices: opts.choices || [],
    ...(opts.footerText && { footerText: opts.footerText }),
    ...(opts.imageButton && { imageButton: opts.imageButton }),
  };
  return sendRequest('/send/menu', body, 'POST', MENU_BASE_URL);
}

/**
 * Enquete (type: "poll") – selectableCount: quantas opções podem ser escolhidas.
 */
function sendPoll(phone, opts = {}) {
  const number = String(phone).replace(/\D/g, '');
  const body = {
    number,
    type: 'poll',
    text: opts.text || 'Enquete',
    choices: opts.choices || [],
    selectableCount: opts.selectableCount ?? 1,
  };
  return sendRequest('/send/menu', body, 'POST', MENU_BASE_URL);
}

module.exports = {
  MAX_IMAGES_PER_MESSAGE,
  sendMessage,
  sendImage,
  sendMenu,
  sendButtons,
  sendPoll,
  sendRequest,
};
