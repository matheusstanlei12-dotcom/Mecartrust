import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const GEMINI_KEY = process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(GEMINI_KEY || '');

export async function processInventoryMessage(textData, base64Audio = null, mimeType = null) {
  // Configuração do modelo com instruções de sistema fixas
  const model = genAI.getGenerativeModel({ 
    model: 'gemini-1.5-flash',
    systemInstruction: `Você é o assistente inteligente do sistema "Lar 360", especialista em gestão de estoque e listas de compras.

REGRAS:
1. Seja amigável e use o nome do usuário se fornecido.
2. Responda APENAS sobre estoque e compras. Se perguntarem outra coisa, diga que não pode ajudar com esse assunto.
3. Use o campo "reply" para sua resposta textual amigável.
4. Use o campo "actions" para listar adições ou remoções de itens.

CATEGORIAS: Hortifrúti, Laticínios, Padaria, Açougue e Frios, Bebidas, Despensa, Higiene Pessoal, Limpeza, Outros.

FORMATO JSON:
{
  "actions": [{"type": "add"|"remove", "target": "list"|"inventory", "item": {"name": "string", "category": "string", "quantity": number}}],
  "reply": "string"
}`
  });

  try {
    let parts = [];
    if (base64Audio && mimeType) {
      parts.push({ inlineData: { data: base64Audio, mimeType } });
      parts.push({ text: "Analise este áudio e identifique as intenções do usuário para o Lar 360." });
    } else {
      parts.push({ text: textData });
    }

    const result = await model.generateContent({
      contents: [{ role: 'user', parts }],
      generationConfig: { 
        temperature: 0.1,
        responseMimeType: "application/json" 
      }
    });

    const responseText = result.response.text().trim();
    console.log('🤖 IA Output:', responseText);

    return JSON.parse(responseText);

  } catch (e) {
    console.error('❌ Erro na IA:', e.message);
    return { 
      actions: [], 
      reply: "Desculpe, tive um probleminha técnico para processar seu pedido agora. Pode tentar falar de novo? 😅" 
    };
  }
}
