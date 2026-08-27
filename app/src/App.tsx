import { useCallback, useEffect, useRef, useState } from "react";
import Login from "./components/Login";
import Roster, { StaffMember } from "./components/Roster";
import RingModal from "./components/RingModal";
import Files from "./components/Files";
import DailyReport from "./components/DailyReport";
import AdminReports from "./components/AdminReports";
import CallView from "./components/CallView";
import { connectSocket, disconnectSocket, getSocket } from "./lib/socket";
import { CallSession } from "./lib/webrtc";

type IncomingRing = { fromId: string; fromName: string };
type ActiveCall = { session: CallSession; peerId: string; peerName: string };
type Tab = "files" | "report" | "admin";

export default function App() {
  const [selfName, setSelfName] = useState<string | null>(null);
  const [selfId, setSelfId] = useState<string | null>(null);
  const [roster, setRoster] = useState<StaffMember[]>([]);
  const [incomingRing, setIncomingRing] = useState<IncomingRing | null>(null);
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);
  const activeCallRef = useRef<ActiveCall | null>(null);
  const [tab, setTab] = useState<Tab>("files");

  const rosterRef = useRef<StaffMember[]>([]);
  rosterRef.current = roster;

  function updateActiveCall(next: ActiveCall | null) {
    activeCallRef.current = next;
    setActiveCall(next);
  }

  const remoteVideoElRef = useRef<HTMLVideoElement | null>(null);
  const pendingStreamRef = useRef<MediaStream | null>(null);

  const bindRemoteVideo = useCallback((el: HTMLVideoElement | null) => {
    remoteVideoElRef.current = el;
    if (el && pendingStreamRef.current) {
      el.srcObject = pendingStreamRef.current;
    }
  }, []);

  function nameFor(id: string): string {
    return rosterRef.current.find((s) => s.id === id)?.name || "Someone";
  }

  function startCall(peerId: string) {
    const session = new CallSession(peerId, {
      onRemoteStream: (stream) => {
        pendingStreamRef.current = stream;
        if (remoteVideoElRef.current) remoteVideoElRef.current.srcObject = stream;
      },
      onClose: () => {
        updateActiveCall(null);
        pendingStreamRef.current = null;
      },
    });
    updateActiveCall({ session, peerId, peerName: nameFor(peerId) });
    return session;
  }

  const handleJoin = useCallback((name: string, _serverUrl: string) => {
    const socket = connectSocket();
    socket.on("connect", () => {
      setSelfId(socket.id);
      socket.emit("presence:join", name);
    });

    socket.on("presence:roster", (list: StaffMember[]) => setRoster(list));

    socket.on("ring:incoming", ({ from }: { from: StaffMember }) => {
      setIncomingRing({ fromId: from.id, fromName: from.name });
      window.deskop?.notify("Deskop", `${from.name} is ringing you`);
      const audio = new Audio("/ring.wav");
      audio.play().catch(() => {});
    });

    socket.on("call:offer", async ({ from, offer }: { from: string; offer: RTCSessionDescriptionInit }) => {
      const session = startCall(from);
      await session.handleOffer(offer);
    });

    socket.on("call:answer", async ({ from, answer }: { from: string; answer: RTCSessionDescriptionInit }) => {
      const current = activeCallRef.current;
      if (current && current.peerId === from) {
        await current.session.handleAnswer(answer);
      }
    });

    socket.on("call:ice", async ({ from, candidate }: { from: string; candidate: RTCIceCandidateInit }) => {
      const current = activeCallRef.current;
      if (current && current.peerId === from) {
        await current.session.handleIce(candidate);
      }
    });

    socket.on("call:hangup", () => {
      activeCallRef.current?.session.close();
      updateActiveCall(null);
    });

    setSelfName(name);
  }, []);

  useEffect(() => {
    return () => disconnectSocket();
  }, []);

  function handleRing(targetId: string) {
    getSocket().emit("ring:send", targetId);
  }

  async function handleCall(targetId: string) {
    const session = startCall(targetId);
    await session.createOffer();
  }

  function handleAcceptRing() {
    if (!incomingRing) return;
    const targetId = incomingRing.fromId;
    setIncomingRing(null);
    handleCall(targetId);
  }

  function handleDismissRing() {
    if (!incomingRing) return;
    getSocket().emit("ring:dismiss", incomingRing.fromId);
    setIncomingRing(null);
  }

  if (!selfName) {
    return <Login onJoin={handleJoin} />;
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>Deskop</h1>
        <span className="self-name">Signed in as {selfName}</span>
      </header>

      <main className="app-main">
        <Roster
          roster={roster}
          selfId={selfId}
          onRing={handleRing}
          onCall={handleCall}
          busy={!!activeCall}
        />
        <div className="main-panel">
          {activeCall ? (
            <CallView
              session={activeCall.session}
              peerName={activeCall.peerName}
              bindRemoteVideo={bindRemoteVideo}
              onEnd={() => updateActiveCall(null)}
            />
          ) : (
            <>
              <div className="tab-bar">
                <button className={tab === "files" ? "active" : ""} onClick={() => setTab("files")}>
                  Files
                </button>
                <button className={tab === "report" ? "active" : ""} onClick={() => setTab("report")}>
                  Daily report
                </button>
                <button className={tab === "admin" ? "active" : ""} onClick={() => setTab("admin")}>
                  Admin
                </button>
              </div>
              {tab === "files" && <Files selfName={selfName} />}
              {tab === "report" && <DailyReport selfName={selfName} />}
              {tab === "admin" && <AdminReports />}
            </>
          )}
        </div>
      </main>

      {incomingRing && (
        <RingModal
          fromName={incomingRing.fromName}
          onAccept={handleAcceptRing}
          onDismiss={handleDismissRing}
        />
      )}
    </div>
  );
}
