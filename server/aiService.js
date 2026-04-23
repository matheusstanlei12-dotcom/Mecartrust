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
1. EXTRAÇÃO: Extraia o nome do item, QUANTIDADE e UNIDADE (ex: kg, L, un). Se o usuário disser "5 arroz de 15kg", item="arroz", quantity=5, unit="15kg".
2. CATEGORIAS: Use APENAS: Mercearia/Despensa, Frutas & Vegetais, Laticínios, Padaria, Carnes e Frios, Congelados, Bebidas, Higiene Pessoal, Limpeza, Pet Shop, Lanches e Snacks, Outros.
3. CONFIRMAÇÃO OBRIGATÓRIA: Para TODA e QUALQUER solicitação (texto, áudio ou imagem), você deve retornar "needsConfirmation": true.
4. PERSONALIDADE: Humana, prestativa, usa emojis.

Sua resposta deve ser EXCLUSIVAMENTE um JSON:
{
  "actions": [{"type": "add|remove", "target": "list|inventory", "item": "nome limpo", "quantity": 5, "unit": "15kg", "category": "Mercearia/Despensa"}],
  "needsConfirmation": true,
  "reply": "Resumo do que você entendeu para o usuário confirmar (ex: '5 pacotes de Arroz de 15kg')"
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
      needsConfirmation: parsed.needsConfirmation || false,
      reply: parsed.reply || "Ação confirmada! ✅"
    };

  } catch (e) {
    console.error('❌ IA Error:', e.message);
    return { 
      actions: [], 
      needsConfirmation: false,
      reply: "Desculpe, tive um pequeno tropeço aqui. Pode repetir de um jeito mais simples? 😊" 
    };
  }
}

/**
 * ANALISAR ITEM (Proxy para Frontend)
 * Busca categorias, preços e PROMOÇÕES na região do usuário.
 */
export async function analyzeItemAI(itemName, storesList) {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const prompt = `Análise detalhada para o item: "${itemName}".
    REQUISITOS:
    1. Determine a categoria adequada.
    2. Pesquise e estime preços reais e PROMOÇÕES atuais para este item nos supermercados: ${storesList.join(', ')}.
    3. Busque ser o mais fiel possível aos preços praticados em grandes redes regionais (como BH, EPA, Apoio, Carrefour, etc).
    4. Se houver promoções conhecidas (ex: leve 3 pague 2, desconto na 2a unidade), leve isso em conta no preço médio.

    Retorne APENAS um JSON:
    {
      "category": "String",
      "prices": { "Nome do Mercado": ValorNumerico },
      "promoText": "Breve nota sobre promoções encontradas ou 'Preços regulares'"
    }`;

    const result = await model.generateContent(prompt);
    return JSON.parse(result.response.text().replace(/```json|```/g, '').trim());
  } catch (e) {
    console.error('Erro na análise de IA:', e.message);
    return { category: 'Outros', prices: {}, promoText: 'Erro na cotação' };
  }
}

/**
 * BUSCAR MERCADOS NA REGIÃO (Proxy para Frontend)
 */
export async function findStoresAI(location) {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const prompt = `Localize os 5 supermercados mais populares e reais próximos a esta localização: ${location}.
    Retorne APENAS um JSON:
    {
      "city": "Nome da Cidade",
      "stores": [{"name": "Nome", "address": "Endereço aproximado", "color": "#hex"}]
    }`;

    const result = await model.generateContent(prompt);
    return JSON.parse(result.response.text().replace(/```json|```/g, '').trim());
  } catch (e) {
    console.error('Erro ao buscar mercados:', e.message);
    return { city: 'Desconhecida', stores: [] };
  }
}

