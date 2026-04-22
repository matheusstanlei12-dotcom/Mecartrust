import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const GEMINI_KEY = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(GEMINI_KEY || '');

const SYSTEM_PROMPT = `Você é o "Lar 360", um assistente residencial de elite, prestativo e inteligente.
Sua missão ÚNICA e EXCLUSIVA é ajudar o usuário a gerenciar listas de compras e estoque da casa.

--- REGRAS DE PERSONALIDADE ---
1. Seja dinâmico e use emojis moderadamente para parecer humano.
2. NUNCA diga que é um robô ou que tem "problemas técnicos". Se algo falhar de verdade, peça desculpas educadamente e sugira tentar de novo.
3. Se o usuário fizer perguntas fora de "gestão de casa e compras", responda:
   "Poxa, eu adoraria conversar sobre isso, mas fui programado especificamente para ser seu braço direito na organização da casa! 🏠 Que tal focarmos nas suas listas ou no seu estoque hoje? 😊"

--- REGRAS DE PROCESSAMENTO ---
- Identifique itens, quantidades e se é para ADICIONAR ou REMOVER da LISTA (list) ou ESTOQUE (inventory).
- Se receber uma imagem, analise os produtos que vê e extraia os nomes para a lista.

Sua resposta deve ser SEMPRE um JSON válido:
{
  "actions": [{"type": "add|remove", "target": "list|inventory", "item": "nome", "quantity": 1, "category": "categoria"}],
  "reply": "Sua resposta amigável aqui"
}`;

/**
 * Lógica Simples (Regex) para respostas instantâneas
 */
function simpleParse(text) {
  const clean = text.toLowerCase().trim();
  const result = { actions: [], reply: "" };

  if (clean.includes('adicione') || clean.includes('preciso de')) {
    const itemMatch = text.match(/(?:adicione|preciso de)\s+([^,y\.]+)/i);
    if (itemMatch) {
      result.actions.push({ type: 'add', item: itemMatch[1].trim(), quantity: 1, target: 'list', category: 'Despensa' });
      result.reply = `✅ *${itemMatch[1].trim()}* adicionado à sua lista!`;
      return result;
    }
  }
  return null;
}

export async function processInventoryMessage(text, audioBase64 = null, audioMime = null, userFirstName = null, imageBase64 = null, imageMime = null) {
  try {
    // 1. Tenta Regex rápido se for só texto
    if (!audioBase64 && !imageBase64 && text) {
      const quick = simpleParse(text);
      if (quick) return quick;
    }

    // 2. IA para casos complexos, áudio ou imagem
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const promptParts = [SYSTEM_PROMPT];

    if (text) promptParts.push(`Mensagem de ${userFirstName || 'usuário'}: ${text}`);
    
    if (audioBase64) {
      promptParts.push({ inlineData: { data: audioBase64, mimeType: audioMime } });
      promptParts.push("Analise o áudio acima.");
    }

    if (imageBase64) {
      promptParts.push({ inlineData: { data: imageBase64, mimeType: imageMime } });
      promptParts.push("Analise a imagem acima e extraia itens de mercado.");
    }

    const result = await model.generateContent(promptParts);
    const responseText = result.response.text();
    
    // Limpeza de Markdown se necessário
    const jsonStr = responseText.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(jsonStr);
    
    return {
      actions: parsed.actions || [],
      reply: parsed.reply || "Ação confirmada! ✅"
    };

  } catch (e) {
    console.error('❌ IA Error:', e.message);
    return { 
      actions: [], 
      reply: "Desculpe, tive um pequeno tropeço aqui. Pode repetir de um jeito mais simples? 😊" 
    };
  }
}
