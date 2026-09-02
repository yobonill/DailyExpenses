import { useState, type FormEvent } from "react";
import { APP_USERS } from "../config/appUsers";
import type { UserName } from "../models/user";

const LAST_LOGIN_USER_KEY = "dailyExpenses.lastLoginUser.v1";

const readLastUser = (): UserName =>
  localStorage.getItem(LAST_LOGIN_USER_KEY) === "Yisel" ? "Yisel" : "Yorki";

interface LoginScreenProps {
  loading: boolean;
  error: string;
  onLogin: (name: UserName, password: string) => Promise<boolean>;
}

export function LoginScreen({ loading, error, onLogin }: LoginScreenProps) {
  const [selectedUser, setSelectedUser] = useState<UserName>(readLastUser);
  const [password, setPassword] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!password || loading) return;
    localStorage.setItem(LAST_LOGIN_USER_KEY, selectedUser);
    const succeeded = await onLogin(selectedUser, password);
    if (succeeded) setPassword("");
  };

  return (
    <main className="login-page">
      <section className="login-card" aria-labelledby="login-title">
        <div className="brand-icon" aria-hidden="true">$</div>
        <span className="eyebrow">Configuración inicial</span>
        <h1 id="login-title">Gastos &amp; Presupuesto</h1>
        <p className="login-intro">
          Selecciona el usuario de este dispositivo e ingresa la contraseña configurada para Gastos &amp; Presupuesto.
          La sesión quedará guardada y no se registra quién creó cada gasto.
        </p>

        <form onSubmit={submit}>
          <fieldset className="login-user-selector">
            <legend>Usuario de acceso</legend>
            <div className="segmented-options">
              {APP_USERS.map((user) => (
                <button
                  key={user.name}
                  type="button"
                  className={selectedUser === user.name ? "selected" : ""}
                  onClick={() => setSelectedUser(user.name)}
                >
                  {user.name}
                </button>
              ))}
            </div>
          </fieldset>

          <label className="field login-password-field">
            <span>Contraseña</span>
            <input
              autoFocus
              autoComplete="current-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Contraseña"
            />
          </label>

          {error && <p className="form-error" role="alert">{error}</p>}

          <button className="button button-primary login-submit" type="submit" disabled={!password || loading}>
            {loading ? "Entrando…" : "Entrar"}
          </button>
        </form>

        <p className="login-help">
          La primera entrada requiere internet. Después la sesión y los gastos guardados estarán disponibles sin conexión.
        </p>
      </section>
    </main>
  );
}
