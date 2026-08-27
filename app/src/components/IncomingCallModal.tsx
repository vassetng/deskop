export default function IncomingCallModal({
  fromName,
  withVideo,
  onAccept,
  onDecline,
}: {
  fromName: string;
  withVideo: boolean;
  onAccept: () => void;
  onDecline: () => void;
}) {
  return (
    <div className="ring-overlay">
      <div className="ring-modal">
        <div className="ring-pulse">{withVideo ? "🎥" : "📞"}</div>
        <h2>
          {fromName} is {withVideo ? "video calling" : "calling"} you
        </h2>
        <div className="ring-actions">
          <button className="accept" onClick={onAccept}>
            Accept
          </button>
          <button className="dismiss" onClick={onDecline}>
            Decline
          </button>
        </div>
      </div>
    </div>
  );
}
