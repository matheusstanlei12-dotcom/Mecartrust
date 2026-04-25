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
  const start = Date.now();
  console.log(`[IA Trace] Iniciando safeGenerate (Stable Route)...`);

  const modelsToTry = ["gemini-1.5-flash", "gemini-1.5-flash-latest"];
  let lastError = null;

  for (const modelName of modelsToTry) {
    try {
      console.log(`[IA Trace] Tentando porta estável com: ${modelName}`);
      // Forçamos v1 explicitly para evitar o loop de 404 da v1beta
      const model = genAI.getGenerativeModel({ model: modelName }, { apiVersion: 'v1' });
      const result = await model.generateContent(promptParts);
      const text = result.response.text();
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      return JSON.parse((jsonMatch ? jsonMatch[0] : text).replace(/```json|```/g, '').trim());
    } catch (err) {
      lastError = err;
      console.warn(`⚠️ Erro na porta estável com ${modelName}:`, err.message);
    }
  }

  // Fallback total se mesmo a v1 falhar com multimodal
  if (promptParts.some(p => typeof p !== 'string')) {
    console.warn("[IA Trace] Falha total estável multimodal. Retentando APENAS TEXTO...");
    const textOnly = promptParts.filter(p => typeof p === 'string');
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" }, { apiVersion: 'v1' });
    const result = await model.generateContent(textOnly);
    const text = result.response.text();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse((jsonMatch ? jsonMatch[0] : text).replace(/```json|```/g, '').trim());
    if (parsed.reply) parsed.reply = "⚠️ (Áudio bloqueado pelo Google, lendo apenas texto): " + parsed.reply;
    return parsed;
  }

  throw lastError || new Error("Falha total na IA Estável");
}







function emergencyRegexFallback(text) {
  console.log("[IA Fallback] Ativando Motor de Emergência (Regex)...");
  const clean = String(text).toLowerCase().trim();
  let action = { type: 'add', target: 'list', item: '', quantity: 1, unit: 'un', category: 'Outros' };
  
  // Regex simples para capturar item e quantidade
  const addMatch = clean.match(/(?:adicione|coloca|poe|quero|pega|compra)\s+(?:(\d+)\s+)?(.*)/);
  if (addMatch) {
    action.quantity = parseInt(addMatch[1]) || 1;
    action.item = addMatch[2].trim();
  } else {
    // Se não bateu regex, assume que o texto todo é o item
    action.item = clean;
  }

  return {
    actions: action.item ? [action] : [],
    needsConfirmation: true,
    reply: action.item ? `(Modo de Emergência) Entendi: ${action.quantity}x ${action.item}.` : "Não entendi o item, mas estou em modo de emergência."
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
    
    // Mostra o erro técnico longo para diagnóstico real
    const techError = e.message.substring(0, 300);
    const friendlyError = `Poxa, o Google não deixou eu ouvir esse áudio agora. 📝 *Pode escrever o que você precisa?* \n\n(Dica: mande áudios de +6 segundos)\n\n(Erro: ${techError})`;

    
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
    return { category: 'Outros', prices: {}, promoText: 'Erro' };
  }
}

export async function findStoresAI(location) {
  try {
    const prompt = `Liste 5 supermercados reais em ${location}. 
    Retorne JSON: { "city": "Nome", "stores": [{"name": "Loja", "address": "End", "color": "#hex"}] }`;
    return await safeGenerate([prompt]);
  } catch (e) {
    return { city: 'Desconhecida', stores: [] };
  }
}

export async function refreshPricesAI(location, storesList, itemsList) {
  try {
    const prompt = `Localização: ${location}. Lojas: ${storesList.join(', ')}.
    Lista: ${itemsList.map(i => `${i.quantity} ${i.name}`).join(', ')}.
    Retorne JSON com preços: { "items": [{"itemName": "nome", "prices": {"Loja": 1.99}}] }`;
    return await safeGenerate([prompt]);
  } catch (e) {
    return { items: [] };
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
