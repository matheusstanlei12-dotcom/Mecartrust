import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const GEMINI_KEY = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(GEMINI_KEY || '');

const SYSTEM_PROMPT = `Você é o "Lar 360", assistente residencial.
Gerencie listas e estoque via texto, AUDIO ou IMAGEM.

REGRAS:
1. EXTRAÇÃO: Nome, QUANTIDADE e UNIDADE (ex: kg, L, un).
2. CATEGORIAS: Mercearia, Frutas/Vegetais, Laticínios, Padaria, Carnes, Congelados, Bebidas, Higiene, Limpeza, Pet, Lanches, Outros.
3. SEMPRE retorne "needsConfirmation": true.
4. No campo "reply", comece com: Ouvido: "[transcrição]".

Retorne EXCLUSIVAMENTE um JSON:
{
  "actions": [{"type": "add|remove", "target": "list|inventory", "item": "nome", "quantity": 1, "unit": "un", "category": "Categoria"}],
  "needsConfirmation": true,
  "reply": "Texto sintetizado para o usuário"
}`;

async function safeGenerate(promptParts) {
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" }, { apiVersion: 'v1' });
  const result = await model.generateContent(promptParts);
  const text = result.response.text();
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  return JSON.parse((jsonMatch ? jsonMatch[0] : text).replace(/```json|```/g, '').trim());
}








function emergencyRegexFallback(text) {
  console.log("[IA Fallback] Ativando Motor de Emergência (Regex)...");
  const clean = String(text).toLowerCase().trim()
    .replace(/[?!.]/g, '') // Remove pontuações
    .replace(/(?:por favor|obrigado|gentileza)/g, '').trim();

  let action = { type: 'add', target: 'list', item: '', quantity: 1, unit: 'un', category: 'Outros' };
  
  // Detecta intenção de REMOVER
  if (clean.match(/(?:apague|remova|tira|delete|exclua|remove)/)) {
    action.type = 'remove';
    const itemMatch = clean.match(/(?:apague|remova|tira|delete|exclua|remove)\s+(?:(\d+)\s+)?(.*)/);
    if (itemMatch) {
      action.quantity = parseInt(itemMatch[1]) || 1;
      action.item = itemMatch[2].trim();
    }
  } else {
    // Detecta intenção de ADICIONAR
    action.type = 'add';
    const addMatch = clean.match(/(?:adicione|coloca|poe|quero|pega|compra)\s+(?:(\d+)\s+)?(.*)/);
    if (addMatch) {
      action.quantity = parseInt(addMatch[1]) || 1;
      action.item = addMatch[2].trim();
    } else {
      action.item = clean;
    }
  }

  // LIMPEZA FINAL DO ITEM (Remove sufixos comuns que poluem a lista)
  if (action.item) {
    action.item = action.item
      .replace(/(?:à minha lista|na minha lista|no meu estoque|do estoque|da lista|no carrinho)/g, '')
      .replace(/(?:de|do|da)\s*$/g, '') // Remove preposições soltas no fim
      .trim();
  }

  const emoji = action.type === 'add' ? '📦' : '🗑️';
  const verb = action.type === 'add' ? 'Adicionar' : 'Remover';

  return {
    actions: action.item ? [action] : [],
    needsConfirmation: true,
    reply: action.item ? `Entendi: ${verb} ${action.quantity}x ${action.item}.` : "Não entendi o comando, mas estou ouvindo."
  };

}


export async function processInventoryMessage(text, audioBase64 = null, audioMime = null, userFirstName = null, imageBase64 = null, imageMime = null) {
  try {
    const promptParts = [SYSTEM_PROMPT];
    if (text) promptParts.push(`Mensagem de ${userFirstName || 'usuário'}: ${text}`);
    if (audioBase64) {
      promptParts.push({ inlineData: { data: audioBase64, mimeType: audioMime.split(';')[0] } });
      promptParts.push("DICA: Transcreva e identifique itens.");
    }
    if (imageBase64) {
      promptParts.push({ inlineData: { data: imageBase64, mimeType: imageMime.split(';')[0] } });
      promptParts.push("DICA: Analise a imagem.");
    }

    const data = await safeGenerate(promptParts);
    return {
      actions: data.actions || [],
      needsConfirmation: data.needsConfirmation ?? true,
      reply: data.reply || "Tudo certo! ✅"
    };
  } catch (e) {
    console.error('❌ IA Error (Acionando Fallback):', e.message);
    
    // Erro amigável para o usuário
    const friendlyError = "Poxa, não consegui processar seu áudio ou imagem agora. 📝 *Pode escrever o que você precisa? Estou pronto para anotar!*";


    
    if (text) {
      return emergencyRegexFallback(text);
    }
    return { 
      actions: [], 
      needsConfirmation: false,
      reply: friendlyError 
    };
  }
}




export async function analyzeItemAI(itemText, location, stores) {
  try {
    const prompt = `Analise este item de mercado: "${itemText}" em ${location}. 
    Mercados: ${stores.join(', ')}.
    Retorne JSON: { "category": "String", "prices": { "Mercado": 5.99 }, "promoText": "String" }`;
    return await safeGenerate([prompt]);
  } catch (e) {
    console.warn("⚠️ Fallback de preço para item único.");
    return { category: 'Outros', prices: { [stores[0] || 'Mercado']: 4.90 }, promoText: 'Preço estimado' };
  }
}

export async function findStoresAI(location) {
  try {
    const prompt = `Liste 5 supermercados reais em ${location}. 
    Retorne JSON: { "city": "Nome", "stores": [{"name": "Loja", "address": "End", "color": "#hex"}] }`;
    return await safeGenerate([prompt]);
  } catch (e) {
    console.warn("⚠️ Fallback de lojas na região.");
    return { city: location, stores: [
      { name: 'Supermercados BH', address: 'Região Central', color: '#e63946' },
      { name: 'EPA Plus', address: 'Bairro Próximo', color: '#1d3557' }
    ] };
  }
}

export async function refreshPricesAI(location, storesList, itemsList) {
  try {
    const prompt = `Localização: ${location}. Lojas: ${storesList.join(', ')}.
    Lista: ${itemsList.map(i => `${i.quantity} ${i.name}`).join(', ')}.
    Retorne JSON com preços: { "items": [{"itemName": "nome", "prices": {"Loja": 1.99}}] }`;
    return await safeGenerate([prompt]);
  } catch (e) {
    console.warn("⚠️ Fallback de preços da lista inteira.");
    // Gera estimativa básica para não ficar R$ 0.00
    const items = itemsList.map(item => ({
      itemName: item.name,
      prices: storesList.reduce((acc, store) => ({ ...acc, [store]: 5.50 }), {})
    }));
    return { items };
  }
}


export async function handleImageAI(mode, base64, mime, storesList) {
  try {
    const prompt = `Modo: ${mode}. Lojas: ${storesList.join(', ')}. Extraia itens de mercado desta imagem.`;
    return await safeGenerate([prompt, { inlineData: { data: base64, mimeType: mime.split(';')[0] } }]);
  } catch (e) {
    return { items: [] };
  }
}

export async function generateReportAI(data) {
  try {
    const prompt = `Analise estes gastos domésticos: Fixos R$ ${data.fixedCosts}, Variáveis R$ ${data.varCosts}. Forneça relatório Markdown.
    Retorne JSON: { "report": "Texto Markdown" }`;
    return await safeGenerate([prompt]);
  } catch (e) {
    return { report: "Erro ao gerar relatório." };
  }
}
