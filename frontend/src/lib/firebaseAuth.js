import { GoogleAuthProvider, signInWithPopup, signInWithRedirect } from 'firebase/auth';
import { getFirebaseAuth, hasFirebaseConfig } from './firebaseClient.js';

export async function getGoogleIdToken() {
  if (!hasFirebaseConfig()) {
    throw new Error('Google sign-in is not configured yet. Add the Firebase web app values to frontend/.env.');
  }

  const auth = getFirebaseAuth();
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    const credential = await signInWithPopup(auth, provider);
    return credential.user.getIdToken();
  } catch (error) {
    if (shouldUseRedirect(error)) {
      await signInWithRedirect(auth, provider);
      return '';
    }
    throw error;
  }
}

function shouldUseRedirect(error) {
  return [
    'auth/popup-blocked',
    'auth/popup-closed-by-user',
    'auth/cancelled-popup-request',
    'auth/operation-not-supported-in-this-environment'
  ].includes(error?.code);
}
