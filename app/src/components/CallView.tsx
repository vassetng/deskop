import { useEffect, useRef, useState } from "react";
import { CallSession } from "../lib/webrtc";

export default function CallView({
  session,
  peerName,
  onEnd,
  bindRemoteVideo,
}: {
  session: CallSession;
  peerName: string;
  onEnd: () => void;
  bindRemoteVideo: (el: HTMLVideoElement | null) => void;
}) {
  const localRef = useRef<HTMLVideoElement>(null);
  const [sharingScreen, setSharingScreen] = useState(false);

  useEffect(() => {
    if (localRef.current) session.start(localRef.current).catch(console.error);
  }, [session]);

  async function toggleScreenShare() {
    try {
      const nowSharing = await session.toggleScreenShare();
      setSharingScreen(nowSharing);
    } catch (err) {
      console.error("Screen share failed", err);
    }
  }

  return (
    <div className="call-view">
      <h2>Call with {peerName}</h2>
      <div className="video-grid">
        <video ref={bindRemoteVideo} autoPlay playsInline className="remote-video" />
        <video ref={localRef} autoPlay playsInline muted className="local-video" />
      </div>
      <div className="call-controls">
        <button onClick={toggleScreenShare} className={sharingScreen ? "active" : ""}>
          {sharingScreen ? "Stop sharing screen" : "Share screen"}
        </button>
        <button
          className="hangup"
          onClick={() => {
            session.hangup();
            onEnd();
          }}
        >
          Hang up
        </button>
      </div>
    </div>
  );
}
