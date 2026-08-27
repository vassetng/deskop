import { useCallback, useEffect, useRef, useState } from "react";
import Login from "./components/Login";
import Roster, { StaffMember } from "./components/Roster";
import RingModal from "./components/RingModal";
import RingComposeModal from "./components/RingComposeModal";
import Files from "./components/Files";
import Directory from "./components/Directory";
import Messages from "./components/Messages";
import DailyReport from "./components/DailyReport";
import AdminDashboard from "./components/AdminDashboard";
import CallView from "./components/CallView";
import { connectSocket, disconnectSocket, getSocket } from "./lib/socket";
import { getSession, logout, Staff } from "./lib/auth";
import { CallSession } from "./lib/webrtc";
import logo from "./assets/logo.png";

type IncomingRing = { fromId: string; fromName: string; message: string };
type RingTarget = { id: string; name: string };
type ActiveCall = { session: CallSession; peerId: string; peerName: string };
type Conversation = { kind: "dm"; staffId: string; name: string } | { kind: "channel"; department: string };
type Tab = "files" | "directory" | "messages" | "report" | "admin";

export default function App() {
  // Deliberately starts null even if a session is already in sessionStorage
  // (e.g. after a reload): `staff` only flips true once beginSession() has
  // actually connected the socket, in the mount effect below. Otherwise the
  // authenticated tree (Files, etc.) would mount in the very first commit,
  // and its effects — which call getSocket() — fire before App's own mount
  // effect gets a chance to call connectSocket() (React fires child effects
  // before parent effects within the same commit).
  const [staff, setStaff] = useState<Staff | null>(null);
  const [restoring, setRestoring] = useState(!!getSession());
  const [connectError, setConnectError] = useState<string | null>(null);
  const [callError, setCallError] = useState<string | null>(null);
  const [roster, setRoster] = useState<StaffMember[]>([]);
  const [incomingRing, setIncomingRing] = useState<IncomingRing | null>(null);
  const [ringTarget, setRingTarget] = useState<RingTarget | null>(null);
  const [ringAckToast, setRingAckToast] = useState<string | null>(null);
  const ringAudioRef = useRef<HTMLAudioElement | null>(null);
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);
  const activeCallRef = useRef<ActiveCall | null>(null);
  const [tab, setTab] = useState<Tab>("files");
  const [messagesTarget, setMessagesTarget] = useState<Conversation | null>(null);

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

  function nameFor(staffId: string): string {
    return rosterRef.current.find((s) => s.id === staffId)?.name || "Someone";
  }

  function createSession(peerId: string): CallSession {
    return new CallSession(peerId, {
      onRemoteStream: (stream) => {
        pendingStreamRef.current = stream;
        if (remoteVideoElRef.current) remoteVideoElRef.current.srcObject = stream;
      },
      onClose: () => {
        updateActiveCall(null);
        pendingStreamRef.current = null;
      },
    });
  }

  // Local media must be acquired and added to the peer connection BEFORE
  // createOffer()/handleOffer() generate any SDP — this app doesn't
  // implement renegotiation, so tracks added afterward never reach the
  // other side. That means CallView (which mounts once updateActiveCall
  // runs) must not appear until start() has already resolved.
  async function startOutgoingCall(peerId: string, withVideo: boolean) {
    const session = createSession(peerId);
    try {
      await session.start(withVideo);
    } catch (err) {
      console.error("Could not access camera/microphone", err);
      setCallError("Couldn't access your camera/microphone. Check permissions and try again.");
      session.close();
      return;
    }
    updateActiveCall({ session, peerId, peerName: nameFor(peerId) });
    await session.createOffer();
  }

  const beginSession = useCallback(() => {
    const socket = connectSocket();

    socket.on("connect_error", (err) => {
      logout();
      setStaff(null);
      setConnectError(err.message || "Could not connect");
    });

    socket.on(
      "presence:roster",
      (list: { id: string; name: string; staffId: string }[]) => {
        // Dedupe by staffId (one person could have multiple open sessions) and
        // key the roster by staffId, since that's what ring/call target.
        const byStaff = new Map<string, StaffMember>();
        for (const entry of list) byStaff.set(entry.staffId, { id: entry.staffId, name: entry.name });
        setRoster(Array.from(byStaff.values()));
      }
    );

    socket.on(
      "ring:incoming",
      ({ from, message }: { from: { id: string; name: string }; message: string }) => {
        setIncomingRing({ fromId: from.id, fromName: from.name, message: message || "" });
        window.deskop?.notify("Deskop", `${from.name} is asking for you${message ? `: ${message}` : ""}`);
        ringAudioRef.current?.pause();
        const audio = new Audio("/ring.wav");
        audio.loop = true;
        ringAudioRef.current = audio;
        audio.play().catch((err) => console.warn("Ring tone blocked:", err.message));
      }
    );

    socket.on("ring:acknowledged", ({ from }: { from: { id: string; name: string } }) => {
      setRingAckToast(`${from.name} saw your ring.`);
    });

    socket.on(
      "call:offer",
      async ({
        from,
        offer,
        video,
      }: {
        from: string;
        fromName: string;
        offer: RTCSessionDescriptionInit;
        video: boolean;
      }) => {
        const session = createSession(from);
        try {
          await session.start(video);
        } catch (err) {
          console.error("Could not access camera/microphone for incoming call", err);
          setCallError("Couldn't answer — camera/microphone access failed.");
          session.hangup();
          return;
        }
        updateActiveCall({ session, peerId: from, peerName: nameFor(from) });
        await session.handleOffer(offer);
      }
    );

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
  }, []);

  useEffect(() => {
    const existing = getSession()?.staff;
    if (existing) {
      beginSession();
      setStaff(existing);
    }
    setRestoring(false);
    return () => disconnectSocket();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!callError) return;
    const timer = setTimeout(() => setCallError(null), 6000);
    return () => clearTimeout(timer);
  }, [callError]);

  useEffect(() => {
    if (!ringAckToast) return;
    const timer = setTimeout(() => setRingAckToast(null), 4000);
    return () => clearTimeout(timer);
  }, [ringAckToast]);

  function handleLoggedIn() {
    setConnectError(null);
    setStaff(getSession()!.staff);
    beginSession();
  }

  function handleLogout() {
    disconnectSocket();
    logout();
    setStaff(null);
    setRoster([]);
    setTab("files");
  }

  function handleRing(targetId: string) {
    setRingTarget({ id: targetId, name: nameFor(targetId) });
  }

  function handleSendRing(message: string) {
    if (!ringTarget) return;
    getSocket().emit("ring:send", { to: ringTarget.id, message });
    setRingTarget(null);
  }

  async function handleCall(targetId: string, withVideo: boolean) {
    await startOutgoingCall(targetId, withVideo);
  }

  function handleAcknowledgeRing() {
    if (!incomingRing) return;
    getSocket().emit("ring:acknowledge", incomingRing.fromId);
    ringAudioRef.current?.pause();
    ringAudioRef.current = null;
    setIncomingRing(null);
  }

  function handleMessageFromDirectory(staffId: string) {
    const target = roster.find((s) => s.id === staffId);
    setMessagesTarget({ kind: "dm", staffId, name: target?.name || "Staff" });
    setTab("messages");
  }

  if (restoring) {
    return <div className="login-screen" />;
  }

  if (!staff) {
    return (
      <>
        <Login onLoggedIn={handleLoggedIn} />
        {connectError && (
          <div className="connect-error-toast">Disconnected: {connectError}. Please sign in again.</div>
        )}
      </>
    );
  }

  const onlineStaffIds = new Set(roster.map((r) => r.id));

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <img src={logo} alt="" className="header-logo" />
          <h1>Deskop</h1>
        </div>
        <div className="header-right">
          <span className="self-name">
            {staff.displayName} · {staff.department}
          </span>
          <button className="logout-btn" onClick={handleLogout}>
            Sign out
          </button>
        </div>
      </header>

      <main className="app-main">
        <Roster roster={roster} selfId={staff.id} onRing={handleRing} onCall={handleCall} busy={!!activeCall} />
        <div className="main-panel">
          {activeCall ? (
            <CallView
              session={activeCall.session}
              peerName={activeCall.peerName}
              withVideo={activeCall.session.withVideo}
              bindRemoteVideo={bindRemoteVideo}
              onEnd={() => updateActiveCall(null)}
            />
          ) : (
            <>
              <div className="tab-bar">
                <button className={tab === "files" ? "active" : ""} onClick={() => setTab("files")}>
                  Files
                </button>
                <button className={tab === "directory" ? "active" : ""} onClick={() => setTab("directory")}>
                  Directory
                </button>
                <button className={tab === "messages" ? "active" : ""} onClick={() => setTab("messages")}>
                  Messages
                </button>
                <button className={tab === "report" ? "active" : ""} onClick={() => setTab("report")}>
                  Daily report
                </button>
                {staff.role === "admin" && (
                  <button className={tab === "admin" ? "active" : ""} onClick={() => setTab("admin")}>
                    Admin
                  </button>
                )}
              </div>
              {tab === "files" && <Files />}
              {tab === "directory" && (
                <Directory
                  onlineStaffIds={onlineStaffIds}
                  onRing={handleRing}
                  onCall={handleCall}
                  onMessage={handleMessageFromDirectory}
                />
              )}
              {tab === "messages" && <Messages initialConversation={messagesTarget} />}
              {tab === "report" && <DailyReport />}
              {tab === "admin" && staff.role === "admin" && <AdminDashboard />}
            </>
          )}
        </div>
      </main>

      {incomingRing && (
        <RingModal
          fromName={incomingRing.fromName}
          message={incomingRing.message}
          onAcknowledge={handleAcknowledgeRing}
        />
      )}

      {ringTarget && (
        <RingComposeModal
          targetName={ringTarget.name}
          onSend={handleSendRing}
          onCancel={() => setRingTarget(null)}
        />
      )}

      {callError && <div className="connect-error-toast">{callError}</div>}
      {ringAckToast && <div className="connect-error-toast ring-ack-toast">{ringAckToast}</div>}
    </div>
  );
}
