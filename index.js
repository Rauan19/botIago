/**
 * Servidor do Bot Iago Veículos.
 * Expõe o webhook para a Uazapi e processa mensagens no fluxo completo.
 */

require('dotenv').config();
const express = require('express');
const { handleWebhook } = require('./webhook');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/health', (req, res) => {
  res.json({ ok: true, bot: 'Iago Veículos' });
});

app.post('/webhook', handleWebhook);

app.get('/webhook', (req, res) => {
  res.status(200).send('Webhook ativo. A Uazapi deve enviar POST para esta URL com as mensagens.');
});

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});

