import { useState } from "react";

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
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Optional message, e.g. Can you come to my desk?"
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
