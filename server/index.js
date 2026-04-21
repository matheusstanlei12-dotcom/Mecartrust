import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pkg from 'whatsapp-web.js';
const { Client, LocalAuth, MessageMedia } = pkg;
import qrcode from 'qrcode-terminal';

import { initFirebase, processInventoryActions, db } from './firebaseAdmin.js';
import { processInventoryMessage } from './aiService.js';

// Inicializar banco
const hasDB = initFirebase();
if (!hasDB) {
  process.exit(1);
}

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
      args: ['--no-sandbox', '--disable-setuid-sandbox']
  }
});

// Inicializado
client.on('qr', (qr) => {
  console.log('🤖 Escaneie este QR Code pelo WhatsApp do seu celular comercial para ativar o robô!');
  qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
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

client.initialize();
