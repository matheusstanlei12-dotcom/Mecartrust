import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const GEMINI_KEY = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(GEMINI_KEY || '');

export async function processInventoryMessage(textData, base64Audio = null, mimeType = null, userName = '') {
  const systemPrompt = `Você é o assistente inteligente "Lar 360", especialista em organização doméstica.
Sua missão é ajudar ${userName || 'o usuário'} a gerenciar a lista de compras e o estoque da casa.

ESTILO DE RESPOSTA:
- Seja extremamente educado, amigável e prelativa.
- Trate o usuário por ${userName || 'você'} ou pelo nome se souber.
- Responda de forma curta e objetiva confirmando o que foi feito.

REGRAS TÉCNICAS (Sempre retorne JSON):
1. Identifique itens e ações. Use SEMPRE minúsculas para "type", "target" e "unit".
2. Alvos disponíveis: "list" (lista de compras) ou "inventory" (estoque da casa).
3. Mapeamento de intenções:
   - "Acabou X", "Preciso de X", "Coloca X na lista", "Falta X" -> alvo: "list", tipo: "add".
   - "Comprei X", "Guardei X", "Repor X" -> alvo: "inventory", tipo: "add".
   - "Usei X", "Gastei X", "Tirei do estoque X" -> alvo: "inventory", tipo: "remove".
   - "Tira X da lista", "Não precisa mais de X" -> alvo: "list", tipo: "remove".
4. Se o usuário mandar uma lista de itens, processe todos em "actions".
5. Categorias: Hortifrúti, Laticínios, Padaria, Açougue e Frios, Bebidas, Despensa, Higiene Pessoal, Limpeza, Outros.

ESTRUTURA JSON:
{
  "reply": "Sua mensagem amigável aqui",
  "actions": [
    { "type": "add/remove", "item": "nome do item", "quantity": 1, "unit": "un/kg/l/pct", "target": "list/inventory", "category": "..." }
  ]
}`;

  const modelsToTry = ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-pro'];
  let result = null;
  let lastError = null;

  for (const modelName of modelsToTry) {
    try {
      console.log(`🤖 Tentando modelo: ${modelName}...`);
      const model = genAI.getGenerativeModel({ model: modelName });
      
      let parts = [{ text: systemPrompt }];
      if (base64Audio && mimeType) {
        parts.push({ inlineData: { data: base64Audio, mimeType } });
        parts.push({ text: "O áudio acima contém uma instrução para o Lar 360. Identifique os itens e ações." });
      } else {
        parts.push({ text: textData });
      }

      result = await model.generateContent({
        contents: [{ role: 'user', parts }],
        generationConfig: { 
          temperature: 0,
          responseMimeType: "application/json" 
        }
      });

      if (result && result.response) break;
    } catch (e) {
      console.warn(`⚠️ Falha no modelo ${modelName}:`, e.message);
      lastError = e;
    }
  }

  try {
    if (!result) throw lastError || new Error("Nenhum modelo disponível no momento");

    const responseText = result.response.text();
    console.log('🤖 Resposta da IA:', responseText);

    if (!responseText) throw new Error("IA retornou texto vazio");

    const parsed = JSON.parse(responseText);
    
    return {
      actions: parsed.actions || [],
      reply: parsed.reply || "Ação processada com sucesso! ✅"
    };

  } catch (e) {
    console.error('❌ CRÍTICO - Erro na IA Service:', e.message);
    
    // MODO DE SEGURANÇA: Regex básico para não travar o sistema
    const fallbackResult = { actions: [], reply: "" };
    const cleanText = textData.toLowerCase();

    // Regex simples para captar "Item" e "Ação"
    if (cleanText.includes('adicione') || cleanText.includes('preciso') || cleanText.includes('coloca')) {
      const match = textData.match(/(?:adicione|preciso de|coloca)\s+([^,y\.]+)/i);
      if (match) {
        fallbackResult.actions.push({ type: 'add', item: match[1].trim(), quantity: 1, target: 'list', category: 'Despensa' });
        fallbackResult.reply = `⚠️ (Modo de Segurança) Notei que você quer adicionar *${match[1].trim()}* à lista. Anotado! ✅`;
      }
    } else if (cleanText.includes('comprei') || cleanText.includes('guardei')) {
      const match = textData.match(/(?:comprei|guardei)\s+([^,y\.]+)/i);
      if (match) {
        fallbackResult.actions.push({ type: 'add', item: match[1].trim(), quantity: 1, target: 'inventory', category: 'Despensa' });
        fallbackResult.reply = `⚠️ (Modo de Segurança) Registrei *${match[1].trim()}* no seu estoque. ✅`;
      }
    }

    if (fallbackResult.actions.length > 0) return fallbackResult;

    return { 
      actions: [], 
      reply: "Ops! Tive um problema técnico ao processar sua mensagem. Se for algo importante como 'Adicione café na lista', tente falar de forma bem simples enquanto resolvo isso! 😅" 
    };
  }
}
