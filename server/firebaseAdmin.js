import admin from 'firebase-admin';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Carregamento dinâmico da conta de serviço
function initFirebase() {
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

const db = initFirebase();
const FieldValue = admin.firestore.FieldValue;

/**
 * SALVAR AÇÕES NO FIREBASE
 */
export async function processInventoryActions(phone, actionsArray) {
  if (!actionsArray || actionsArray.length === 0) return "Nenhuma ação para processar.";

  // Limpar telefone (formato 55319...)
  const cleanPhone = String(phone).replace(/\D/g, '');
  const last8 = cleanPhone.slice(-8);

  console.log(`🔍 Buscando usuário para o telefone: ${cleanPhone}`);

  // 1. Achar o Usuário
  const usersSnap = await db.collection('users').get();
  let userDoc = null;

  usersSnap.forEach(doc => {
    const data = doc.data();
    if (data.whatsappId === cleanPhone || (data.phone && String(data.phone).replace(/\D/g, '').endsWith(last8))) {
      userDoc = { id: doc.id, ...data };
    }
  });

  if (!userDoc) {
    console.log('❌ Usuário não encontrado no banco.');
    return "Não encontrei nenhuma conta com seu número. Cadastre o telefone no app primeiro!";
  }

  const uid = userDoc.id;
  console.log(`👤 Usuário encontrado: ${userDoc.name} (${uid})`);

  // 2. Achar Residência
  const resSnap = await db.collection('residences').where('members', 'array-contains', uid).get();

  if (resSnap.empty) {
    console.warn(`⚠️ Usuário ${uid} não pertence a nenhuma residência.`);
    return "Você ainda não criou ou entrou em uma residência no aplicativo Lar 360.";
  }

  const residenceId = resSnap.docs[0].id;
  console.log(`🏠 Residência ativa: ${residenceId}`);

  // 3. Achar a Melhor Lista
  const listSnap = await db.collection(`residences/${residenceId}/lists`).get();
  let listRef;
  let listName = 'Compras da Semana';

  if (listSnap.empty) {
    console.log(`❕ Nenhuma lista encontrada. Criando padrão.`);
    listRef = db.collection(`residences/${residenceId}/lists`).doc(listName);
  } else {
    // Tenta 'Compras da Semana', se não, pega a primeira q existir
    const preferred = listSnap.docs.find(d => d.id === 'Compras da Semana');
    if (preferred) {
      listRef = preferred.ref;
      listName = preferred.id;
    } else {
      listRef = listSnap.docs[0].ref;
      listName = listSnap.docs[0].id;
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
    await listRef.set({ items: listItems, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  }

  return `Operação realizada com sucesso na lista "${listName}"! ✅`;
}
