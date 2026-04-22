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
  const model = genAI.getGenerativeModel({ 
    model: 'gemini-1.5-flash',
    systemInstruction: {
      role: "system",
      parts: [{ text: `Você é o assistente inteligente do sistema "Lar 360", especialista em gestão de estoque e listas de compras.

REGRAS:
1. Responda de forma amigável e prestativa.
2. Identifique itens de mercado para adicionar à lista de compras ou ao estoque.
3. Se o usuário disser que algo ACABOU ou que PRECISA de algo, o alvo é "list" e o tipo é "add".
4. Se o usuário disser que COMPROU ou GUARDOU algo, o alvo é "inventory" e o tipo é "add".
5. Se o usuário usar um item, o alvo é "inventory" e o tipo é "remove".
6. Responda APENAS sobre organização doméstica. Se perguntarem outra coisa, diga que não pode ajudar.

CATEGORIAS: Hortifrúti, Laticínios, Padaria, Açougue e Frios, Bebidas, Despensa, Higiene Pessoal, Limpeza, Outros.

O campo "reply" deve conter sua mensagem para o usuário.
O campo "actions" deve conter a lista de mudanças no sistema.` }]
    }
  });

  try {
    let parts = [];
    if (base64Audio && mimeType) {
      parts.push({ inlineData: { data: base64Audio, mimeType } });
      parts.push({ text: "O áudio acima contém uma instrução para o Lar 360. Identifique os itens e ações." });
    } else {
      parts.push({ text: textData });
    }

    console.log('🤖 Chamando Gemini...');
    const result = await model.generateContent({
      contents: [{ role: 'user', parts }],
      generationConfig: { 
        temperature: 0,
        responseMimeType: "application/json" 
      }
    });

    const responseText = result.response.text();
    console.log('🤖 Resposta da IA:', responseText);

    if (!responseText) throw new Error("IA retornou texto vazio");

    const parsed = JSON.parse(responseText);
    
    // Garantir estrutura básica
    return {
      actions: parsed.actions || [],
      reply: parsed.reply || "Ação processada com sucesso! ✅"
    };

  } catch (e) {
    console.error('❌ CRÍTICO - Erro na IA Service:', e);
    // Tenta uma resposta de fallback mais descritiva
    return { 
      actions: [], 
      reply: "Ops! Matheus, tive um pequeno problema técnico ao processar seu áudio ou mensagem. Pode tentar falar de novo de forma mais clara? 😅" 
    };
  }
}
