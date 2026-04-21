import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pkg from 'whatsapp-web.js';
const { Client, LocalAuth, MessageMedia } = pkg;
import qrcode from 'qrcode-terminal';
import express from 'express';
import http from 'http';

const app_express = express();
const server_http = http.createServer(app_express);

import { initFirebase, processInventoryActions, db } from './firebaseAdmin.js';
import { processInventoryMessage } from './aiService.js';

// Inicializar banco
const hasDB = initFirebase();
if (!hasDB) {
  process.exit(1);
}

// Configuração de Pastas estáticas (Site)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.join(__dirname, '../dist');

app_express.use(express.static(distPath));

// Rota para o SPA (React)
app_express.get('*', (req, res, next) => {
  // Se for uma requisição de API ou algo do gênero, podemos ignorar, mas aqui servimos o index.html
  if (req.url.startsWith('/api')) return next();
  res.sendFile(path.join(distPath, 'index.html'));
});

const PORT = process.env.PORT || 3001;
server_http.listen(PORT, () => {
  console.log(`🚀 Servidor Web rodando na porta ${PORT}`);
  console.log(`🌐 Site disponível em: http://localhost:${PORT}`);
});

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
      args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage'
      ]
  }
});

let lastQr = null;

client.on('qr', (qr) => {
    lastQr = qr;
    console.log('Novo QR Code gerado! Acesse /qr para escanear.');
});

// Rota para ver o QR Code de forma limpa
app_express.get('/qr', (req, res) => {
    if (!lastQr) {
        return res.send('<h1>QR Code ainda não gerado.</h1><p>Aguarde uns instantes e atualize a página.</p><script>setTimeout(() => location.reload(), 2000)</script>');
    }
    
    res.send(`
        <html>
            <body style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0;font-family:sans-serif;background:#f0f2f5">
                <div style="background:white;padding:40px;border-radius:20px;box-shadow:0 10px 25px rgba(0,0,0,0.1);text-align:center">
                    <h2 style="color:#25d366;margin-bottom:20px">Conectar MercaTrust</h2>
                    <div id="qrcode"></div>
                    <p style="margin-top:20px;color:#666">Abra o WhatsApp > Aparelhos Conectados > Conectar um Aparelho</p>
                </div>
                <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
                <script>
                    new QRCode(document.getElementById("qrcode"), "${lastQr}");
                    // Atualiza a cada 30 segundos para pegar um novo QR se expirar
                    setTimeout(() => location.reload(), 30000);
                </script>
            </body>
        </html>
    `);
});

client.on('ready', () => {
    lastQr = null; // Limpa o QR quando conecta
    console.log('✅ Cliente do WhatsApp conectado e pronto para receber mensagens!');
    
    // Iniciar ouvinte para disparar boas vindas
    console.log('👀 Ouvindo por novos cadastros...');
    db.collection('users').onSnapshot((snapshot) => {
      snapshot.docChanges().forEach(async (change) => {
        if (change.type === 'added' || change.type === 'modified') {
          const user = change.doc.data();
          
          // Se o usuário tem telefone preenchido e ainda não recebeu boas-vindas
          if (user.phone && !user.welcomed) {
            const userName = user.name || 'Pessoa incrível';
            const welcomeText = `🎉 Olá, *${userName}*! Que alegria ter você aqui! 🥳

Sou a Inteligência Artificial do *Lar360* e a partir de agora serei seu novo melhor amigo no controle de estoque da sua casa! 🏠✨

A mágica já começou. Funciona assim:
Toda vez que você abrir a geladeira ou despensa e ver que tá faltando alguma coisa, é só me mandar um *áudio* rápido ou escrever: 
_"Acabou o pão e o leite!"_ 🥖🥛

Eu entendo sua lista na mesma hora e deixo tudo perfeitamente anotado e organizado no sistema pra quando você for no mercado! Vamos testar? Me mande um áudio com o que tá faltando! 🚀`;

            try {
              // Delayzinho pra não parecer tão robô e dar tempo do front renderizar
              setTimeout(async () => {
                const phoneForLib = "55" + user.phone;
                const contactId = await client.getNumberId(phoneForLib);
                
                if (contactId && contactId._serialized) {
                  const internalPhone = contactId._serialized.split('@')[0];
                  await client.sendMessage(contactId._serialized, welcomeText);
                  console.log(`Mensagem de boas-vindas enviada para o novo usuário: ${userName} (${user.phone}) -> ${internalPhone}`);
                  
                  // Marca no banco que esse usuário já foi recebido para não reenviar nas próximas edições
                  await db.collection('users').doc(change.doc.id).update({ 
                    welcomed: true,
                    whatsappId: internalPhone 
                  });
                } else {
                  console.error(`Número de telefone não possui WhatsApp válido: ${phoneForLib}`);
                }
              }, 4000);
            } catch (err) {
               console.error("Erro ao enviar boas vindas", err);
            }
          }
        }
      });
    });
});

client.on('message', async msg => {
  // Ignora mensagens de grupos por enquanto
  const chat = await msg.getChat();
  if (chat.isGroup) return;

  const authorPhone = msg.from.split('@')[0]; // ex: 553199999999
  console.log(`Mensagem recebida de: ${authorPhone}`);

  let audioBase64 = null;
  let audioMime = null;
  let text = msg.body || "";

  // Se for uma mensagem de áudio (Pode ser ptt ou audio normal)
  if (msg.hasMedia) {
    const media = await msg.downloadMedia();
    if (media && media.mimetype.includes('audio')) {
      audioBase64 = media.data;
      audioMime = media.mimetype;
      console.log('Áudio detectado, enviando para IA transcrição...');
      msg.reply('Estou ouvindo seu áudio, um segundo...');
    }
  } else {
    // Se for só oi
    if (text.trim().toLowerCase() === 'oi' || text.trim().toLowerCase() === 'olá') {
      msg.reply('Olá! Eu sou a inteligência artificial do Lar360 =)\nMe mande um áudio ou texto com os itens de mercado que estão faltando e eu guardarei no sistema!');
      return;
    }
    msg.reply('Cadastrando itens no sistema, um momento...');
  }

  try {
    const jsonResult = await processInventoryMessage(text, audioBase64, audioMime);
    
    if (jsonResult.actions && jsonResult.actions.length > 0) {
      
      const itemList = jsonResult.actions.map(a => {
        const icon = a.type === 'add' ? '✅' : '❌';
        const tgt = a.target === 'inventory' ? 'Despensa' : 'Lista';
        return `${icon} ${a.item?.quantity || 1}x ${a.item?.name} (${tgt})`;
      }).join('\n');
      
      let dbResponse = await processInventoryActions(authorPhone, jsonResult.actions);
      
      msg.reply(`Itens identificados e ações geradas:\n${itemList}\n\n${dbResponse}`);
    } else {
      msg.reply('Não consegui identificar nenhum item de mercado na sua mensagem. Pode tentar falar de novo?');
    }

  } catch (error) {
    console.error(error);
    msg.reply('Desculpe, tive um probleminha para processar o item agora. Tente de novo mais tarde!');
  }
});

// Lógica de "Insônia" - Mantém o robô acordado 24/7
const keepAwake = () => {
    const url = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
    setInterval(async () => {
        try {
            console.log(`⏰ [Keep-Awake] Cutucando servidor em: ${url}`);
            await fetch(url);
        } catch (err) {
            console.error("❌ [Keep-Awake] Erro ao tentar se auto-cutucar:", err.message);
        }
    }, 10 * 60 * 1000); // A cada 10 minutos
};

client.initialize();
keepAwake();
