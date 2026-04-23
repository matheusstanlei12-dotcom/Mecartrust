import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const GEMINI_KEY = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(GEMINI_KEY || '');

const SYSTEM_PROMPT = `Você é o "Lar 360", um assistente residencial de elite.
Sua missão é gerenciar listas de compras e estoque através de texto, AUDIO ou IMAGEM.

--- REGRAS DE OURO ---
1. EXTRAÇÃO: Extraia APENAS o nome do item. Se o usuário disser "Adicione arroz", o item é "arroz".
2. CATEGORIAS: Use APENAS: Mercearia/Despensa, Frutas & Vegetais, Laticínios, Padaria, Carnes e Frios, Congelados, Bebidas, Higiene Pessoal, Limpeza, Pet Shop, Lanches e Snacks, Outros.
3. IMAGENS/CUPONS: Se receber uma imagem, extraia os itens e quantidades. Marque "needsConfirmation": true para que o robô peça autorização antes de salvar.
4. AUDIO: Processe com a mesma precisão do texto.
5. PERSONALIDADE: Amigável, usa emojis, nunca admite ser robô.

Sua resposta deve ser EXCLUSIVAMENTE um JSON:
{
  "actions": [{"type": "add|remove", "target": "list|inventory", "item": "nome limpo", "quantity": 1, "category": "Mercearia/Despensa"}],
  "needsConfirmation": true|false,
  "reply": "Texto para o usuário caso não precise de confirmação, ou o resumo do que você encontrou na imagem para ele confirmar."
}`;



export async function processInventoryMessage(text, audioBase64 = null, audioMime = null, userFirstName = null, imageBase64 = null, imageMime = null) {
  try {
    // 1. IA para todos os casos - garante inteligência e evita erros de regex simples
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
