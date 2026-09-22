import { useCallback, useEffect, useRef, useState } from "react";
import type { FirebaseError } from "firebase/app";
import { onValue, ref } from "firebase/database";
import type { AppUserDefinition } from "../config/appUsers";
import { getAppUserByUid } from "../config/appUsers";
import { isFirebaseConfigured } from "../config/firebaseConfig";
import type { UserName } from "../models/user";
import {
  getFirebaseServices,
  observeAuthentication,
  signInAppUser,
  signOutAppUser,
} from "../services/firebase";

type AuthStatus =
  | "loading"
  | "authenticating"
  | "authenticated"
  | "unauthenticated"
  | "error";

const LAST_AUTH_USER_KEY = "dailyExpenses.auth.lastUserUid.v1";

const readRememberedUser = (): AppUserDefinition | null => {
  try {
    return getAppUserByUid(localStorage.getItem(LAST_AUTH_USER_KEY)) || null;
  } catch {
    return null;
  }
};

const rememberUser = (user: AppUserDefinition): void => {
  try { localStorage.setItem(LAST_AUTH_USER_KEY, user.uid); } catch { /* best effort */ }
};

const forgetRememberedUser = (): void => {
  try { localStorage.removeItem(LAST_AUTH_USER_KEY); } catch { /* best effort */ }
};

export interface UseAuthResult {
  user: AppUserDefinition | null;
  status: AuthStatus;
  error: string;
  offlineCandidate: AppUserDefinition | null;
  offlineSession: boolean;
  continueOffline: () => boolean;
  login: (name: UserName, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
}

const getLoginErrorMessage = (error: unknown): string => {
  const code = (error as FirebaseError | undefined)?.code;
  if (!navigator.onLine) {
    return "Necesitas conexión a internet para iniciar sesión por primera vez en este dispositivo.";
  }

  switch (code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "La contraseña no es correcta para el usuario seleccionado.";
    case "auth/too-many-requests":
      return "Se realizaron demasiados intentos. Espera un momento y vuelve a intentarlo.";
    case "auth/network-request-failed":
      return "No se pudo conectar con Firebase. Revisa la conexión e inténtalo otra vez.";
    case "auth/user-disabled":
      return "Esta cuenta está deshabilitada en Firebase.";
    default:
      return error instanceof Error && error.message
        ? error.message
        : "No se pudo iniciar sesión.";
  }
};

export const useAuth = (): UseAuthResult => {
  const remembered = readRememberedUser();
  const [user, setUser] = useState<AppUserDefinition | null>(null);
  const [offlineCandidate, setOfflineCandidate] = useState<AppUserDefinition | null>(remembered);
  const [offlineSession, setOfflineSession] = useState(false);
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [error, setError] = useState("");
  const offlineSessionRef = useRef(false);
  const firebaseConnectedRef = useRef(false);

  const resumeOnlineWithUser = useCallback((appUser: AppUserDefinition) => {
    rememberUser(appUser);
    setOfflineCandidate(appUser);
    offlineSessionRef.current = false;
    setOfflineSession(false);
    setUser(appUser);
    setStatus("authenticated");
    setError("");
  }, []);

  useEffect(() => {
    if (!isFirebaseConfigured()) {
      setStatus("error");
      setError("Firebase todavía no está configurado en esta aplicación.");
      return () => undefined;
    }

    return observeAuthentication((appUser, firebaseUser) => {
      // Once the user explicitly chose offline mode, Auth may still emit its
      // cached user (or briefly emit null). Keep the local session active until
      // Realtime Database confirms that Firebase itself is reachable again.
      if (offlineSessionRef.current) {
        if (appUser && firebaseConnectedRef.current) {
          resumeOnlineWithUser(appUser);
        } else if (appUser) {
          rememberUser(appUser);
          setOfflineCandidate(appUser);
          setUser(appUser);
          setStatus("authenticated");
          setError("");
        }
        return;
      }

      if (firebaseUser && !appUser) {
        setOfflineSession(false);
        setUser(null);
        setStatus("unauthenticated");
        setError("La sesión guardada no pertenece a uno de los usuarios autorizados.");
        void signOutAppUser();
        return;
      }

      if (appUser) {
        rememberUser(appUser);
        setOfflineCandidate(appUser);
        setOfflineSession(false);
        setUser(appUser);
        setStatus("authenticated");
        setError("");
        return;
      }

      setOfflineSession(false);
      setUser(null);
      setStatus("unauthenticated");
    });
  }, [resumeOnlineWithUser]);

  useEffect(() => {
    const firebaseServices = getFirebaseServices();
    if (!firebaseServices) return () => undefined;

    // `.info/connected` is a real Firebase connection signal, unlike
    // navigator.onLine which can be true on Wi-Fi without internet access.
    return onValue(ref(firebaseServices.database, ".info/connected"), (snapshot) => {
      firebaseConnectedRef.current = snapshot.val() === true;
      if (!offlineSessionRef.current || !firebaseConnectedRef.current) return;
      const firebaseUser = firebaseServices.auth.currentUser;
      const appUser = firebaseUser ? getAppUserByUid(firebaseUser.uid) || null : null;
      if (appUser) resumeOnlineWithUser(appUser);
    });
  }, [resumeOnlineWithUser]);

  const continueOffline = useCallback((): boolean => {
    const candidate = offlineCandidate || readRememberedUser();
    if (!candidate) return false;
    offlineSessionRef.current = true;
    setOfflineSession(true);
    setUser(candidate);
    setStatus("authenticated");
    setError("");
    return true;
  }, [offlineCandidate]);

  const login = useCallback(async (name: UserName, password: string) => {
    setError("");
    setStatus("authenticating");
    try {
      const authenticatedUser = await signInAppUser(name, password);
      rememberUser(authenticatedUser);
      setOfflineCandidate(authenticatedUser);
      offlineSessionRef.current = false;
      setOfflineSession(false);
      setUser(authenticatedUser);
      setStatus("authenticated");
      return true;
    } catch (loginError) {
      setUser(null);
      setStatus("unauthenticated");
      setError(getLoginErrorMessage(loginError));
      return false;
    }
  }, []);

  const logout = useCallback(async () => {
    offlineSessionRef.current = false;
    setOfflineSession(false);
    forgetRememberedUser();
    setOfflineCandidate(null);
    try {
      await signOutAppUser();
    } finally {
      setUser(null);
      setStatus("unauthenticated");
      setError("");
    }
  }, []);

  return {
    user,
    status,
    error,
    offlineCandidate,
    offlineSession,
    continueOffline,
    login,
    logout,
  };
};
