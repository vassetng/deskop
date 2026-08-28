import { useEffect, useRef } from "react";
import { GroupCallSession } from "../lib/groupCall";

type Participant = { id: string; name: string };

function RemoteTile({ peer, stream, withVideo }: { peer: Participant; stream: MediaStream | null; withVideo: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);

  return (
    <div className="group-tile">
      {withVideo ? (
        <video ref={ref} autoPlay playsInline className="group-tile-video" />
      ) : (
        <div className="group-tile-audio">🎤</div>
      )}
      <span className="group-tile-name">{peer.name}{!stream ? " · connecting…" : ""}</span>
    </div>
  );
}

export default function GroupCallView({
  session,
  withVideo,
  selfName,
  participants,
  remoteStreams,
  onLeave,
}: {
  session: GroupCallSession;
  withVideo: boolean;
  selfName: string;
  participants: Participant[];
  remoteStreams: Map<string, MediaStream>;
  onLeave: () => void;
}) {
  const localRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (localRef.current && session.localStream) {
      localRef.current.srcObject = session.localStream;
    }
  }, [session]);

  return (
    <div className="call-view group-call-view">
      <h2>Group call ({participants.length + 1})</h2>
      <div className="group-call-grid">
        <div className="group-tile">
          {withVideo ? (
            <video ref={localRef} autoPlay playsInline muted className="group-tile-video" />
          ) : (
            <div className="group-tile-audio">🎤</div>
          )}
          <span className="group-tile-name">{selfName} (you)</span>
        </div>
        {participants.map((p) => (
          <RemoteTile key={p.id} peer={p} stream={remoteStreams.get(p.id) || null} withVideo={withVideo} />
        ))}
      </div>
      <div className="call-controls">
        <button
          className="hangup"
          onClick={() => {
            session.leave();
            onLeave();
          }}
        >
          Leave call
        </button>
      </div>
    </div>
  );
}
