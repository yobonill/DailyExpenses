import type { FirebaseOptions } from "firebase/app";

/**
 * Reuses the same Firebase project as TaskFollower.
 * Firebase web configuration is public client configuration; access is enforced
 * by Realtime Database Security Rules and Firebase Authentication.
 */
export const firebaseConfig: FirebaseOptions = {
  apiKey: "AIzaSyABQsP0Cglpb9mV0mezqfYHKvpuNEcM4dU",
  authDomain: "app-taskfollower.firebaseapp.com",
  databaseURL: "https://app-taskfollower-default-rtdb.firebaseio.com/",
  projectId: "app-taskfollower",
  storageBucket: "app-taskfollower.firebasestorage.app",
  messagingSenderId: "71859963691",
  appId: "1:71859963691:web:cf7056735b3e28fdd5276e",
};

export const isFirebaseConfigured = (): boolean =>
  Boolean(firebaseConfig.apiKey && firebaseConfig.databaseURL);
