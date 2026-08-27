export default function RingModal({
  fromName,
  onAccept,
  onDismiss,
}: {
  fromName: string;
  onAccept: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="ring-overlay">
      <div className="ring-modal">
        <div className="ring-pulse">🔔</div>
        <h2>{fromName} is calling you</h2>
        <div className="ring-actions">
          <button className="accept" onClick={onAccept}>
            Accept
          </button>
          <button className="dismiss" onClick={onDismiss}>
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
