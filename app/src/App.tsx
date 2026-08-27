import { useCallback, useEffect, useRef, useState } from "react";
import Login from "./components/Login";
import Roster, { StaffMember } from "./components/Roster";
import RingModal from "./components/RingModal";
import RingComposeModal from "./components/RingComposeModal";
import IncomingCallModal from "./components/IncomingCallModal";
import OutgoingCallModal from "./components/OutgoingCallModal";
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
type OutgoingCall = { id: string; name: string; withVideo: boolean };
type IncomingCallInvite = { fromId: string; fromName: string; withVideo: boolean };
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
  const [outgoingCall, setOutgoingCall] = useState<OutgoingCall | null>(null);
  const outgoingCallRef = useRef<OutgoingCall | null>(null);
  const [incomingCallInvite, setIncomingCallInvite] = useState<IncomingCallInvite | null>(null);
  const callAudioRef = useRef<HTMLAudioElement | null>(null);
  const [tab, setTab] = useState<Tab>("files");
  const [messagesTarget, setMessagesTarget] = useState<Conversation | null>(null);

  const rosterRef = useRef<StaffMember[]>([]);
  rosterRef.current = roster;

  function updateActiveCall(next: ActiveCall | null) {
    activeCallRef.current = next;
    setActiveCall(next);
  }

  function updateOutgoingCall(next: OutgoingCall | null) {
    outgoingCallRef.current = next;
    setOutgoingCall(next);
  }

  function stopCallTone() {
    callAudioRef.current?.pause();
    callAudioRef.current = null;
  }

  function playCallTone() {
    callAudioRef.current?.pause();
    const audio = new Audio(`${import.meta.env.BASE_URL}ring.wav`);
    audio.loop = true;
    callAudioRef.current = audio;
    audio.play().catch((err) => console.warn("Ring tone blocked:", err.message));
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
  //
  // This only runs once the other side has explicitly accepted an
  // invite (see call:accept below) — calls no longer auto-connect.
  async function startOutgoingCall(peerId: string, withVideo: boolean) {
    const session = createSession(peerId);
    try {
      await session.start(withVideo);
    } catch (err) {
      console.error("Could not access camera/microphone", err);
      setCallError("Couldn't access your camera/microphone. Check permissions and try again.");
      session.close();
      getSocket().emit("call:hangup", { to: peerId });
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
        // A hardcoded "/ring.wav" resolves against the filesystem root once
        // packaged (Electron loads the built app via file://, not an http
        // origin), silently failing to load. import.meta.env.BASE_URL
        // respects vite's configured base ("./") and resolves correctly in
        // both dev and the packaged app.
        const audio = new Audio(`${import.meta.env.BASE_URL}ring.wav`);
        audio.loop = true;
        ringAudioRef.current = audio;
        audio.play().catch((err) => console.warn("Ring tone blocked:", err.message));
      }
    );

    socket.on("ring:acknowledged", ({ from }: { from: { id: string; name: string } }) => {
      setRingAckToast(`${from.name} saw your ring.`);
    });

    // A call must be accepted before any media/SDP negotiation happens.
    // call:offer only ever arrives after the callee already accepted (see
    // call:accept handling in handleAcceptCall), so local media is already
    // being acquired there — this just completes the actual negotiation.
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
        const current = activeCallRef.current;
        if (current && current.peerId === from) {
          await current.session.handleOffer(offer);
          return;
        }
        // Fallback: an offer arrived without a prior accepted invite on this
        // client (e.g. reload mid-call) — still requires local media first.
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

    // --- Ringing before connecting: invite → accept/decline/cancel ---
    socket.on(
      "call:invite",
      ({ from, fromName, video }: { from: string; fromName: string; video: boolean }) => {
        // Already on a call or already have a pending invite/outgoing call: busy.
        if (activeCallRef.current || outgoingCallRef.current) {
          getSocket().emit("call:decline", { to: from });
          return;
        }
        setIncomingCallInvite({ fromId: from, fromName, withVideo: video });
        window.deskop?.notify("Deskop", `${fromName} is ${video ? "video " : ""}calling you`);
        playCallTone();
      }
    );

    socket.on("call:accept", async ({ from }: { from: string }) => {
      const pending = outgoingCallRef.current;
      if (!pending || pending.id !== from) return;
      updateOutgoingCall(null);
      await startOutgoingCall(pending.id, pending.withVideo);
    });

    socket.on("call:decline", ({ from }: { from: string }) => {
      const pending = outgoingCallRef.current;
      if (!pending || pending.id !== from) return;
      updateOutgoingCall(null);
      setCallError(`${nameFor(from)} declined the call.`);
    });

    socket.on("call:cancel", ({ from }: { from: string }) => {
      setIncomingCallInvite((current) => {
        if (!current || current.fromId !== from) return current;
        stopCallTone();
        return null;
      });
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
    activeCallRef.current?.session.close();
    updateActiveCall(null);
    updateOutgoingCall(null);
    setIncomingCallInvite(null);
    stopCallTone();
  }

  function handleRing(targetId: string) {
    setRingTarget({ id: targetId, name: nameFor(targetId) });
  }

  function handleSendRing(message: string) {
    if (!ringTarget) return;
    getSocket().emit("ring:send", { to: ringTarget.id, message });
    setRingTarget(null);
  }

  function handleCall(targetId: string, withVideo: boolean) {
    if (activeCall || outgoingCall || incomingCallInvite) return;
    updateOutgoingCall({ id: targetId, name: nameFor(targetId), withVideo });
    getSocket().emit("call:invite", { to: targetId, video: withVideo });
  }

  function handleCancelOutgoingCall() {
    if (!outgoingCall) return;
    getSocket().emit("call:cancel", { to: outgoingCall.id });
    updateOutgoingCall(null);
  }

  async function handleAcceptCall() {
    if (!incomingCallInvite) return;
    const { fromId, withVideo } = incomingCallInvite;
    setIncomingCallInvite(null);
    stopCallTone();
    const session = createSession(fromId);
    try {
      await session.start(withVideo);
    } catch (err) {
      console.error("Could not access camera/microphone for incoming call", err);
      setCallError("Couldn't answer — camera/microphone access failed.");
      session.close();
      getSocket().emit("call:decline", { to: fromId });
      return;
    }
    updateActiveCall({ session, peerId: fromId, peerName: nameFor(fromId) });
    getSocket().emit("call:accept", { to: fromId });
  }

  function handleDeclineCall() {
    if (!incomingCallInvite) return;
    getSocket().emit("call:decline", { to: incomingCallInvite.fromId });
    stopCallTone();
    setIncomingCallInvite(null);
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
        <Roster
          roster={roster}
          selfId={staff.id}
          onRing={handleRing}
          onCall={handleCall}
          busy={!!activeCall || !!outgoingCall || !!incomingCallInvite}
        />
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

      {incomingCallInvite && (
        <IncomingCallModal
          fromName={incomingCallInvite.fromName}
          withVideo={incomingCallInvite.withVideo}
          onAccept={handleAcceptCall}
          onDecline={handleDeclineCall}
        />
      )}

      {outgoingCall && (
        <OutgoingCallModal
          toName={outgoingCall.name}
          withVideo={outgoingCall.withVideo}
          onCancel={handleCancelOutgoingCall}
        />
      )}

      {callError && <div className="connect-error-toast">{callError}</div>}
      {ringAckToast && <div className="connect-error-toast ring-ack-toast">{ringAckToast}</div>}
    </div>
  );
}
