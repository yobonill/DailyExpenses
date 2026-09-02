import type { FirebaseOptions } from "firebase/app";

/**
 * Dedicated Daily Expenses Firebase project.
 * Firebase web configuration is public client configuration; access is enforced
 * by Realtime Database Security Rules and Firebase Authentication.
 */
export const firebaseConfig: FirebaseOptions = {
  apiKey: "AIzaSyBCYsLDsXOlKl-cI0vpMMMGSM3QpUeryEk",
  authDomain: "app-daily-expenses-budget.firebaseapp.com",
  databaseURL: "https://app-daily-expenses-budget-default-rtdb.firebaseio.com/",
  projectId: "app-daily-expenses-budget",
  storageBucket: "app-daily-expenses-budget.firebasestorage.app",
  messagingSenderId: "225236211664",
  appId: "1:225236211664:web:c7fef356c912f06887cbd5",
};

export const isFirebaseConfigured = (): boolean =>
  Boolean(firebaseConfig.apiKey && firebaseConfig.databaseURL);
