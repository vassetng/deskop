import { useState } from "react";
import { login } from "../lib/auth";
import logo from "../assets/logo.png";

type Mode = "localhost" | "lan" | "online";

const LOCALHOST_URL = "http://localhost:4000";

export default function Login({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [mode, setMode] = useState<Mode>("localhost");
  const [lanUrl, setLanUrl] = useState("http://192.168.1.10:4000");
  const [onlineUrl, setOnlineUrl] = useState("https://");
  const [connectionPassword, setConnectionPassword] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function serverUrlForMode(): string {
    if (mode === "localhost") return LOCALHOST_URL;
    if (mode === "lan") return lanUrl.trim();
    return onlineUrl.trim();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password) return;
    setSubmitting(true);
    setError(null);
    try {
      await login(
        serverUrlForMode(),
        username.trim(),
        password,
        mode === "online" ? connectionPassword : null
      );
      onLoggedIn();
    } catch (err: any) {
      setError(err.message || "Couldn't log in. Check your server address and credentials.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={handleSubmit}>
        <img src={logo} alt="Deskop" className="login-logo" />
        <h1>Deskop</h1>
        <p className="subtitle">Office flow for your team</p>

        <div className="connection-modes">
          <button
            type="button"
            className={mode === "localhost" ? "active" : ""}
            onClick={() => setMode("localhost")}
          >
            Localhost
          </button>
          <button type="button" className={mode === "lan" ? "active" : ""} onClick={() => setMode("lan")}>
            WiFi / LAN
          </button>
          <button
            type="button"
            className={mode === "online" ? "active" : ""}
            onClick={() => setMode("online")}
          >
            Online
          </button>
        </div>

        {mode === "lan" && (
          <label>
            Server address
            <input
              value={lanUrl}
              onChange={(e) => setLanUrl(e.target.value)}
              placeholder="http://192.168.1.10:4000"
            />
          </label>
        )}

        {mode === "online" && (
          <>
            <label>
              Server address
              <input
                value={onlineUrl}
                onChange={(e) => setOnlineUrl(e.target.value)}
                placeholder="https://your-office-server.example.com"
              />
            </label>
            <label>
              Connection password
              <input
                type="password"
                value={connectionPassword}
                onChange={(e) => setConnectionPassword(e.target.value)}
                placeholder="Ask your admin"
              />
            </label>
          </>
        )}

        {mode === "localhost" && <p className="mode-hint">Connecting to {LOCALHOST_URL}</p>}

        <label>
          Username
          <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="jane" autoFocus />
        </label>
        <label>
          Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>

        {error && <div className="report-error">{error}</div>}

        <button type="submit" disabled={submitting}>
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
