import { useEffect, useState } from "react";
import { login } from "../lib/auth";
import logo from "../assets/logo.png";

type DiscoveredServer = { name: string; address: string; port: number };
type ManualMode = "localhost" | "lan" | "online";

const LOCALHOST_URL = "http://localhost:4000";

function serverUrl(s: DiscoveredServer): string {
  return `http://${s.address}:${s.port}`;
}

export default function Login({ onLoggedIn }: { onLoggedIn: () => void }) {
  const isElectron = !!window.deskop;

  const [discovering, setDiscovering] = useState(isElectron);
  const [discovered, setDiscovered] = useState<DiscoveredServer[]>([]);
  const [chosenUrl, setChosenUrl] = useState<string | null>(null);

  const [showManual, setShowManual] = useState(!isElectron);
  const [manualMode, setManualMode] = useState<ManualMode>("lan");
  const [lanUrl, setLanUrl] = useState("http://192.168.1.10:4000");
  const [onlineUrl, setOnlineUrl] = useState("https://");
  const [connectionPassword, setConnectionPassword] = useState("");

  const [username, setUsername] = useState("");
  const [usernameAutoFilled, setUsernameAutoFilled] = useState(false);
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!window.deskop) return;
    window.deskop.getOsUsername().then((name) => {
      if (name) {
        setUsername(name);
        setUsernameAutoFilled(true);
      }
    });
    window.deskop
      .discoverServers()
      .then((servers) => setDiscovered(servers))
      .finally(() => setDiscovering(false));
  }, []);

  function manualServerUrl(): string {
    if (manualMode === "localhost") return LOCALHOST_URL;
    if (manualMode === "lan") return lanUrl.trim();
    return onlineUrl.trim();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const url = chosenUrl ?? manualServerUrl();
    if (!username.trim() || !password || !url) return;
    setSubmitting(true);
    setError(null);
    try {
      await login(url, username.trim(), password, manualMode === "online" ? connectionPassword : null);
      onLoggedIn();
    } catch (err: any) {
      setError(err.message || "Couldn't log in. Check your credentials and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const readyToLogin = chosenUrl !== null || showManual;

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={handleSubmit}>
        <img src={logo} alt="Deskop" className="login-logo" />
        <h1>Deskop</h1>
        <p className="subtitle">Office flow for your team</p>

        {discovering && <p className="mode-hint">Looking for your office server on this network…</p>}

        {!discovering && discovered.length > 0 && !chosenUrl && (
          <div className="discovered-list">
            {discovered.map((s) => (
              <button
                key={serverUrl(s)}
                type="button"
                className="discovered-server"
                onClick={() => setChosenUrl(serverUrl(s))}
              >
                <span>
                  <strong>{s.name}</strong>
                  <span className="meta"> · {s.address}</span>
                </span>
                <span className="join-label">Join →</span>
              </button>
            ))}
          </div>
        )}

        {chosenUrl && (
          <div className="chosen-server">
            Connecting to <strong>{chosenUrl}</strong>
            <button type="button" className="link-btn" onClick={() => setChosenUrl(null)}>
              change
            </button>
          </div>
        )}

        {!discovering && discovered.length === 0 && !chosenUrl && !showManual && (
          <p className="mode-hint">
            No office server found on this WiFi/network.{" "}
            <button type="button" className="link-btn" onClick={() => setShowManual(true)}>
              Connect manually
            </button>
          </p>
        )}

        {!chosenUrl && !showManual && discovered.length > 0 && (
          <button type="button" className="link-btn" onClick={() => setShowManual(true)}>
            Connect manually instead
          </button>
        )}

        {!chosenUrl && showManual && (
          <>
            <div className="connection-modes">
              <button
                type="button"
                className={manualMode === "localhost" ? "active" : ""}
                onClick={() => setManualMode("localhost")}
              >
                Localhost
              </button>
              <button
                type="button"
                className={manualMode === "lan" ? "active" : ""}
                onClick={() => setManualMode("lan")}
              >
                WiFi / LAN
              </button>
              <button
                type="button"
                className={manualMode === "online" ? "active" : ""}
                onClick={() => setManualMode("online")}
              >
                Online
              </button>
            </div>

            {manualMode === "lan" && (
              <label>
                Server address
                <input
                  value={lanUrl}
                  onChange={(e) => setLanUrl(e.target.value)}
                  placeholder="http://192.168.1.10:4000"
                />
              </label>
            )}

            {manualMode === "online" && (
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

            {manualMode === "localhost" && <p className="mode-hint">Connecting to {LOCALHOST_URL}</p>}
          </>
        )}

        {readyToLogin && (
          <>
            <label>
              Username
              {usernameAutoFilled && <span className="meta"> (from this computer)</span>}
              <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="jane" />
            </label>
            <label>
              {usernameAutoFilled ? "Passcode" : "Password"}
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus={usernameAutoFilled}
              />
            </label>

            {error && <div className="report-error">{error}</div>}

            <button type="submit" disabled={submitting}>
              {submitting ? "Signing in…" : "Sign in"}
            </button>
          </>
        )}
      </form>
    </div>
  );
}
