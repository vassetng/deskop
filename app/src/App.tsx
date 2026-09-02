import { useCallback, useEffect, useRef, useState } from "react";
import Login from "./components/Login";
import Roster, { StaffMember } from "./components/Roster";
import RingModal from "./components/RingModal";
import RingComposeModal from "./components/RingComposeModal";
import IncomingCallModal from "./components/IncomingCallModal";
import OutgoingCallModal from "./components/OutgoingCallModal";
import GroupCallComposeModal from "./components/GroupCallComposeModal";
import IncomingGroupCallModal from "./components/IncomingGroupCallModal";
import GroupCallView from "./components/GroupCallView";
import Files from "./components/Files";
import Directory from "./components/Directory";
import Messages, { Conversation, conversationKey } from "./components/Messages";
import DailyReport from "./components/DailyReport";
import AdminDashboard from "./components/AdminDashboard";
import CallView from "./components/CallView";
import { connectSocket, disconnectSocket, getSocket } from "./lib/socket";
import { getSession, logout, Staff } from "./lib/auth";
import { CallSession } from "./lib/webrtc";
import { GroupCallSession } from "./lib/groupCall";
import logo from "./assets/logo.png";

type IncomingRing = { fromId: string; fromName: string; message: string };
type RingTarget = { id: string; name: string };
type ActiveCall = { session: CallSession; peerId: string; peerName: string };
type OutgoingCall = { id: string; name: string; withVideo: boolean };
type IncomingCallInvite = { fromId: string; fromName: string; withVideo: boolean };
type GroupParticipant = { id: string; name: string };
type ActiveGroupCall = { callId: string; withVideo: boolean; session: GroupCallSession };
type IncomingGroupInvite = { callId: string; fromName: string; withVideo: boolean };
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
  const [incomingCallInvite, setIncomingCallInviteState] = useState<IncomingCallInvite | null>(null);
  const incomingCallInviteRef = useRef<IncomingCallInvite | null>(null);
  function setIncomingCallInvite(next: IncomingCallInvite | null) {
    incomingCallInviteRef.current = next;
    setIncomingCallInviteState(next);
  }
  const callAudioRef = useRef<HTMLAudioElement | null>(null);
  const [groupCall, setGroupCall] = useState<ActiveGroupCall | null>(null);
  const groupCallRef = useRef<ActiveGroupCall | null>(null);
  const [groupParticipants, setGroupParticipants] = useState<GroupParticipant[]>([]);
  const groupRemoteStreamsRef = useRef<Map<string, MediaStream>>(new Map());
  const [groupStreamsVersion, setGroupStreamsVersion] = useState(0);
  const [groupInvite, setGroupInvite] = useState<IncomingGroupInvite | null>(null);
  const [groupComposeOpen, setGroupComposeOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("files");
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const openConversationKeyRef = useRef<string | null>(null);

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

  function updateGroupCall(next: ActiveGroupCall | null) {
    groupCallRef.current = next;
    setGroupCall(next);
  }

  function isBusy(): boolean {
    return !!(
      activeCallRef.current ||
      outgoingCallRef.current ||
      incomingCallInviteRef.current ||
      groupCallRef.current
    );
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

    // App-wide, regardless of which tab is open, so a badge can appear on
    // the Messages tab even while looking at Files/Directory/etc. Skips our
    // own messages (the sender is echoed their own message:new too, since
    // they're in the same room) and whichever conversation is actively open
    // in the Messages tab right now.
    socket.on(
      "message:new",
      (msg: { kind: "dm" | "channel"; target: string; fromId: string }) => {
        const selfId = getSession()?.staff.id;
        if (!selfId || msg.fromId === selfId) return;
        const key =
          msg.kind === "dm"
            ? `dm:${msg.target.split(":").find((id) => id !== selfId)}`
            : `channel:${msg.target}`;
        if (openConversationKeyRef.current === key) return;
        setUnreadCounts((prev) => ({ ...prev, [key]: (prev[key] || 0) + 1 }));
      }
    );

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
        if (isBusy()) {
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
      if (incomingCallInviteRef.current?.fromId === from) {
        stopCallTone();
        setIncomingCallInvite(null);
      }
    });

    // --- Group calls: mesh WebRTC, several people in one call ---
    socket.on(
      "group-call:invite",
      ({ callId, fromName, video }: { callId: string; from: string; fromName: string; video: boolean }) => {
        if (isBusy()) {
          getSocket().emit("group-call:decline", { callId });
          return;
        }
        setGroupInvite({ callId, fromName, withVideo: video });
        window.deskop?.notify("Deskop", `${fromName} invited you to a group call`);
        playCallTone();
      }
    );

    // Sent only to the host, right after they create the call — joins them
    // in with nobody else there yet (invitees join in as they each accept).
    socket.on("group-call:created", async ({ callId, video }: { callId: string; video: boolean }) => {
      await joinGroupCall(callId, video, []);
    });

    // Sent only to an invitee once they've accepted — tells them who's
    // already in so they can mesh-connect to each of them.
    socket.on(
      "group-call:joined",
      async ({
        callId,
        video,
        participants,
      }: {
        callId: string;
        video: boolean;
        participants: GroupParticipant[];
      }) => {
        await joinGroupCall(callId, video, participants);
      }
    );

    socket.on("group-call:peer-joined", ({ callId, peer }: { callId: string; peer: GroupParticipant }) => {
      if (groupCallRef.current?.callId !== callId) return;
      setGroupParticipants((prev) => (prev.some((p) => p.id === peer.id) ? prev : [...prev, peer]));
    });

    socket.on(
      "group-call:offer",
      async ({ callId, from, offer }: { callId: string; from: string; offer: RTCSessionDescriptionInit }) => {
        if (groupCallRef.current?.callId !== callId) return;
        await groupCallRef.current.session.handleOffer(from, offer);
      }
    );

    socket.on(
      "group-call:answer",
      async ({ callId, from, answer }: { callId: string; from: string; answer: RTCSessionDescriptionInit }) => {
        if (groupCallRef.current?.callId !== callId) return;
        await groupCallRef.current.session.handleAnswer(from, answer);
      }
    );

    socket.on(
      "group-call:ice",
      async ({ callId, from, candidate }: { callId: string; from: string; candidate: RTCIceCandidateInit }) => {
        if (groupCallRef.current?.callId !== callId) return;
        await groupCallRef.current.session.handleIce(from, candidate);
      }
    );

    socket.on("group-call:peer-left", ({ callId, from }: { callId: string; from: string }) => {
      if (groupCallRef.current?.callId !== callId) return;
      groupCallRef.current.session.removePeer(from);
      groupRemoteStreamsRef.current.delete(from);
      setGroupParticipants((prev) => prev.filter((p) => p.id !== from));
      setGroupStreamsVersion((v) => v + 1);
    });

    socket.on(
      "group-call:declined",
      ({ fromName, reason }: { callId: string; from: string; fromName?: string; reason?: string }) => {
        if (reason === "full") {
          setCallError("That group call is already full.");
        } else if (fromName) {
          setCallError(`${fromName} declined the group call.`);
        }
      }
    );
  }, []);

  async function joinGroupCall(callId: string, withVideo: boolean, existing: GroupParticipant[]) {
    const session = new GroupCallSession(callId, withVideo, {
      onRemoteStream: (peerId, stream) => {
        groupRemoteStreamsRef.current.set(peerId, stream);
        setGroupStreamsVersion((v) => v + 1);
      },
      onPeerLeft: (peerId) => {
        groupRemoteStreamsRef.current.delete(peerId);
        setGroupParticipants((prev) => prev.filter((p) => p.id !== peerId));
        setGroupStreamsVersion((v) => v + 1);
      },
    });
    try {
      await session.start();
    } catch (err) {
      console.error("Could not access camera/microphone for group call", err);
      setCallError("Couldn't join — camera/microphone access failed.");
      getSocket().emit("group-call:leave", { callId });
      return;
    }
    updateGroupCall({ callId, withVideo, session });
    setGroupParticipants(existing);
    for (const p of existing) {
      await session.offerTo(p.id);
    }
  }

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

  // App-activity heartbeat (admin-visible productivity view): reports only
  // the foreground app's process name and idle/active state, every 60s —
  // never a window title, URL, or page content. Electron-only (no-op in a
  // plain browser tab, where window.deskop doesn't exist).
  useEffect(() => {
    if (!staff || !window.deskop) return;
    const IDLE_THRESHOLD_SECONDS = 300;
    const sendHeartbeat = async () => {
      const [appName, idleSeconds] = await Promise.all([
        window.deskop!.getActiveApp(),
        window.deskop!.getIdleSeconds(),
      ]);
      getSocket().emit("activity:heartbeat", { appName, idle: idleSeconds >= IDLE_THRESHOLD_SECONDS });
    };
    sendHeartbeat();
    const interval = setInterval(sendHeartbeat, 60000);
    return () => clearInterval(interval);
  }, [staff]);

  // Whichever conversation is actually visible right now (Messages tab open
  // AND that conversation selected) counts as read — its badge clears and
  // new messages for it are suppressed from re-incrementing the badge while
  // it stays open. Anything else (a different tab, or no selection) means
  // no conversation is "open," so new messages count as unread again.
  useEffect(() => {
    if (tab === "messages" && selectedConversation) {
      const key = conversationKey(selectedConversation);
      openConversationKeyRef.current = key;
      setUnreadCounts((prev) => {
        if (!prev[key]) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });
    } else {
      openConversationKeyRef.current = null;
    }
  }, [tab, selectedConversation]);

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
    groupCallRef.current?.session.close();
    updateGroupCall(null);
    setGroupParticipants([]);
    groupRemoteStreamsRef.current.clear();
    setGroupInvite(null);
    stopCallTone();
    setSelectedConversation(null);
    setUnreadCounts({});
    openConversationKeyRef.current = null;
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
    if (isBusy()) return;
    updateOutgoingCall({ id: targetId, name: nameFor(targetId), withVideo });
    getSocket().emit("call:invite", { to: targetId, video: withVideo });
  }

  function handleStartGroupCall(participantIds: string[], withVideo: boolean) {
    if (isBusy() || participantIds.length === 0) return;
    setGroupComposeOpen(false);
    getSocket().emit("group-call:invite", { participants: participantIds, video: withVideo });
  }

  // Turns an ongoing 1:1 call into a group call: ends the 1:1 leg (the
  // other side sees their call end, then gets rung again as a group
  // invite — no mid-call renegotiation path exists for converting a
  // CallSession into a GroupCallSession in place) and starts a fresh
  // group call inviting both the existing peer and the new person.
  function handleAddToGroupCall(newStaffId: string) {
    if (!activeCall) return;
    const { peerId, session } = activeCall;
    const withVideo = session.withVideo;
    session.hangup();
    updateActiveCall(null);
    getSocket().emit("group-call:invite", { participants: [peerId, newStaffId], video: withVideo });
  }

  async function handleAcceptGroupCall() {
    if (!groupInvite) return;
    const { callId } = groupInvite;
    setGroupInvite(null);
    stopCallTone();
    getSocket().emit("group-call:accept", { callId });
  }

  function handleDeclineGroupCall() {
    if (!groupInvite) return;
    getSocket().emit("group-call:decline", { callId: groupInvite.callId });
    stopCallTone();
    setGroupInvite(null);
  }

  function handleLeaveGroupCall() {
    groupCallRef.current?.session.leave();
    updateGroupCall(null);
    setGroupParticipants([]);
    groupRemoteStreamsRef.current.clear();
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

  function handleOpenDm(staffId: string) {
    const target = roster.find((s) => s.id === staffId);
    setSelectedConversation({ kind: "dm", staffId, name: target?.name || "Staff" });
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
  const totalUnread = Object.values(unreadCounts).reduce((sum, n) => sum + n, 0);

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <img src={logo} alt="" className="header-logo" />
          <h1>Deskop</h1>
        </div>
        <div className="header-right">
          {window.deskop && (
            <span
              className="activity-notice"
              title="Your admin can see your active app and idle/active time for productivity reporting. No window titles, URLs, or page content are ever captured."
            >
              ℹ️ Activity visible to admin
            </span>
          )}
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
          onMessage={handleOpenDm}
          busy={isBusy()}
        />
        <div className="main-panel">
          {groupCall ? (
            <GroupCallView
              session={groupCall.session}
              withVideo={groupCall.withVideo}
              selfName={staff.displayName}
              participants={groupParticipants}
              remoteStreams={groupRemoteStreamsRef.current}
              onLeave={handleLeaveGroupCall}
            />
          ) : activeCall ? (
            <CallView
              session={activeCall.session}
              peerId={activeCall.peerId}
              peerName={activeCall.peerName}
              withVideo={activeCall.session.withVideo}
              onlineStaff={roster}
              selfId={staff.id}
              onAddToCall={handleAddToGroupCall}
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
                  {totalUnread > 0 && <span className="unread-badge">{totalUnread}</span>}
                </button>
                <button className={tab === "report" ? "active" : ""} onClick={() => setTab("report")}>
                  Daily report
                </button>
                {staff.role === "admin" && (
                  <button className={tab === "admin" ? "active" : ""} onClick={() => setTab("admin")}>
                    Admin
                  </button>
                )}
                <button
                  className="group-call-btn"
                  disabled={isBusy()}
                  onClick={() => setGroupComposeOpen(true)}
                  title="Start a group call"
                >
                  👥 Group call
                </button>
              </div>
              {tab === "files" && <Files />}
              {tab === "directory" && (
                <Directory
                  onlineStaffIds={onlineStaffIds}
                  onRing={handleRing}
                  onCall={handleCall}
                  onMessage={handleOpenDm}
                />
              )}
              {tab === "messages" && (
                <Messages
                  selected={selectedConversation}
                  onSelect={setSelectedConversation}
                  unreadCounts={unreadCounts}
                />
              )}
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

      {groupComposeOpen && (
        <GroupCallComposeModal
          onlineStaff={roster}
          selfId={staff.id}
          onStart={handleStartGroupCall}
          onCancel={() => setGroupComposeOpen(false)}
        />
      )}

      {groupInvite && (
        <IncomingGroupCallModal
          fromName={groupInvite.fromName}
          withVideo={groupInvite.withVideo}
          onAccept={handleAcceptGroupCall}
          onDecline={handleDeclineGroupCall}
        />
      )}

      {callError && <div className="connect-error-toast">{callError}</div>}
      {ringAckToast && <div className="connect-error-toast ring-ack-toast">{ringAckToast}</div>}
    </div>
  );
}
