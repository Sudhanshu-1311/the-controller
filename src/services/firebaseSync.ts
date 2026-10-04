/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  collection,
  doc,
  deleteDoc,
  onSnapshot,
  getDocFromServer,
  updateDoc,
  query,
  where,
} from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from './firebase';
import { RegisteredDevice, ConnectionState } from '../types/controller';

/**
 * Validates Firestore connectivity on app boot
 */
export async function testFirestoreConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, 'system', 'connection_health'));
    return true;
  } catch (err) {
    console.warn('Firebase health check failed:', err);
    return false;
  }
}

/**
 * Real-time subscription to verified devices in Firestore
 */
export function subscribeToFirestoreDevices(
  myDeviceId: string | null,
  onDevicesUpdated: (devices: RegisteredDevice[]) => void
): () => void {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    onDevicesUpdated([]);
    return () => {};
  }
  const path = 'devices';
  try {
    const devicesByQuery = new Map<string, Map<string, RegisteredDevice>>();
    const publish = () => {
      const merged = new Map<string, RegisteredDevice>();
      devicesByQuery.forEach((entries) => entries.forEach((device, id) => merged.set(id, device)));
      merged.delete(myDeviceId || '');
      onDevicesUpdated(Array.from(merged.values()));
    };
    const queries = [
      query(collection(db, 'devices'), where('ownerUid', '==', currentUser.uid)),
      query(collection(db, 'devices'), where('authorizedControllerUids', 'array-contains', currentUser.uid)),
    ];
    const unsubscribers = queries.map((deviceQuery, queryIndex) => onSnapshot(deviceQuery, (snapshot) => {
      const entries = new Map<string, RegisteredDevice>();

      console.log('[FIRESTORE DEVICES]', snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        data: docSnap.data(),
      })));

      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (!data?.identity?.id) return;
        entries.set(data.identity.id, {
          identity: data.identity,
          name: data.name || `Node ${data.identity.fingerprint}`,
          role: data.role || 'agent',
          status: (data.status as ConnectionState) || 'Offline',
          presenceState: data.presenceState || 'OFFLINE',
          ownerUid: data.ownerUid,
          allowRemoteConnections: data.allowRemoteConnections !== false,
          remoteAccessPaused: Boolean(data.remoteAccessPaused),
          lastSeen: data.lastSeen || 0,
          systemInfo: data.systemInfo || undefined,
          sharedFiles: data.sharedFiles || [],
          fileAccessGranted: Boolean(data.fileAccessGranted),
          screenSharingActive: Boolean(data.screenSharingActive),
        });
      });
      devicesByQuery.set(String(queryIndex), entries);
      publish();
    }, (error) => {
        console.error('[FIRESTORE DEVICES ERROR]', error);
        handleFirestoreError(error, OperationType.LIST, path);
    }));
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
    return () => {};
  }
}

/**
 * Remove a device from Firestore when it shuts down cleanly
 */
export async function removeDeviceFromFirestore(deviceId: string): Promise<void> {
  const path = `devices/${deviceId}`;
  try {
    await deleteDoc(doc(db, 'devices', deviceId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

/** Owner-managed remote policy is written to the device record and re-read by the native agent. */
export async function updateOwnDeviceRemoteSettings(
  deviceId: string,
  updates: { authorizedControllerUids?: string[]; allowRemoteConnections?: boolean; remoteAccessPaused?: boolean },
): Promise<void> {
  if (!auth.currentUser || !deviceId) throw new Error('Sign in and initialize the device before changing remote access settings.');
  await updateDoc(doc(db, 'devices', deviceId), updates);
}
