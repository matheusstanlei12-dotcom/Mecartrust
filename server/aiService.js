import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function processInventoryMessage(textData, base64Audio = null, mimeType = null) {
  let contents = [];
  
  const prompt = `Você é um assistente de mercado do app Lar360 conversando via WhatsApp.
Sua missão é extrair as intenções do usuário (em áudio ou texto) sobre itens de estoque e mercado.
Se o usuário quer COMPRAR / ANOTAR algo, é uma ação "add" com alvo "list".
Se o usuário JÁ COMPROU / QUER GUARDAR no armário, é uma ação "add" com alvo "inventory".
Se o usuário CONSUMIU / USOU / QUER REMOVER, é uma ação "remove" com alvo "inventory". (Se ele mandar remover da lista de compras, alvo "list").

Retorne EXATAMENTE um JSON na estrutura:
{ 
  "actions": [
    { 
      "type": "add" ou "remove", 
      "target": "list" ou "inventory", 
      "item": { 
        "name": "Nome padronizado do item (ex: Arroz, Detergente Líquido)", 
        "category": "Escolha entre: Frutas & Vegetais, Laticínios, Padaria, Carnes e Frios, Congelados, Bebidas, Mercearia/Despensa, Higiene Pessoal, Limpeza, Pet Shop, Lanches e Snacks, Outros", 
        "quantity": NumeroInt 
      } 
    }
  ]
}`;

  contents.push({ text: prompt });

  if (base64Audio && mimeType) {
    contents.push({
      inlineData: {
        data: base64Audio,
        mimeType: mimeType
      }
    });
  }
  
  if (textData) {
    contents.push({ text: `Mensagem textual extra do usuário: ` + textData });
  }

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash", // Use the latest flash
      contents: contents,
      config: {
        responseMimeType: "application/json",
      }
    });
    return JSON.parse(response.text || '{"items":[]}');
  } catch(e) {
    console.error("AI Error processing message:", e);
    return { items: [] };
  }
}
