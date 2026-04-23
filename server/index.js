import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcode from 'qrcode-terminal';
import express from 'express';
import http from 'http';

import { initFirebase, processInventoryActions, db } from './firebaseAdmin.js';
import { processInventoryMessage, analyzeItemAI, findStoresAI } from './aiService.js';
import { FirestoreStore } from './sessionStore.js';

// ─── 1. INICIALIZAR BANCO ────────────────────────────────────────────────────
const app_express = express();
app_express.use(express.json()); // Habilita JSON no corpo das requisições
const server_http = http.createServer(app_express);

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

// Proxy para Análise de IA (Evita erro de API KEY no Frontend)
app_express.post('/api/ai/analyze-item', async (req, res) => {
  try {
    const { itemName, stores } = req.body;
    const result = await analyzeItemAI(itemName, stores);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app_express.post('/api/ai/find-stores', async (req, res) => {
  try {
    const { location } = req.body;
    const result = await findStoresAI(location);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
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

const client = new Client({
  authStrategy: new LocalAuth({
    clientId: 'lar360-bot'
  }),
  puppeteer: {
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || 
                    (fs.existsSync('/usr/bin/google-chrome-stable') ? '/usr/bin/google-chrome-stable' : 
                     fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined),
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ]
  }
});

client.on('qr', (qr) => {
  lastQr = qr;
  botReady = false;
  console.log('📱 QR Code gerado!');
  qrcode.generate(qr, { small: true });
  console.log('Acesse também /qr no navegador para escanear.');
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

  const welcomeText = `✨ *OLÁ, ${userName.toUpperCase()}!* ✨\n\nQue honra ter você no *Lar 360*! 🏠\n\nA partir de agora, eu serei sua dupla dinâmica na organização da sua casa. Esqueça papel e caneta! 📝✂️\n\n🔹 *O QUE VOCÊ PODE FAZER COMIGO?*\n\n🛒 *Listas Rápidas*: Só me diga "Adicione café e pão" ou mande um *áudio*!\n📦 *Controle de Estoque*: "Comprei 3 leites" ou "Acabou o arroz".\n📸 *Visão Inteligente*: Mande uma foto do seu *cupom fiscal* ou da sua despensa e eu faço o trabalho duro de ler tudo para você!\n\nEstou pronto para organizar sua vida. O que vamos planejar hoje? 🚀😉`;

  try {
    setTimeout(async () => {
      const contactId = await client.getNumberId(fullPhone);
      if (contactId) {
        await client.sendMessage(contactId._serialized, welcomeText);
        console.log(`✅ Incrível mensagem de boas-vindas enviada para ${userName}`);
        await db.collection('users').doc(docId).update({
          welcomed: true,
          whatsappId: contactId._serialized.split('@')[0]
        });
      }
    }, 4000);
  } catch (err) {
    console.error('❌ Erro no Welcome:', err.message);
  }
}


// ─── 8. BUSCAR USUÁRIO PELO TELEFONE ─────────────────────────────────────────
async function getUserByPhone(phone) {
  const cleanPhone = String(phone).replace(/\D/g, '');
  
  // Busca pelo whatsappId (ex: 5531973368101)
  let snap = await db.collection('users').where('whatsappId', '==', cleanPhone).get();
  if (!snap.empty) return { id: snap.docs[0].id, ...snap.docs[0].data() };
  
  // Fallback pelos últimos 8 dígitos do phone salvo
  const allUsers = await db.collection('users').get();
  const last8 = cleanPhone.slice(-8);
  let found = null;
  allUsers.forEach(doc => {
    const d = doc.data();
    if (d.phone && String(d.phone).slice(-8) === last8) {
      found = { id: doc.id, ...d };
    }
  });
  return found;
}


// ─── 9. PROCESSAR MENSAGENS RECEBIDAS ────────────────────────────────────────
client.on('message', async (msg) => {
  const chat = await msg.getChat();
  if (chat.isGroup) return;

  const authorPhone = msg.from.split('@')[0];
  const text = (msg.body || '').trim().toLowerCase();
  console.log(`📨 Mensagem de +${authorPhone}: "${text}"`);

  // Buscar usuário no banco
  const userData = await getUserByPhone(authorPhone);
  if (!userData) {
    // Se for a primeira vez e não achou no banco, pede cadastro
    await msg.reply("Olá! 👋 Notei que você ainda não tem uma conta no *Lar 360*. Acesse nosso site para se cadastrar e começar a usar o robô! 🏠✨");
    return;
  }
  
  const uid = userData.id;
  const firstName = userData.name ? userData.name.split(' ')[0] : 'amigo(a)';

  // 1. FLUXO DE CONFIRMAÇÃO (SIM/NÃO)
  if (['sim', 'confirmar', 'pode', 'ok', 'pode ser', 'vrai'].includes(text)) {
    const pendingRef = db.collection('users').doc(uid).collection('temp').doc('pendingAction');
    const pendingSnap = await pendingRef.get();
    
    if (pendingSnap.exists) {
      const { actions } = pendingSnap.data();
      await msg.reply(`Perfeito, *${firstName}*! ✨ Analisando e salvando tudo agora... ⏳`);
      const dbStatus = await processInventoryActions(authorPhone, actions);
      await msg.reply(dbStatus || "Tudo pronto! Seus itens já estão no sistema. ✅");
      await pendingRef.delete();
      return;
    }
  }

  if (['não', 'nao', 'cancelar', 'esquece'].includes(text)) {
    await db.collection('users').doc(uid).collection('temp').doc('pendingAction').delete();
    await msg.reply(`Sem problemas! 👌 Cancelei a operação. O que mais posso fazer por você?`);
    return;
  }

  // 2. SAUDAÇÕES PREMIUM
  const greetings = ['oi', 'olá', 'ola', 'bom dia', 'boa tarde', 'boa noite', 'hey', 'hello', 'hi'];
  if (greetings.includes(text)) {
    await msg.reply(
      `Olá, *${firstName}*! ❤️ Que alegria ver você por aqui de novo!\n\n` +
      `Estou pronto para te ajudar a organizar a casa. O que vamos planejar hoje? 🤔\n\n` +
      `📌 *Dica:* Você pode me mandar um *áudio* ou uma *foto do cupom* que eu cuido de tudo para você! 🚀`
    );
    return;
  }

  // 3. PROCESSAMENTO VIA IA (TEXTO, ÁUDIO OU IMAGEM)
  let audioBase64 = null, audioMime = null, imageBase64 = null, imageMime = null;

  if (msg.hasMedia) {
    const media = await msg.downloadMedia();
    if (media) {
      if (media.mimetype.includes('audio')) {
        audioBase64 = media.data; audioMime = media.mimetype;
        await msg.reply(`🎤 Ouvi você, *${firstName}*! Deixa eu processar esse áudio...`);
      } else if (media.mimetype.includes('image')) {
        imageBase64 = media.data; imageMime = media.mimetype;
        await msg.reply(`📸 Deixa eu dar uma olhada nessa imagem, *${firstName}*...`);
      }
    }
  } else {
    // Apenas se não for um comando curto
    if (text.length > 2) {
      await msg.reply(`⏳ Anotando isso, *${firstName}*...`);
    }
  }

  try {
    const result = await processInventoryMessage(text, audioBase64, audioMime, firstName, imageBase64, imageMime);
    
    if (result.needsConfirmation && result.actions.length > 0) {
      // Salva itens temporários para confirmação
      await db.collection('users').doc(uid).collection('temp').doc('pendingAction').set({
        actions: result.actions,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
      
      await msg.reply(
        `📜 *IDENTIFIQUEI ESSES ITENS:* \n\n${result.reply}\n\n` +
        `✅ *Posso adicionar todos à sua lista?* (Responda "Sim" para confirmar)`
      );
    } else if (result.actions && result.actions.length > 0) {
      const dbStatus = await processInventoryActions(authorPhone, result.actions);
      await msg.reply(dbStatus || result.reply || "Tudo certo! Salvei para você. ✅");
    } else {
      await msg.reply(result.reply || "Poxa, não consegui entender o item. Pode repetir? 🤔");
    }
  } catch (err) {
    console.error('💥 Erro:', err.message);
    await msg.reply('Poxa, me perdi por um segundo! 😅 Pode repetir de um jeito mais simples? 😊');
  }
});


// ─── 10. INICIALIZAÇÃO DO ROBÔ ────────────────────────────────────────────────
function initBot() {
  // Limpar lock file se existir para evitar erros de inicialização
  const lockFile = path.join(__dirname, '../.wwebjs_auth/session/SingletonLock');
  if (fs.existsSync(lockFile)) {
    try { 
      fs.unlinkSync(lockFile); 
      console.log('🧹 Lock do WhatsApp removido.');
    } catch(e) {
      console.log('⚠️ Não foi possível remover o lock (pode estar em uso).');
    }
  }
  console.log('🤖 Iniciando robô do WhatsApp...');
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
