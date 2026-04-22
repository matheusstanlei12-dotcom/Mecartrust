import { db } from './firebaseAdmin.js';
import fs from 'fs';
import path from 'path';

/**
 * Store customizado para salvar a sessão do WhatsApp no Firebase Firestore.
 * Isso garante que a sessão sobreviva a novos deploys na Railway.
 */
export class FirestoreStore {
  constructor() {
    this.sessionCollection = db.collection('whatsapp_sessions');
  }

  async sessionExists({ session }) {
    try {
      const doc = await this.sessionCollection.doc(session).get();
      return doc.exists;
    } catch (e) {
      return false;
    }
  }

  async save({ session }) {
    // O RemoteAuth salva o arquivo localmente primeiro, depois chama este método
    const sessionDir = `./.wwebjs_auth/session-${session}`;
    if (!fs.existsSync(sessionDir)) {
      console.log(`⚠️ Pasta de sessão não encontrada: ${sessionDir}`);
      return;
    }

    try {
      // Lê todos os arquivos da sessão e converte para base64
      const files = {};
      const readDir = (dir, prefix = '') => {
        fs.readdirSync(dir).forEach(file => {
          const fullPath = path.join(dir, file);
          const key = path.join(prefix, file);
          if (fs.statSync(fullPath).isDirectory()) {
            readDir(fullPath, key);
          } else {
            files[key] = fs.readFileSync(fullPath).toString('base64');
          }
        });
      };
      readDir(sessionDir);

      await this.sessionCollection.doc(session).set({
        files,
        updatedAt: new Date().toISOString()
      });
      console.log(`💾 Sessão "${session}" salva no Firebase!`);
    } catch (e) {
      console.error('❌ Erro ao salvar sessão no Firebase:', e.message);
    }
  }

  async extract({ session, path: destPath }) {
    try {
      const doc = await this.sessionCollection.doc(session).get();
      if (!doc.exists) return;

      const { files } = doc.data();
      if (!files) return;

      // Recria os arquivos a partir do Firebase
      Object.entries(files).forEach(([filePath, base64]) => {
        const fullPath = path.join(destPath, filePath);
        const dir = path.dirname(fullPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(fullPath, Buffer.from(base64, 'base64'));
      });
      console.log(`📂 Sessão "${session}" restaurada do Firebase!`);
    } catch (e) {
      console.error('❌ Erro ao restaurar sessão do Firebase:', e.message);
    }
  }

  async delete({ session }) {
    try {
      await this.sessionCollection.doc(session).delete();
      console.log(`🗑️ Sessão "${session}" removida do Firebase.`);
    } catch (e) {
      console.error('❌ Erro ao remover sessão:', e.message);
    }
  }
}
