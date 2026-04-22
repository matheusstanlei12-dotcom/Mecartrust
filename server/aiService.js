import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const GEMINI_KEY = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(GEMINI_KEY || '');

/**
 * Lógica Simples (Regex) para processamento instantâneo sem IA
 */
function simpleParse(text) {
  const clean = text.toLowerCase().trim();
  const result = { actions: [], reply: "" };

  // PADRÕES DE ADICIONAR NA LISTA
  if (clean.includes('adicione') || clean.includes('preciso de') || clean.includes('coloca') || clean.includes('falta')) {
    const itemMatch = text.match(/(?:adicione|preciso de|coloca|falta)\s+([^,y\.]+)/i);
    if (itemMatch) {
      result.actions.push({ type: 'add', item: itemMatch[1].trim(), quantity: 1, target: 'list', category: 'Despensa' });
      result.reply = `✅ *${itemMatch[1].trim()}* adicionado à sua lista de compras!`;
      return result;
    }
  }

  // PADRÕES DE ADICIONAR NO ESTOQUE (COMPREI)
  if (clean.includes('comprei') || clean.includes('guardei') || clean.includes('repor')) {
    const itemMatch = text.match(/(?:comprei|guardei|repor)\s+([^,y\.]+)/i);
    if (itemMatch) {
      result.actions.push({ type: 'add', item: itemMatch[1].trim(), quantity: 1, target: 'inventory', category: 'Despensa' });
      result.reply = `📦 *${itemMatch[1].trim()}* registrado no seu estoque!`;
      return result;
    }
  }

  // PADRÕES DE REMOVER DO ESTOQUE (USEI)
  if (clean.includes('usei') || clean.includes('tirei') || clean.includes('acabou')) {
    const itemMatch = text.match(/(?:usei|tirei|acabou)\s+([^,y\.]+)/i);
    if (itemMatch) {
      result.actions.push({ type: 'remove', item: itemMatch[1].trim(), quantity: 1, target: 'inventory', category: 'Despensa' });
      result.reply = `❌ Retirei *${itemMatch[1].trim()}* do seu estoque.`;
      return result;
    }
  }

  // PADRÕES DE REMOVER DA LISTA
  if (clean.includes('tira') || clean.includes('remover') || clean.includes('não precisa')) {
    const itemMatch = text.match(/(?:tira|remover|não precisa de)\s+([^,y\.]+)/i);
    if (itemMatch) {
      result.actions.push({ type: 'remove', item: itemMatch[1].trim(), quantity: 1, target: 'list', category: 'Despensa' });
      result.reply = `🗑️ *${itemMatch[1].trim()}* removido da lista de compras.`;
      return result;
    }
  }

  return null; // Não conseguiu processar de forma simples
}

export async function processInventoryMessage(textData, base64Audio = null, mimeType = null, userName = '') {
  // 1. TENTA PROCESSAMENTO SIMPLES PARATEXTO (Rápido e sem erro de API)
  if (!base64Audio && textData) {
    const simple = simpleParse(textData);
    if (simple) {
      console.log('⚡ Processamento Instantâneo (Regex) bem-sucedido!');
      return simple;
    }
  }

  // 2. SE NÃO FOR SIMPLES OU FOR ÁUDIO, USA IA COM RETRY
  const systemPrompt = `Você é o assistente "Lar 360". Identifique itens e ações.
Retorne SEMPRE JSON: { "reply": "...", "actions": [{ "type": "add/remove", "item": "...", "target": "list/inventory", "quantity": 1 }] }`;

  const modelsToTry = ['gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-2.0-flash'];
  let result = null;
  let lastError = null;

  for (const modelName of modelsToTry) {
    try {
      console.log(`🤖 Tentando IA (${modelName})...`);
      const model = genAI.getGenerativeModel({ model: modelName });
      
      let parts = [{ text: systemPrompt }];
      if (base64Audio && mimeType) {
        parts.push({ inlineData: { data: base64Audio, mimeType } });
      } else {
        parts.push({ text: textData });
      }

      result = await model.generateContent({
        contents: [{ role: 'user', parts }],
        generationConfig: { temperature: 0, responseMimeType: "application/json" }
      });

      if (result && result.response) break;
    } catch (e) {
      console.warn(`⚠️ Erro no modelo ${modelName}:`, e.message);
      lastError = e;
    }
  }

  try {
    if (!result) throw lastError || new Error("Indisponível");

    const responseText = result.response.text();
    const parsed = JSON.parse(responseText);
    
    return {
      actions: parsed.actions || [],
      reply: parsed.reply || "Ação confirmada! ✅"
    };

  } catch (e) {
    console.error('❌ IA falhou:', e.message);
    return { 
      actions: [], 
      reply: "Ops! Tive um problema técnico. Tente escrever de forma simples, ex: 'Adicione arroz'." 
    };
  }
}
