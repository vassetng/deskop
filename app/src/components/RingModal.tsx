export default function RingModal({
  fromName,
  message,
  onAcknowledge,
}: {
  fromName: string;
  message: string;
  onAcknowledge: () => void;
}) {
  return (
    <div className="ring-overlay">
      <div className="ring-modal">
        <div className="ring-pulse">🔔</div>
        <h2>{fromName} is asking for you</h2>
        {message && <p className="ring-message">"{message}"</p>}
        <div className="ring-actions">
          <button className="accept" onClick={onAcknowledge}>
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
