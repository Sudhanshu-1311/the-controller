import { getFunctions, httpsCallable } from 'firebase/functions';
import { app, auth } from './firebase';

export interface IceConfiguration {
  iceServers: RTCIceServer[];
  turnAvailable: boolean;
  expiresAt?: number;
}

/** Returns authenticated, deployment-configured ICE servers from Cloud Functions. */
export async function loadIceConfiguration(): Promise<IceConfiguration> {
  if (!auth.currentUser) throw new Error('Sign in before starting a remote session.');
  const callable = httpsCallable<void, IceConfiguration>(getFunctions(app, 'us-central1'), 'getIceConfiguration');
  const { data } = await callable();
  if (!data || !Array.isArray(data.iceServers)) throw new Error('The backend returned an invalid ICE configuration.');
  return data;
}
