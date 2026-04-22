import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const serviceAccountPath = path.join(__dirname, 'serviceAccountKey.json');

let db = null;

export function initFirebase() {
  let serviceAccount;

  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    } catch (e) {
      console.error('ERRO: FIREBASE_SERVICE_ACCOUNT inválido!');
    }
  } else if (fs.existsSync(serviceAccountPath)) {
    serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
  }

  if (serviceAccount || process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    try {
      initializeApp({ credential: cert(serviceAccount) });
      db = getFirestore();
      console.log('✅ Firebase Admin OK');
      return true;
    } catch (err) {
      console.error('❌ Erro Firebase:', err);
    }
  }

  console.warn('⚠️ Firebase não inicializado (chave ausente). Usando mock para permitir início do bot.');
  // Mock do DB para o bot não travar no início, mas avisar ao usar
  db = {
    collection: (name) => ({
      doc: (id) => ({
        get: async () => ({ exists: false, data: () => ({}) }),
        set: async () => { console.error(`❌ Erro: Tentativa de gravar em "${name}/${id}" sem Firebase configurado.`); },
        update: async () => { console.error(`❌ Erro: Tentativa de atualizar "${name}/${id}" sem Firebase configurado.`); },
        onSnapshot: () => (() => {}),
        delete: async () => {}
      }),
      where: () => ({ get: async () => ({ empty: true, docs: [], forEach: () => {} }) }),
      get: async () => ({ empty: true, docs: [], forEach: (cb) => { [].forEach(cb) } }),
      onSnapshot: () => (() => {}),
      add: async () => { console.error(`❌ Erro: Tentativa de adicionar em "${name}" sem Firebase configurado.`); }
    })
  };
  return true;
}

export { db, FieldValue };

export async function processInventoryActions(phoneNumber, actionsArray) {
  if (!db) return "Erro: Banco de dados não inicializado.";
  
  const cleanReceived = String(phoneNumber).replace(/\D/g, '');
  console.log(`🔍 Buscando usuário para: ${cleanReceived}`);

  // 1. Achar Usuário
  const usersSnap = await db.collection('users').get();
  let userDoc = null;
  const last8 = cleanReceived.slice(-8);

  usersSnap.forEach(doc => {
    const data = doc.data();
    const phoneInDb = String(data.whatsappId || data.phone || '').replace(/\D/g, '');
    if (phoneInDb.endsWith(last8)) {
      userDoc = { id: doc.id, ...data };
    }
  });

  if (!userDoc) {
    console.log('❌ Usuário não encontrado no banco.');
    return "Não encontrei nenhuma conta com seu número. Cadastre o telefone no app primeiro!";
  }

  const uid = userDoc.id;
  console.log(`👤 Usuário encontrado: ${userDoc.name} (${uid})`);

  // 2. Achar Residência atrelando o usuário
  const resSnap = await db.collection('residences')
    .where('members', 'array-contains', uid)
    .get();

  if (resSnap.empty) {
    console.log('❌ Nenhuma residência encontrada para este UID.');
    return "Você não está em nenhuma residência cadastrada no Lar 360.";
  }

  // Pegar a residência (se houver mais de uma, pega a primeira)
  const residenceId = resSnap.docs[0].id;
  console.log(`🏠 Residência ativa: ${residenceId}`);

  // 3. Processar ações
  let listModified = false;
  
  // Tentar encontrar a melhor lista (preferencialmente 'Compras da Semana')
  let listRef = db.collection(`residences/${residenceId}/lists`).doc('Compras da Semana');
  let listDoc = await listRef.get();
  
  if (!listDoc.exists) {
    // Se não existir, tenta buscar qualquer lista disponível para não falhar
    const listsSnap = await db.collection(`residences/${residenceId}/lists`).limit(1).get();
    if (!listsSnap.empty) {
      listRef = listsSnap.docs[0].ref;
      listDoc = await listRef.get();
      console.log(`📋 Usando lista alternativa: ${listRef.id}`);
    } else {
      console.log(`📋 Criando nova lista: Compras da Semana`);
    }
  }

  let items = listDoc.exists ? (listDoc.data().items || []) : [];

  for (const action of actionsArray) {
    const target = String(action.target || '').toLowerCase();
    const type = String(action.type || '').toLowerCase();
    const item = String(action.item || '').trim();
    const qty = Number(action.quantity) || 1;
    const category = action.category || 'Despensa';

    if (!item) continue;
    console.log(`⚙️ Processando: [${type}] [${target}] ${item} (qty: ${qty})`);

    if (target === 'list') {
      const idx = items.findIndex(i => i.name.toLowerCase().trim() === item.toLowerCase().trim());
      
      if (type === 'add') {
        if (idx >= 0) {
          const currentQty = Number(items[idx].quantity || 0);
          items[idx].quantity = currentQty + qty;
        } else {
          items.push({
            id: Math.random().toString(36).substr(2, 9),
            name: item,
            quantity: qty,
            unit: action.unit || 'un',
            category: category,
            prices: {},
            checked: false
          });
        }
        listModified = true;
      } else if (type === 'remove' && idx >= 0) {
        items.splice(idx, 1);
        listModified = true;
      }
    } 
    else if (target === 'inventory') {
      const invRef = db.collection(`residences/${residenceId}/inventory`);
      const invSnap = await invRef.get();
      const existing = invSnap.docs.find(d => d.data().name.toLowerCase().trim() === item.toLowerCase().trim());

      if (type === 'add') {
        if (existing) {
          await invRef.doc(existing.id).update({ 
            current: FieldValue.increment(qty),
            updatedAt: FieldValue.serverTimestamp()
          });
        } else {
          await invRef.add({ 
            name: item, 
            current: qty, 
            min: 1, 
            unit: action.unit || 'un',
            updatedAt: FieldValue.serverTimestamp()
          });
        }
      } else if (type === 'remove') {
        if (existing) {
          const currentData = existing.data();
          const currentVal = Number(currentData.current || 0);
          const newVal = Math.max(0, currentVal - qty);
          await invRef.doc(existing.id).update({ 
            current: newVal,
            updatedAt: FieldValue.serverTimestamp()
          });
        } else {
          console.log(`⚠️ Item não encontrado no estoque para remover: ${item}`);
        }
      }
    }
  }

  if (listModified) {
    await listRef.set({ 
      items, 
      updatedAt: FieldValue.serverTimestamp() 
    }, { merge: true });
  }

  console.log('✅ Ações processadas com sucesso!');
  return "Tudo pronto! Já atualizei seu Lar 360 com os itens informados. 🏠✨";
}
