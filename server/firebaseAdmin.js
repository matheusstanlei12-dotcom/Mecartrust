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
      return false;
    }
  } else if (fs.existsSync(serviceAccountPath)) {
    serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
  } else {
    return false;
  }

  try {
    initializeApp({ credential: cert(serviceAccount) });
    db = getFirestore();
    console.log('✅ Firebase Admin OK');
    return true;
  } catch (err) {
    console.error('❌ Erro Firebase:', err);
    return false;
  }
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
  
  // Carregar lista de compras atual
  const listRef = db.collection(`residences/${residenceId}/lists`).doc('Compras da Semana');
  const listDoc = await listRef.get();
  let items = listDoc.exists ? (listDoc.data().items || []) : [];

  for (const action of actionsArray) {
    const { type, target, item, quantity, category: actionCategory } = action;
    if (!item) continue;

    const itemName = item.trim();
    const qty = Number(quantity) || 1;
    const category = actionCategory || 'Despensa';

    if (target === 'list') {
      const idx = items.findIndex(i => i.name.toLowerCase() === itemName.toLowerCase());
      
      if (type === 'add') {
        if (idx >= 0) {
          const currentQty = Number(items[idx].quantity || 0);
          items[idx].quantity = currentQty + qty;
        } else {
          items.push({
            id: Math.random().toString(36).substr(2, 9),
            name: itemName,
            quantity: qty,
            unit: 'un',
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
      const existing = invSnap.docs.find(d => d.data().name.toLowerCase() === itemName.toLowerCase());

      if (type === 'add') {
        if (existing) {
          // Incrementa via Firestore (atômico)
          await invRef.doc(existing.id).update({ current: FieldValue.increment(qty) });
        } else {
          await invRef.add({ name: itemName, current: qty, min: 1, unit: 'un' });
        }
      } else if (type === 'remove' && existing) {
        const currentData = existing.data();
        const currentVal = Number(currentData.current || 0);
        const newVal = Math.max(0, currentVal - qty);
        await invRef.doc(existing.id).update({ current: newVal });
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
