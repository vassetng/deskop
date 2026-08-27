import { useState } from "react";
import { getServerUrl, setServerUrl } from "../lib/socket";
import logo from "../assets/logo.png";

export default function Login({ onJoin }: { onJoin: (name: string, serverUrl: string) => void }) {
  const [name, setName] = useState("");
  const [serverUrl, setServerUrlInput] = useState(getServerUrl());

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setServerUrl(serverUrl.trim());
    onJoin(name.trim(), serverUrl.trim());
  }

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={handleSubmit}>
        <img src={logo} alt="Deskop" className="login-logo" />
        <h1>Deskop</h1>
        <p className="subtitle">Office flow for your team</p>
        <label>
          Your name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Jane Doe"
            autoFocus
          />
        </label>
        <label>
          Server address
          <input
            value={serverUrl}
            onChange={(e) => setServerUrlInput(e.target.value)}
            placeholder="http://192.168.1.10:4000"
          />
        </label>
        <button type="submit">Join</button>
      </form>
    </div>
  );
}
