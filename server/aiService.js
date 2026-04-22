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

  try {
    let prompt = '';
    let parts = [];

    if (base64Audio && mimeType) {
      // Com áudio: transcrever e interpretar
      prompt = `Você é um assistente de lista de compras. Analise este áudio e identifique os itens mencionados.
      
Retorne SOMENTE este JSON (sem markdown, sem texto extra):
{"actions":[{"type":"add","target":"list","item":{"name":"Nome do Item","category":"Despensa","quantity":1}}]}

Se não identificar itens, retorne: {"actions":[]}`;
      
      parts = [
        { inlineData: { data: base64Audio, mimeType } },
        { text: prompt }
      ];
    } else {
      // Só texto
      prompt = `Você é um assistente de lista de compras. O usuário disse: "${textData}"

Extraia os itens de mercado mencionados e retorne SOMENTE este JSON (sem markdown, sem \`\`\`, sem texto extra):
{"actions":[{"type":"add","target":"list","item":{"name":"Nome do Item","category":"Despensa","quantity":1}}]}

Regras:
- "add" + "list" = comprar/adicionar à lista de compras
- "add" + "inventory" = guardar no estoque (quando disse que já comprou)
- "remove" + "inventory" = consumiu/usou um item
- quantity deve ser número inteiro
- category: Hortifrúti, Laticínios, Padaria, Açougue e Frios, Bebidas, Despensa, Higiene Pessoal, Limpeza, Outros

Exemplos:
"preciso de arroz" → {"actions":[{"type":"add","target":"list","item":{"name":"Arroz","category":"Despensa","quantity":1}}]}
"adicione leite e pão" → {"actions":[{"type":"add","target":"list","item":{"name":"Leite","category":"Laticínios","quantity":1}},{"type":"add","target":"list","item":{"name":"Pão","category":"Padaria","quantity":1}}]}
"acabou o sabão" → {"actions":[{"type":"add","target":"list","item":{"name":"Sabão","category":"Limpeza","quantity":1}}]}
"comprei feijão" → {"actions":[{"type":"add","target":"inventory","item":{"name":"Feijão","category":"Despensa","quantity":1}}]}

Retorne SOMENTE o JSON, sem mais nada:`;
      
      parts = [{ text: prompt }];
    }

    const result = await model.generateContent({
      contents: [{ role: 'user', parts }],
      generationConfig: { temperature: 0 }
    });

    let responseText = result.response.text().trim();
    console.log('🤖 IA raw:', responseText);

    // Limpar markdown se houver
    responseText = responseText
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();

    const parsed = JSON.parse(responseText);
    console.log('✅ IA parsed:', JSON.stringify(parsed));
    return parsed;

  } catch (e) {
    console.error('❌ Erro na IA:', e.message);
    return { actions: [] };
  }
}
