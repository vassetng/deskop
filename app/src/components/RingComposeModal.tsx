import { useState } from "react";

const PRETEXTS = [
  "Come here",
  "Get me water",
  "Make me breakfast",
  "Come with your laptop",
  "Get me the cleaner",
];

export default function RingComposeModal({
  targetName,
  onSend,
  onCancel,
}: {
  targetName: string;
  onSend: (message: string) => void;
  onCancel: () => void;
}) {
  const [message, setMessage] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSend(message.trim());
  }

  return (
    <div className="ring-overlay">
      <form className="ring-compose" onSubmit={handleSubmit}>
        <h2>🔔 Ring {targetName}</h2>
        <p className="section-sub">
          This just gets their attention — they'll acknowledge it, it doesn't start a call.
        </p>
        <div className="ring-pretexts">
          {PRETEXTS.map((p) => (
            <button
              key={p}
              type="button"
              className={`pretext-chip ${message === p ? "active" : ""}`}
              onClick={() => setMessage(p)}
            >
              {p}
            </button>
          ))}
        </div>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Or type your own, e.g. Can you come to my desk?"
          rows={3}
          autoFocus
        />
        <div className="ring-actions">
          <button type="submit" className="accept">
            Send ring
          </button>
          <button type="button" className="dismiss" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
