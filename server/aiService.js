import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export async function processInventoryMessage(textData, base64Audio = null, mimeType = null) {
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  const systemPrompt = `Você é um assistente inteligente de controle de estoque doméstico integrado ao WhatsApp.
Sua tarefa é analisar mensagens (texto ou áudio transcrito) e identificar ações sobre itens.

REGRAS:
- Se o usuário quer COMPRAR, ADICIONAR À LISTA ou menciona que ACABOU algo → tipo "add", alvo "list"
- Se o usuário JÁ COMPROU e quer GUARDAR no estoque → tipo "add", alvo "inventory"  
- Se o usuário USOU, CONSUMIU ou quer REMOVER do estoque → tipo "remove", alvo "inventory"
- Se pedir para remover da lista de compras → tipo "remove", alvo "list"

EXEMPLOS:
- "comprar leite" → add, list, Leite
- "adicione arroz na lista" → add, list, Arroz
- "acabou o sabão" → add, list, Sabão em Pó
- "preciso de 2 pacotes de macarrão" → add, list, Macarrão, quantity: 2
- "guardei o feijão" → add, inventory, Feijão
- "usei o detergente" → remove, inventory, Detergente

Responda APENAS com JSON válido, sem texto antes ou depois:
{
  "actions": [
    {
      "type": "add",
      "target": "list",
      "item": {
        "name": "Nome do Item",
        "category": "Categoria",
        "quantity": 1
      }
    }
  ]
}

Categorias disponíveis: Hortifrúti, Laticínios, Padaria, Açougue e Frios, Congelados, Bebidas, Despensa, Higiene Pessoal, Limpeza, Pet Shop, Lanches e Snacks, Outros`;

  try {
    let parts = [];

    // Adicionar áudio se existir
    if (base64Audio && mimeType) {
      parts.push({
        inlineData: { data: base64Audio, mimeType }
      });
      parts.push({ text: `${systemPrompt}\n\nAnalise o áudio acima e extraia as ações.` });
    } else {
      // Apenas texto
      parts.push({ text: `${systemPrompt}\n\nMensagem do usuário: "${textData}"` });
    }

    const result = await model.generateContent({
      contents: [{ role: 'user', parts }],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.1 // Mais determinístico
      }
    });

    const responseText = result.response.text();
    console.log('🤖 IA retornou:', responseText);
    
    const parsed = JSON.parse(responseText || '{"actions":[]}');
    return parsed;
  } catch(e) {
    console.error("❌ Erro da IA:", e.message);
    return { actions: [] };
  }
}
