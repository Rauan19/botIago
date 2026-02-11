# Bot Iago Veículos

Assistente WhatsApp da Iago Veículos: menu interativo, listagem sem spam de fotos (1 foto só ao escolher o carro), estoque simulado e integração com Uazapi.

## Regras do bot

- **Nunca** mais de 1 foto por mensagem  
- Listagem de veículos **sem foto**  
- Foto **só** quando o cliente escolhe o carro  
- Sempre opção "Falar com vendedor"  
- Transferência para humano: financiamento, troca, áudio, endereço, mensagem fora do fluxo  

## Fluxo

1. **Menu** → Ver carros | Simular financiamento | Avaliar troca | Falar com vendedor | Endereço  
2. **Ver carros** → Filtro (faixa de preço / tipo) → Lista **sem fotos** → Cliente digita número → **1 foto** + detalhes  
3. **Financiamento / Troca** → Pergunta dados → Encaminha para vendedor  
4. **Falar com vendedor / Endereço** → Resposta e/ou encaminhamento  

## Estoque

O estoque é um **array simulado** em `vehicles.js` (~10 veículos com imagens). Para usar API real, troque as funções `getByFilter` e `getById` por chamadas à sua API.

## Configuração

1. Instale dependências:
   ```bash
   npm install
   ```
2. Copie `.env.example` para `.env` e ajuste:
   - `UAZAPI_BASE_URL` – base da API (ex.: `https://iagoveiculos.uazapi.com`)
   - `UAZAPI_INSTANCE_TOKEN` – token da instância
3. Configure na Uazapi o **webhook** para:
   - URL: `https://SEU_SERVIDOR/webhook` (tem de ser URL **pública**; localhost não funciona)
   - Método: POST  

### Bot não responde?

1. **Webhook em localhost** – A Uazapi envia o POST da internet. Se o servidor estiver só em `http://localhost:3000`, ela não consegue acessar. Use um túnel (ex.: [ngrok](https://ngrok.com): `ngrok http 3000`) ou hospede o bot em um servidor com URL pública e configure essa URL no painel da Uazapi.
2. **Token** – Confira se `UAZAPI_INSTANCE_TOKEN` está no `.env`. Ao subir o servidor, aparece um aviso se estiver vazio.
3. **Logs** – Rode o bot com `npm start` e olhe o terminal:
   - `[Webhook] Body recebido:` → mostra o JSON que a Uazapi mandou (formato do phone/texto).
   - `[Webhook] Não foi possível extrair phone` → o body está em outro formato; dá para ajustar o parser com base no JSON logado.
   - `[Uazapi] Erro ao enviar:` → falha ao enviar a resposta (status, URL, body e resposta da API).

## Rodar

```bash
npm start
```

Ou em desenvolvimento com reload:

```bash
npm run dev
```

Servidor sobe na porta `PORT` (padrão 3000). Endpoint do webhook: `POST /webhook`.

## Estrutura

| Arquivo      | Função |
|-------------|--------|
| `index.js`  | Servidor Express e rota do webhook |
| `webhook.js`| Recebe POST da Uazapi, extrai phone/texto/áudio e chama o fluxo |
| `flow.js`   | Toda a lógica do menu, listagem, detalhe do carro e transferência |
| `state.js`  | Estado por cliente (stage, filtro, página, lista) em memória |
| `vehicles.js` | Estoque simulado (array) e filtros |
| `uazapi.js` | Envio de texto e de **1 imagem** por mensagem |

## Escalabilidade

- Estado em memória: suficiente para um único processo. Para vários processos ou persistência, substitua `state.js` por Redis ou banco.
- Estoque: troque `vehicles.js` por cliente da sua API (ex.: `GET /vehicles?filter=...&limit=5&page=1` e `GET /vehicles/:id`).
