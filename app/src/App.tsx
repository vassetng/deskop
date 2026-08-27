import { useCallback, useEffect, useRef, useState } from "react";
import Login from "./components/Login";
import Roster, { StaffMember } from "./components/Roster";
import RingModal from "./components/RingModal";
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

type IncomingRing = { fromId: string; fromName: string };
type ActiveCall = { session: CallSession; peerId: string; peerName: string };
type Conversation = { kind: "dm"; staffId: string; name: string } | { kind: "channel"; department: string };
type Tab = "files" | "directory" | "messages" | "report" | "admin";

export default function App() {
  const [staff, setStaff] = useState<Staff | null>(getSession()?.staff ?? null);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [roster, setRoster] = useState<StaffMember[]>([]);
  const [incomingRing, setIncomingRing] = useState<IncomingRing | null>(null);
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

    socket.on("ring:incoming", ({ from }: { from: { id: string; name: string } }) => {
      setIncomingRing({ fromId: from.id, fromName: from.name });
      window.deskop?.notify("Deskop", `${from.name} is ringing you`);
      const audio = new Audio("/ring.wav");
      audio.play().catch(() => {});
    });

    socket.on(
      "call:offer",
      async ({ from, offer }: { from: string; fromName: string; offer: RTCSessionDescriptionInit }) => {
        const session = startCall(from);
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
    if (staff) beginSession();
    return () => disconnectSocket();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  function handleMessageFromDirectory(staffId: string) {
    const target = roster.find((s) => s.id === staffId);
    setMessagesTarget({ kind: "dm", staffId, name: target?.name || "Staff" });
    setTab("messages");
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
        <RingModal fromName={incomingRing.fromName} onAccept={handleAcceptRing} onDismiss={handleDismissRing} />
      )}
    </div>
  );
}
