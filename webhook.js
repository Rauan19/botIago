/**
 * Webhook que recebe mensagens da Uazapi.
 * Extrai phone, texto e se é áudio; chama o fluxo do bot.
 */

const { processMessage, sendWelcome } = require('./flow');

/** Só retorna número se for só dígitos e 10+ (evita usar chat.id tipo "raf896f47773c63") */
function normalizarPhone(val) {
  if (val === undefined || val === null) return null;
  const s = String(val).replace(/@.*$/, '').replace(/\D/g, '');
  return s.length >= 10 && /^\d+$/.test(s) ? s : null;
}

/**
 * Detecta se o payload é de GRUPO ou STATUS/STATUS BROADCAST.
 * Queremos ignorar esses eventos para o bot não responder em grupo nem em status.
 */
function isGroupOrStatus(body) {
  try {
    const remotes = [
      body?.remoteJid,
      body?.chat?.remoteJid,
      body?.data?.remoteJid,
      body?.key?.remoteJid,
      body?.chat?.id,
    ].filter(Boolean);

    for (const r of remotes) {
      if (typeof r !== 'string') continue;
      const v = r.toLowerCase();
      if (v.endsWith('@g.us')) return true; // grupos
      if (v.includes('status@broadcast')) return true; // status
      if (v.endsWith('@broadcast')) return true; // outros broadcasts
    }

    if (body?.chat?.isGroup === true || body?.isGroup === true) return true;
    if (typeof body?.type === 'string' && body.type.toLowerCase().includes('status')) return true;
    if (typeof body?.EventType === 'string' && body.EventType.toLowerCase().includes('status')) return true;
  } catch (_) {
    // em caso de erro silencioso, não bloqueia mensagem normal
  }
  return false;
}

/**
 * Extrai do body (Uazapi: EventType, chat, message/data).
 * Suporta chat.remoteJid, chat.phone, message.from, data.from, etc.
 */
function parseWebhookBody(body) {
  if (!body || typeof body !== 'object') return null;

  const phone = extrairPhone(body);
  if (!phone) return null;

  let text = '';
  let isAudio = false;
  let isInteractive = false;

  const msg = body.message ?? body.data?.message ?? body.data ?? body.chat?.lastMessage ?? body;
  if (msg && typeof msg === 'object') {
    const type = (msg.type || msg.messageType || msg.msgType || '').toLowerCase();
    isAudio = type === 'audio' || type === 'ptt';

    // Escolha de lista/botão vem em buttonOrListid (id ex: "endereco")
    if (msg.buttonOrListid) {
      text = String(msg.buttonOrListid).trim();
      isInteractive = true;
    }
    if (!text && msg.text) text = typeof msg.text === 'string' ? msg.text : (msg.text.body ?? '');
    else if (!text && msg.body) text = String(msg.body);
    else if (!text && msg.content) text = String(msg.content);
    else if (!text && msg.caption) text = String(msg.caption);
  }
  if (!text && body.text) text = typeof body.text === 'string' ? body.text : (body.text?.body ?? '');
  if (!text && body.body) text = String(body.body);
  if (!text && body.message && typeof body.message === 'string') text = body.message;

  return { phone, text: (text || '').trim(), isAudio, isInteractive };
}

/** Tenta extrair phone (Uazapi: chat.remoteJid, chat.phone, message.from, data.from, etc.) */
function extrairPhone(body) {
  const candidates = [
    body?.phone,
    body?.number,
    body?.from,
    body?.sender,
    body?.remoteJid,
    body?.chat?.remoteJid,
    body?.chat?.phone,
    body?.chat?.number,
    body?.data?.phone,
    body?.data?.number,
    body?.data?.from,
    body?.data?.sender,
    body?.data?.remoteJid,
    body?.message?.from,
    body?.message?.sender,
    body?.chat?.lastMessage?.from,
    body?.contact?.waid,
    body?.key?.remoteJid,
  ];
  for (const v of candidates) {
    // Se for id de grupo/status, ignoramos
    if (typeof v === 'string') {
      const low = v.toLowerCase();
      if (low.endsWith('@g.us')) continue; // grupo
      if (low.includes('status@broadcast')) continue; // status
      if (low.endsWith('@broadcast')) continue; // broadcast
    }
    const s = normalizarPhone(v);
    if (s) return s;
  }
  return null;
}

/** Tenta extrair texto (inclui buttonOrListid = escolha da lista) */
function extrairTexto(body) {
  const msg = body?.message ?? body?.data?.message ?? body?.data ?? body?.chat?.lastMessage;
  if (typeof msg === 'string') return msg;
  if (msg?.buttonOrListid) return String(msg.buttonOrListid).trim();
  if (msg?.text) return typeof msg.text === 'string' ? msg.text : (msg.text?.body ?? '');
  if (msg?.body) return String(msg.body);
  if (msg?.content) return String(msg.content);
  if (msg?.caption) return String(msg.caption);
  if (body?.text) return typeof body.text === 'string' ? body.text : (body.text?.body ?? '');
  if (body?.body) return String(body.body);
  return '';
}

/**
 * Saudação pode ser sozinha ou dentro da frase.
 * \s* = com ou sem espaço (bom dia, bomdia, Bom Dia, BOMDIA).
 * Flag i = maiúscula/minúscula não importa.
 */
const SAUDACOES = [
  /\boi\b/i,
  /\bol[aá]\b/i,
  /\bbom\s*dia\b/i,
  /\boa\s*tarde\b/i,
  /\boa\s*noite\b/i,
  /\bboa\s*tarde\b/i,
  /\bboa\s*noite\b/i,
  /\bfala\b/i,
  /\be\s*a[ií]\b/i,
  /\beai\b/i,
  /\bsalve\b/i,
  /\biniciar\b/i,
  /\bmenu\b/i,
  /\bstart\b/i,
  /\btudo\s*bem\b/i,
  /\btd\s*bem\b/i,
  /\bcomo\s*vai\b/i,
];

function contemSaudacao(texto) {
  if (!texto || typeof texto !== 'string') return false;
  const t = texto.trim();
  if (t === '') return false;
  return SAUDACOES.some((re) => re.test(t));
}

async function handleWebhook(req, res) {
  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed');
    return;
  }

  const body = typeof req.body === 'object' ? req.body : {};

   // Ignora mensagens de grupos e de status/story
  if (isGroupOrStatus(body)) {
    res.status(200).send('ok');
    return;
  }

  let parsed = parseWebhookBody(body);
  if (!parsed?.phone) {
    const phoneFallback = extrairPhone(body);
    const textFallback = extrairTexto(body);
    if (phoneFallback) {
      const msg = body?.message ?? body?.data?.message ?? body?.data;
      const isAudio = (msg?.type || msg?.messageType || body?.type || '')?.toLowerCase?.()?.includes('audio') || false;
      parsed = { phone: phoneFallback, text: (textFallback || '').trim(), isAudio };
    }
  }

  if (!parsed || !parsed.phone) {
    res.status(200).send('ok');
    return;
  }

  const { phone, text, isAudio } = parsed;

  // Responde 200 logo para evitar 502 (timeout do proxy/Uazapi). Processa em segundo plano.
  res.status(200).send('ok');

  setImmediate(async () => {
    try {
      const mensagemVazia = text === '' && !isAudio;
      const ehSaudacao = contemSaudacao(text);
      if (mensagemVazia || ehSaudacao) {
        await sendWelcome(phone);
      } else {
        await processMessage(phone, text, isAudio, !!parsed.isInteractive);
      }
    } catch (err) {
      console.error('Erro ao processar mensagem:', err);
      try {
        const { sendMessage } = require('./uazapi');
        await sendMessage(phone, 'Desculpe, ocorreu um erro. Por favor, tente de novo ou digite *menu*.');
      } catch (_) {
        // Evita unhandled rejection se o envio de erro também falhar
      }
    }
  });
}

module.exports = { handleWebhook, parseWebhookBody };
