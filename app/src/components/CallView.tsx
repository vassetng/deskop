import { useEffect, useRef, useState } from "react";
import { CallSession } from "../lib/webrtc";
import { StaffMember } from "./Roster";
import AddToCallModal from "./AddToCallModal";

export default function CallView({
  session,
  peerId,
  peerName,
  withVideo,
  onlineStaff,
  selfId,
  onAddToCall,
  onEnd,
  bindRemoteVideo,
}: {
  session: CallSession;
  peerId: string;
  peerName: string;
  withVideo: boolean;
  onlineStaff: StaffMember[];
  selfId: string;
  onAddToCall: (staffId: string) => void;
  onEnd: () => void;
  bindRemoteVideo: (el: HTMLVideoElement | null) => void;
}) {
  const localRef = useRef<HTMLVideoElement>(null);
  const [sharingScreen, setSharingScreen] = useState(false);
  const [screenSources, setScreenSources] = useState<ScreenSource[] | null>(null);
  const [screenShareError, setScreenShareError] = useState<string | null>(null);
  const [addPickerOpen, setAddPickerOpen] = useState(false);

  useEffect(() => {
    // By the time CallView mounts, App.tsx has already awaited
    // session.start() before negotiating — localStream is ready here.
    if (localRef.current && session.localStream) {
      localRef.current.srcObject = session.localStream;
    }
  }, [session]);

  async function shareWithSource(sourceId?: string) {
    setScreenSources(null);
    try {
      const nowSharing = await session.toggleScreenShare(sourceId);
      setSharingScreen(nowSharing);
      setScreenShareError(null);
    } catch (err: any) {
      console.error("Screen share failed", err);
      setScreenShareError(err?.message || "Couldn't start screen sharing.");
    }
  }

  async function toggleScreenShare() {
    if (sharingScreen) {
      shareWithSource();
      return;
    }
    // In Electron, pick a specific screen/window instead of relying on the
    // browser's own getDisplayMedia picker (which Electron doesn't provide).
    if (window.deskop) {
      setScreenShareError(null);
      const sources = await window.deskop.getScreenSources();
      if (sources.length === 0) {
        setScreenShareError("No screens or windows available to share.");
        return;
      }
      setScreenSources(sources);
      return;
    }
    shareWithSource();
  }

  return (
    <div className="call-view">
      <h2>Call with {peerName}</h2>
      <div className={`video-grid ${withVideo ? "" : "audio-only"}`}>
        <video ref={bindRemoteVideo} autoPlay playsInline className="remote-video" />
        {withVideo ? (
          <video ref={localRef} autoPlay playsInline muted className="local-video" />
        ) : (
          <div className="audio-only-badge">🎤 Audio call</div>
        )}
      </div>

      {screenShareError && <div className="report-error">{screenShareError}</div>}

      {screenSources && (
        <div className="screen-picker-overlay" onClick={() => setScreenSources(null)}>
          <div className="screen-picker" onClick={(e) => e.stopPropagation()}>
            <h3>Share your screen</h3>
            <div className="screen-source-grid">
              {screenSources.map((s) => (
                <button key={s.id} className="screen-source" onClick={() => shareWithSource(s.id)}>
                  {s.thumbnail ? (
                    <img src={s.thumbnail} alt={s.name} />
                  ) : (
                    <div className="screen-source-placeholder" />
                  )}
                  <span>{s.name}</span>
                </button>
              ))}
            </div>
            <button className="link-btn" onClick={() => setScreenSources(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {addPickerOpen && (
        <AddToCallModal
          candidates={onlineStaff.filter((s) => s.id !== selfId && s.id !== peerId)}
          onAdd={(staffId) => {
            setAddPickerOpen(false);
            onAddToCall(staffId);
          }}
          onCancel={() => setAddPickerOpen(false)}
        />
      )}

      <div className="call-controls">
        <button onClick={() => setAddPickerOpen(true)} title="Add someone to this call">
          ➕ Add to call
        </button>
        <button
          onClick={toggleScreenShare}
          disabled={!withVideo}
          title={withVideo ? "" : "Switch to a video call to share your screen"}
          className={sharingScreen ? "active" : ""}
        >
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
