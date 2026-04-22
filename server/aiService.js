import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const GEMINI_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_KEY) {
  console.error('❌ GEMINI_API_KEY não configurada!');
}

const genAI = new GoogleGenerativeAI(GEMINI_KEY || '');

export async function processInventoryMessage(textData, base64Audio = null, mimeType = null) {
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

  const systemInstructions = `Você é o assistente inteligente do sistema "Lar 360", especialista em gestão de estoque e listas de compras.
Sua personalidade é amigável, prestativa e organizada. Você deve fazer o usuário se sentir confortável e bem atendido.

REGRAS DE CONDUTA:
1. FOCO TOTAL: Você só responde sobre gestão de estoque, listas de compras e itens domésticos.
2. SE FORA DE TÓPICO: Se o usuário fizer perguntas sobre outros assuntos (história, política, piadas off-topic, etc), responda educadamente que você é especialista no Lar 360 e só pode ajudar com a organização da casa.
3. INTERATIVIDADE: Use frases naturais e amigáveis no campo "reply".

FORMATO DE RETORNO (JSON APENAS):
{
  "actions": [
    {
      "type": "add" | "remove",
      "target": "list" | "inventory",
      "item": { "name": "string", "category": "string", "quantity": number }
    }
  ],
  "reply": "Sua resposta amigável aqui para o usuário"
}

CATEGORIAS: Hortifrúti, Laticínios, Padaria, Açougue e Frios, Bebidas, Despensa, Higiene Pessoal, Limpeza, Outros.`;

  try {
    let parts = [];
    if (base64Audio && mimeType) {
      parts.push({ inlineData: { data: base64Audio, mimeType } });
      parts.push({ text: `${systemInstructions}\n\nAnalise o áudio e responda conforme as regras.` });
    } else {
      parts.push({ text: `${systemInstructions}\n\nUsuário disse: "${textData}"` });
    }

    const result = await model.generateContent({
      contents: [{ role: 'user', parts }],
      generationConfig: { temperature: 0.2 }
    });

    let responseText = result.response.text().trim();
    
    // Limpar markdown
    responseText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    const parsed = JSON.parse(responseText);
    return parsed;

  } catch (e) {
    console.error('❌ Erro na IA:', e.message);
    return { actions: [], reply: "Desculpe, tive um probleminha para entender agora. Pode repetir? 😅" };
  }
}
