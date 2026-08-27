export default function OutgoingCallModal({
  toName,
  withVideo,
  onCancel,
}: {
  toName: string;
  withVideo: boolean;
  onCancel: () => void;
}) {
  return (
    <div className="ring-overlay">
      <div className="ring-modal">
        <div className="ring-pulse">{withVideo ? "🎥" : "📞"}</div>
        <h2>Calling {toName}...</h2>
        <p className="section-sub">Waiting for them to accept.</p>
        <div className="ring-actions">
          <button className="dismiss" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
