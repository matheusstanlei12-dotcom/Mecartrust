import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import express from 'express';
import http from 'http';

const app_express = express();
const server_http = http.createServer(app_express);

import { initFirebase, processInventoryActions, db } from './firebaseAdmin.js';
import { processInventoryMessage } from './aiService.js';

// ─── 1. INICIALIZAR BANCO ────────────────────────────────────────────────────
const hasDB = initFirebase();
if (!hasDB) {
  console.error('FATAL: Firebase não inicializado. Encerrando.');
  process.exit(1);
}

// ─── 2. ARQUIVOS ESTÁTICOS (SITE REACT) ─────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.join(__dirname, '../dist');
app_express.use(express.static(distPath));

// ─── 3. VARIÁVEIS DO ROBÔ ───────────────────────────────────────────────────
let lastQr = null;
let botReady = false;

// ─── 4. ROTAS DO SERVIDOR ────────────────────────────────────────────────────

// Health Check
app_express.get('/ping', (req, res) => res.send('pong'));

// Status do robô
app_express.get('/status', (req, res) => {
  res.json({ 
    botReady, 
    hasQr: !!lastQr,
    timestamp: new Date().toISOString()
  });
});

// Página do QR Code
app_express.get('/qr', (req, res) => {
  if (botReady) {
    return res.send(`
      <html><body style="display:flex;align-items:center;justify-content:center;height:100vh;margin:0;font-family:sans-serif;background:#f0f2f5">
        <div style="background:white;padding:40px;border-radius:20px;box-shadow:0 10px 25px rgba(0,0,0,.1);text-align:center">
          <h2 style="color:#25d366">✅ Robô já está conectado!</h2>
          <p style="color:#666">O WhatsApp está ativo e funcionando.</p>
          <a href="/reset-session" style="display:inline-block;margin-top:20px;padding:10px 20px;background:#ff4444;color:white;border-radius:8px;text-decoration:none">🔄 Trocar Número</a>
        </div>
      </body></html>
    `);
  }
  
  if (!lastQr) {
    return res.send(`
      <html><body style="display:flex;align-items:center;justify-content:center;height:100vh;margin:0;font-family:sans-serif;background:#f0f2f5">
        <div style="background:white;padding:40px;border-radius:20px;box-shadow:0 10px 25px rgba(0,0,0,.1);text-align:center">
          <h2 style="color:#f39c12">⏳ Aguardando QR Code...</h2>
          <p style="color:#666">O robô está iniciando. Aguarde alguns segundos.</p>
        </div>
        <script>setTimeout(() => location.reload(), 3000)</script>
      </body></html>
    `);
  }
  
  res.send(`
    <html><body style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0;font-family:sans-serif;background:#f0f2f5">
      <div style="background:white;padding:40px;border-radius:20px;box-shadow:0 10px 25px rgba(0,0,0,.1);text-align:center">
        <h2 style="color:#25d366;margin-bottom:20px">📱 Conectar MercaTrust</h2>
        <div id="qrcode"></div>
        <p style="margin-top:20px;color:#666">WhatsApp → Aparelhos Conectados → Conectar um Aparelho</p>
        <a href="/reset-session" style="display:inline-block;margin-top:20px;padding:10px 20px;background:#ff4444;color:white;border-radius:8px;text-decoration:none;font-size:.9rem">🔄 Trocar Número</a>
      </div>
      <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
      <script>
        new QRCode(document.getElementById("qrcode"), "${lastQr}");
        setTimeout(() => location.reload(), 30000);
      </script>
    </body></html>
  `);
});

// Resetar sessão
app_express.get('/reset-session', async (req, res) => {
  console.log('🔄 Resetando sessão do WhatsApp...');
  botReady = false;
  lastQr = null;
  
  try { await client.destroy(); } catch(e) {}
  
  const sessionPath = path.join(__dirname, '../.wwebjs_auth');
  if (fs.existsSync(sessionPath)) {
    fs.rmSync(sessionPath, { recursive: true, force: true });
    console.log('🧹 Sessão apagada.');
  }
  
  setTimeout(() => {
    initBot();
  }, 2000);
  
  res.send(`
    <html><body style="display:flex;align-items:center;justify-content:center;height:100vh;margin:0;font-family:sans-serif;background:#f0f2f5">
      <div style="background:white;padding:40px;border-radius:20px;text-align:center">
        <h2 style="color:#25d366">✅ Sessão Resetada!</h2>
        <p>Redirecionando para o QR Code em 10 segundos...</p>
        <script>setTimeout(() => location.href='/qr', 10000)</script>
      </div>
    </body></html>
  `);
});

// SPA React — DEVE SER A ÚLTIMA ROTA
app_express.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

// ─── 5. INICIAR SERVIDOR HTTP ────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
server_http.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor Web rodando em 0.0.0.0:${PORT}`);
});

// ─── 6. CONFIGURAÇÃO DO ROBÔ ─────────────────────────────────────────────────
const client = new Client({
  authStrategy: new LocalAuth({ dataPath: '/tmp/.wwebjs_auth' }),
  puppeteer: {
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-first-run',
      '--no-zygote',
      '--single-process'
    ]
  }
});

client.on('qr', (qr) => {
  lastQr = qr;
  botReady = false;
  console.log('📱 QR Code gerado! Acesse /qr para escanear.');
});

client.on('authenticated', () => {
  console.log('🔐 WhatsApp autenticado com sucesso!');
});

client.on('auth_failure', (msg) => {
  console.error('❌ Falha na autenticação do WhatsApp:', msg);
  lastQr = null;
  botReady = false;
});

client.on('disconnected', (reason) => {
  console.log('🔌 WhatsApp desconectado:', reason);
  botReady = false;
  // Tentar reconectar após 30 segundos
  setTimeout(() => {
    console.log('🔄 Tentando reconectar...');
    initBot();
  }, 30000);
});

client.on('ready', () => {
  lastQr = null;
  botReady = true;
  console.log('✅ ROBÔ CONECTADO! WhatsApp funcionando 100%.');

  // Ouvir novos usuários para enviar boas-vindas
  db.collection('users').onSnapshot((snapshot) => {
    snapshot.docChanges().forEach(async (change) => {
      if (change.type === 'added' || change.type === 'modified') {
        const user = change.doc.data();
        if (user.phone && !user.welcomed) {
          await sendWelcomeMessage(change.doc.id, user);
        }
      }
    });
  });
});

// ─── 7. MENSAGEM DE BOAS-VINDAS ──────────────────────────────────────────────
async function sendWelcomeMessage(docId, user) {
  const userName = user.name || 'cliente';
  const rawPhone = String(user.phone).replace(/\D/g, '');
  const fullPhone = rawPhone.startsWith('55') ? rawPhone : '55' + rawPhone;

  const welcomeText = `🎉 Olá, *${userName}*! Bem-vindo ao *MercaTrust*! 🥳\n\nSou seu assistente inteligente de estoque. Funciona assim:\n\n📦 Para adicionar à lista de compras, me mande:\n_"Preciso de leite e arroz"_\n\n🎤 Ou mande um *áudio* falando o que está faltando!\n\nVamos começar? 🚀`;

  try {
    setTimeout(async () => {
      const contactId = await client.getNumberId(fullPhone);
      if (contactId) {
        await client.sendMessage(contactId._serialized, welcomeText);
        console.log(`✅ Boas-vindas enviadas para ${userName} (+${fullPhone})`);
        await db.collection('users').doc(docId).update({
          welcomed: true,
          whatsappId: contactId._serialized.split('@')[0]
        });
      } else {
        console.error(`❌ Número inválido: +${fullPhone}`);
      }
    }, 5000);
  } catch (err) {
    console.error('❌ Erro ao enviar boas-vindas:', err.message);
  }
}

// ─── 8. PROCESSAR MENSAGENS RECEBIDAS ────────────────────────────────────────
client.on('message', async (msg) => {
  const chat = await msg.getChat();
  if (chat.isGroup) return;

  const authorPhone = msg.from.split('@')[0];
  const text = msg.body || '';
  console.log(`📨 Mensagem de +${authorPhone}: "${text}"`);

  // Saudação simples
  const greetings = ['oi', 'olá', 'ola', 'bom dia', 'boa tarde', 'boa noite'];
  if (greetings.includes(text.trim().toLowerCase())) {
    await msg.reply('Olá! 👋 Sou o assistente do *MercaTrust*!\nMe mande um *áudio* ou *texto* com o que está faltando em casa e eu organizo tudo na sua lista! 🛒');
    return;
  }

  let audioBase64 = null;
  let audioMime = null;

  if (msg.hasMedia) {
    const media = await msg.downloadMedia();
    if (media && media.mimetype.includes('audio')) {
      audioBase64 = media.data;
      audioMime = media.mimetype;
      await msg.reply('🎤 Ouvi seu áudio! Processando...');
    }
  } else {
    await msg.reply('⏳ Processando...');
  }

  try {
    const result = await processInventoryMessage(text, audioBase64, audioMime);
    console.log('🤖 IA:', JSON.stringify(result));

    if (result.actions && result.actions.length > 0) {
      const lista = result.actions.map(a => {
        const icone = a.type === 'add' ? '✅' : '❌';
        const alvo = a.target === 'inventory' ? 'Estoque' : 'Lista de Compras';
        return `${icone} ${a.item?.quantity || 1}x ${a.item?.name} → ${alvo}`;
      }).join('\n');

      const dbResp = await processInventoryActions(authorPhone, result.actions);
      await msg.reply(`Feito! 🎉\n\n${lista}\n\n${dbResp}`);
    } else {
      await msg.reply('Não entendi o item. Pode repetir? Exemplo: _"preciso de arroz e feijão"_ 🙏');
    }
  } catch (err) {
    console.error('💥 Erro:', err.message);
    await msg.reply('Tive um probleminha. Tente novamente em instantes! 😅');
  }
});

// ─── 9. INICIALIZAÇÃO DO ROBÔ ─────────────────────────────────────────────────
function initBot() {
  // Limpar lock file se existir
  const lockFile = '/tmp/.wwebjs_auth/session/SingletonLock';
  if (fs.existsSync(lockFile)) {
    try { fs.unlinkSync(lockFile); } catch(e) {}
    console.log('🧹 Lock removido.');
  }
  console.log('🤖 Iniciando robô...');
  client.initialize().catch(err => {
    console.error('💥 Erro ao iniciar robô:', err.message);
    // Tentar novamente em 30 segundos
    setTimeout(initBot, 30000);
  });
}

// Iniciar robô 5 segundos após o servidor subir
setTimeout(initBot, 5000);

// ─── 10. KEEP-ALIVE (Manter servidor ativo) ──────────────────────────────────
setInterval(async () => {
  try {
    await fetch(`http://localhost:${PORT}/ping`);
  } catch (e) {}
}, 10 * 60 * 1000);
