import { addDoc, collection, deleteDoc, doc, onSnapshot, query, where } from 'firebase/firestore';
import { auth, db } from './firebase';
import type { MeshMessage } from '../types/controller';

const signals = collection(db, 'signals');

export async function sendSignalMessage(message: MeshMessage): Promise<void> {
  const user = auth.currentUser;
  if (!user || !message.targetId) return;
  await addDoc(signals, {
    senderUid: user.uid,
    senderId: message.senderId,
    targetId: message.targetId,
    message: JSON.parse(JSON.stringify(message)),
    createdAt: Date.now(),
  });
}

export function subscribeToSignalMessages(deviceId: string, onMessage: (message: MeshMessage) => void): () => void {
  const user = auth.currentUser;
  if (!user) return () => {};
  const signalQuery = query(signals, where('targetId', '==', deviceId));
  return onSnapshot(signalQuery, (snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type !== 'added') return;
      const data = change.doc.data();
      if (data.message) onMessage(data.message as MeshMessage);
      void deleteDoc(doc(db, 'signals', change.doc.id)).catch(() => {});
    });
  });
}
