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
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" }, { apiVersion: 'v1' });



    const promptParts = [SYSTEM_PROMPT];

    if (text) promptParts.push(`Mensagem de ${userFirstName || 'usuário'}: ${text}`);
    
    if (audioBase64) {
      // Limpa mimetype que pode vir com codecs (ex: audio/ogg; codecs=opus)
      const cleanMime = audioMime.split(';')[0];
      promptParts.push({ inlineData: { data: audioBase64, mimeType: cleanMime } });
      promptParts.push("IMPORTANTE: O usuário enviou um áudio. Transcreva o áudio acima e aplique as REGRAS DE OURO para extrair os itens.");
    }

    if (imageBase64) {
      const cleanMime = imageMime.split(';')[0];
      promptParts.push({ inlineData: { data: imageBase64, mimeType: cleanMime } });
      promptParts.push("Analise a imagem acima e extraia itens de mercado seguindo o formato JSON solicitado.");
    }

    const result = await model.generateContent(promptParts);
    const responseText = result.response.text();
    
    // Limpeza agressiva de JSON (remove inclusive texto fora do bloco json)
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? jsonMatch[0] : responseText;
    const parsed = JSON.parse(jsonStr.replace(/```json|```/g, '').trim());

    
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
      reply: `Desculpe, tive um pequeno tropeço aqui: ${e.message}. Pode repetir? 😊` 
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

/**
 * ATUALIZAR PREÇOS DA LISTA TODA (Proxy para Frontend)
 */
export async function refreshPricesAI(location, storesList, itemsList) {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const prompt = `Localização: ${location}. 
    Mercados: ${storesList.join(', ')}.
    Lista de produtos:
    ${itemsList.map(i => `- ${i.quantity} ${i.unit} de ${i.name}`).join('\n')}
    
    Estime o preço unitário realista em BRL para cada produto em cada um desses mercados.
    Considere promoções regionais se conhecidas.
    Retorne APENAS um JSON no formato:
    {
      "items": [
        {
           "itemName": "nome exato do item",
           "prices": { "Nome do Mercado": 15.99 }
        }
      ]
    }`;

    const result = await model.generateContent(prompt);
    return JSON.parse(result.response.text().replace(/```json|```/g, '').trim());
  } catch (e) {
    console.error('Erro no refresh de preços:', e.message);
    return { items: [] };
  }
}

/**
 * ANALISAR IMAGEM/CUPOM (Proxy para Frontend)
 */
export async function handleImageAI(mode, base64, mime, storesList) {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const prompt = `Modo: ${mode}. Analise a imagem e extraia os itens de mercado. 
    Lojas: ${storesList.join(', ')}.
    Retorne um JSON puro com os itens encontrados (nome, quantidade, unidade, categoria, preço).`;

    const result = await model.generateContent([
      prompt,
      { inlineData: { data: base64, mimeType: mime } }
    ]);
    return JSON.parse(result.response.text().replace(/```json|```/g, '').trim());
  } catch (e) {
    console.error('Erro na análise de imagem:', e.message);
    return { items: [] };
  }
}

/**
 * GERAR RELATÓRIO FINANCEIRO (Proxy para Frontend)
 */
export async function generateReportAI(data) {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const prompt = `Você é um consultor financeiro residencial especialista em economia doméstica. 
    Analise os gastos da residência atual:
    
    DADOS:
    - Custos Fixos: R$ ${data.fixedCosts}
    - Custos Variáveis: R$ ${data.varCosts}
    - Estimativa de Compras: R$ ${data.groceryTotal}
    - Total Geral: R$ ${data.total}
    - Detalhes: ${data.details}
    
    Forneça uma análise crítica em português estruturada em Markdown com resumo, áreas de redução e dicas específicas.`;

    const result = await model.generateContent(prompt);
    return { report: result.response.text() };
  } catch (e) {
    console.error('Erro no relatório AI:', e.message);
    return { report: "Erro ao gerar análise I.A." };
  }
}



