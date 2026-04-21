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
  if (!fs.existsSync(serviceAccountPath)) {
    console.error('====================================================');
    console.error('ERRO: serviceAccountKey.json não encontrado!');
    console.error('Para o robô ter permissão de escrever no seu banco Firebase:');
    console.error('1. Vá no Firebase Console > Configurações > Contas de serviço');
    console.error('2. Clique em "Gerar nova chave privada"');
    console.error('3. Salve o arquivo gerado dentro da pasta "server/" com o nome de "serviceAccountKey.json"');
    console.error('====================================================');
    return false;
  }

  const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

  initializeApp({
    credential: cert(serviceAccount)
  });

  db = getFirestore();
  console.log('Firebase Admin inicializado com sucesso.');
  return true;
}

export { db, FieldValue };

export async function processInventoryActions(phoneNumber, actionsArray) {
  if (!db) return "Banco não conectado.";
  
  // 1. Achar usuário pelo telefone
  const usersRef = db.collection('users');
  const cleanPhone = phoneNumber.replace(/\D/g, ''); 
  
  // Tentar casamento direto primeiro pelo ID salvo pelo robô
  let userQuery = await usersRef.where('whatsappId', '==', cleanPhone).get();
  
  // Se não achar, faz fallback buscando todos e mapenado os ultimos 8 digitos
  let uid = null;
  if (!userQuery.empty) {
    uid = userQuery.docs[0].id;
  } else {
    // Fallback: carregar usuarios que tenham telefone para match agressivo
    const allUsers = await usersRef.get();
    const targetLast8 = cleanPhone.slice(-8);
    
    allUsers.forEach(doc => {
      const data = doc.data();
      if (data.phone && data.phone.slice(-8) === targetLast8) {
         uid = doc.id;
      }
    });
  }

  if (!uid) {
    console.log(`Nenhum usuário encontrado com o telefone (ou fallback) semelhante a ${cleanPhone}`);
    return "Não encontrei nenhuma conta associada a este número. Por favor, cadastre seu telefone no App primeiro.";
  }

  // 2. Achar a residencia desse usuário
  const resQuery = await db.collection('residences')
    .where('members', 'array-contains', uid)
    .get();

  if (resQuery.empty) {
    return "Você ainda não participa de nenhuma residência ativa no sistema.";
  }

  const residenceId = resQuery.docs[0].id;
  
  let totalProcessed = 0;
  
  // Setup Lists
  const listRef = db.collection(`residences/${residenceId}/lists`).doc('Compras da Semana');
  const listDoc = await listRef.get();
  let listItems = listDoc.exists ? (listDoc.data().items || []) : [];
  let listModified = false;

  // Setup Inventory
  const inventoryRef = db.collection(`residences/${residenceId}/inventory`);
  const inventorySnapshot = await inventoryRef.get();
  const inventoryDocs = inventorySnapshot.docs.map(d => ({id: d.id, ...d.data()}));

  for (const action of actionsArray) {
    const { type, target, item: itemData } = action;
    if (!itemData || !itemData.name) continue;
    const q = itemData.quantity || 1;

    if (target === 'list' || target === undefined) {
      const existingIndex = listItems.findIndex(i => i.name.toLowerCase().includes(itemData.name.toLowerCase()));
      
      if (type === 'add') {
        if (existingIndex >= 0) {
          listItems[existingIndex].quantity += q;
        } else {
          listItems.push({
            id: Math.random().toString(36).substr(2, 9),
            name: itemData.name,
            quantity: q,
            unit: 'un',
            category: itemData.category || 'Outros',
            prices: {},
            checked: false
          });
        }
      } else if (type === 'remove') {
        if (existingIndex >= 0) {
          listItems[existingIndex].quantity -= q;
          if (listItems[existingIndex].quantity <= 0) {
            listItems.splice(existingIndex, 1);
          }
        }
      }
      listModified = true;
      totalProcessed++;
    } 
    else if (target === 'inventory') {
      const existingDoc = inventoryDocs.find(d => d.name.toLowerCase().includes(itemData.name.toLowerCase()));
      if (type === 'add') {
        if (existingDoc) {
          await inventoryRef.doc(existingDoc.id).update({ current: FieldValue.increment(q) });
        } else {
          await inventoryRef.add({
            name: itemData.name,
            current: q,
            min: 1,
            unit: 'un'
          });
        }
      } else if (type === 'remove') {
        if (existingDoc) {
          const newCurrent = Math.max(0, existingDoc.current - q);
          await inventoryRef.doc(existingDoc.id).update({ current: newCurrent });
        }
      }
      totalProcessed++;
    }
  }

  if (listModified) {
    await listRef.set({ items: listItems, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  }

  console.log(`Sucesso: ${totalProcessed} ações processadas para a residencia ${residenceId}`);
  return `Tudo pronto! Entendi suas instruções e modifiquei ${totalProcessed} interações no seu painel.`;
}
