import admin from 'firebase-admin';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Carregamento dinâmico da conta de serviço
export function initFirebase() {
  const serviceAccountVar = process.env.CONTA_DE_SERVIÇO_FIREBASE || process.env.FIREBASE_SERVICE_ACCOUNT;
  
  if (serviceAccountVar) {
    try {
      const serviceAccount = JSON.parse(serviceAccountVar);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
      console.log('✅ Firebase Admin inicializado via Variável de Ambiente.');
      return admin.firestore();
    } catch (e) {
      console.error('❌ Erro ao processar JSON da conta de serviço:', e.message);
    }
  }

  const localKeyPath = path.join(__dirname, 'serviceAccountKey.json');
  if (fs.existsSync(localKeyPath)) {
    const serviceAccount = JSON.parse(fs.readFileSync(localKeyPath, 'utf8'));
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    console.log('✅ Firebase Admin inicializado via Arquivo Local.');
    return admin.firestore();
  }

  console.warn('⚠️ Firebase não inicializado corretamente. Verifique as credenciais.');
  // Retorna um objeto mockado básico para não travar o servidor se as chaves faltarem
  return {
    collection: () => ({
      where: () => ({ get: async () => ({ empty: true, docs: [] }) }),
      doc: () => ({ 
        get: async () => ({ exists: false, data: () => ({}) }),
        set: async () => ({}),
        update: async () => ({})
      }),
      get: async () => ({ empty: true, docs: [], forEach: () => {} })
    })
  };
}

export const db = initFirebase();
const FieldValue = admin.firestore.FieldValue;

/**
 * SALVAR AÇÕES NO FIREBASE
 */
export async function processInventoryActions(phone, actionsArray) {
  if (!actionsArray || actionsArray.length === 0) return "Nenhuma ação para processar.";

  // Normaliza o telefone do WhatsApp
  const cleanPhone = String(phone).replace(/\D/g, '');
  const searchSuffix = cleanPhone.slice(-7); // Usar 7 dígitos é o mais seguro contra erro de 9º dígito e DDD

    // 1. Achar o Usuário (Com Auto-Limpeza de duplicados)
    const usersSnap = await db.collection('users').get();
    let candidates = [];
    
    usersSnap.forEach(doc => {
      const data = doc.data();
      const dbPhone = String(data.phone || '').replace(/\D/g, '');
      const dbWhId = String(data.whatsappId || '').replace(/\D/g, '');
      
      if (dbPhone.endsWith(searchSuffix) || dbWhId.endsWith(searchSuffix)) {
        candidates.push({ id: doc.id, ...data, ref: doc.ref });
      }
    });

    if (candidates.length === 0) {
      return "Não encontrei sua conta. Por favor, cadastre seu número no site Lar 360 primeiro!";
    }

    // Ordena: Primeiro os que tem activeResidenceId, depois por ID (mais novos tendem a ser melhores)
    candidates.sort((a, b) => (b.activeResidenceId ? 1 : 0) - (a.activeResidenceId ? 1 : 0));
    userDoc = candidates[0];

    // Limpeza em background para não travar a resposta
    if (candidates.length > 1) {
      console.log(`🧹 [CLEANUP] Removendo ${candidates.length - 1} rastros duplicados.`);
      for (let i = 1; i < candidates.length; i++) {
        candidates[i].ref.delete().catch(() => {}); 
      }
    }

    if (!userDoc) return "Erro interno ao localizar perfil.";
    const uid = userDoc.id;
    console.log(`👤 Usuário: ${userDoc.name} (${uid})`);

  // 2. Achar a Residência (OBRIGATÓRIA agora para evitar erros)
  let residenceId = userDoc.activeResidenceId;

  if (!residenceId) {
    console.log(`❌ Usuário sem activeResidenceId vinculado.`);
    return `Olá ${userDoc.name || 'usuário'}! 🏠 Percebi que você ainda não vinculou seu WhatsApp a uma casa específica.\n\nPor favor, acesse o site, vá na aba *Assistente WhatsApp* e clique em *Priorizar esta Casa* para que eu saiba onde salvar seus itens!`;
  }

  // Verifica se a residência ainda existe e se o usuário é membro
  const resCheck = await db.collection('residences').doc(residenceId).get();
  if (!resCheck.exists) {
    return `⚠️ A casa vinculada ao seu perfil não foi encontrada. Por favor, vincule novamente no site.`;
  }

  console.log(`🏠 Residência validada: ${residenceId}`);

  // 3. Achar a Melhor Lista
  const listSnap = await db.collection(`residences/${residenceId}/lists`).get();
  let listRef;
  let listName = 'Compras da Semana';

  if (listSnap.empty) {
    console.log(`❕ Nenhuma lista encontrada. Criando padrão.`);
    listRef = db.collection(`residences/${residenceId}/lists`).doc(listName);
  } else {
    // Tenta 'Compras da Semana'
    const preferred = listSnap.docs.find(d => d.id === 'Compras da Semana');
    if (preferred) {
      listRef = preferred.ref;
      listName = preferred.id;
    } else {
      // Se não achar, pega a PRIMEIRA que existir para garantir que o usuário veja o item
      listRef = listSnap.docs[0].ref;
      listName = listSnap.docs[0].id;
      console.log(`📋 Usando lista existente encontrada: ${listName}`);
    }
  }

  const listDoc = await listRef.get();
  let listItems = listDoc.exists ? (listDoc.data().items || []) : [];
  let listModified = false;

  for (const action of actionsArray) {
    const target = String(action.target || 'list').toLowerCase();
    const type = String(action.type || 'add').toLowerCase();
    const item = String(action.item || '').trim();
    const qty = Number(action.quantity) || 1;
    const category = action.category || 'Despensa';

    if (!item) continue;

    if (target === 'list' || target === 'compras') {
      const idx = listItems.findIndex(i => i.name.toLowerCase().trim() === item.toLowerCase().trim());
      if (type === 'add') {
        if (idx >= 0) {
          listItems[idx].quantity = (Number(listItems[idx].quantity) || 0) + qty;
        } else {
          listItems.push({
            id: Math.random().toString(36).substr(2, 9),
            name: item,
            quantity: qty,
            unit: action.unit || 'un',
            category: category,
            checked: false,
            prices: {}
          });
        }
        listModified = true;
      } else if (type === 'remove' && idx >= 0) {
        listItems.splice(idx, 1);
        listModified = true;
      }
    } else if (target === 'inventory' || target === 'estoque') {
      try {
        const invRef = db.collection(`residences/${residenceId}/inventory`);
        const invSnap = await invRef.where('name', '==', item).get();
        
        if (type === 'add') {
          if (!invSnap.empty) {
            const current = Number(invSnap.docs[0].data().current || 0);
            await invRef.doc(invSnap.docs[0].id).update({ current: current + qty });
          } else {
            await invRef.add({ name: item, current: qty, min: 1, unit: action.unit || 'un', category });
          }
        } else if (type === 'remove' && !invSnap.empty) {
          const current = Number(invSnap.docs[0].data().current || 0);
          await invRef.doc(invSnap.docs[0].id).update({ current: Math.max(0, current - qty) });
        }
      } catch (e) {
        console.error('Erro no processamento de estoque:', e.message);
      }
    }
  }

  if (listModified) {
    await listRef.set({ 
      items: listItems, 
      updatedAt: admin.firestore.FieldValue.serverTimestamp() 
    }, { merge: true });
  }

  // Busca nome e código da casa para transparência total no WhatsApp
  const resDoc = await db.collection('residences').doc(residenceId).get();
  const resData = resDoc.data();
  const resName = resData?.name || 'Casa';
  const inviteCode = resData?.inviteCode || '???';

  return `Operação realizada com sucesso! ✅\n📦 Lista: *"${listName}"* (${listItems.length} itens)\n🏠 Casa: *${resName}* (${inviteCode})`;
}

// Trigger: Fix precision and logs 2

// Trigger Cleanup v1

// Sync v2.1
