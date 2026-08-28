import { getSocket } from "./socket";

const ICE_SERVERS: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];

export type GroupCallHandlers = {
  onRemoteStream: (peerId: string, stream: MediaStream) => void;
  onPeerLeft: (peerId: string) => void;
};

/**
 * Mesh WebRTC group call: every participant holds one RTCPeerConnection per
 * other participant (no SFU in this prototype, so this doesn't scale past a
 * handful of people — capped server-side). A newly-joining participant is
 * always the one who creates offers to everyone already in the call; that
 * one-directional rule is what avoids two peers racing to offer each other.
 */
export class GroupCallSession {
  callId: string;
  withVideo: boolean;
  localStream: MediaStream | null = null;
  private peers = new Map<string, RTCPeerConnection>();
  private handlers: GroupCallHandlers;
  private started = false;

  constructor(callId: string, withVideo: boolean, handlers: GroupCallHandlers) {
    this.callId = callId;
    this.withVideo = withVideo;
    this.handlers = handlers;
  }

  async start() {
    if (this.started) return;
    this.started = true;
    this.localStream = await navigator.mediaDevices.getUserMedia({ video: this.withVideo, audio: true });
  }

  private ensurePeer(peerId: string): RTCPeerConnection {
    const existing = this.peers.get(peerId);
    if (existing) return existing;

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pc.onicecandidate = (e) => {
      if (e.candidate) {
        getSocket().emit("group-call:ice", { callId: this.callId, to: peerId, candidate: e.candidate });
      }
    };
    pc.ontrack = (e) => this.handlers.onRemoteStream(peerId, e.streams[0]);
    pc.onconnectionstatechange = () => {
      if (["closed", "failed", "disconnected"].includes(pc.connectionState)) {
        this.removePeer(peerId);
        this.handlers.onPeerLeft(peerId);
      }
    };
    this.localStream?.getTracks().forEach((track) => pc.addTrack(track, this.localStream!));
    this.peers.set(peerId, pc);
    return pc;
  }

  async offerTo(peerId: string) {
    const pc = this.ensurePeer(peerId);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    getSocket().emit("group-call:offer", { callId: this.callId, to: peerId, offer, video: this.withVideo });
  }

  async handleOffer(peerId: string, offer: RTCSessionDescriptionInit) {
    const pc = this.ensurePeer(peerId);
    if (pc.signalingState !== "stable") return;
    await pc.setRemoteDescription(offer);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    getSocket().emit("group-call:answer", { callId: this.callId, to: peerId, answer });
  }

  async handleAnswer(peerId: string, answer: RTCSessionDescriptionInit) {
    const pc = this.peers.get(peerId);
    if (pc && pc.signalingState === "have-local-offer") {
      await pc.setRemoteDescription(answer);
    }
  }

  async handleIce(peerId: string, candidate: RTCIceCandidateInit) {
    const pc = this.peers.get(peerId);
    if (!pc) return;
    try {
      await pc.addIceCandidate(candidate);
    } catch (err) {
      console.error("Failed to add ICE candidate", err);
    }
  }

  removePeer(peerId: string) {
    this.peers.get(peerId)?.close();
    this.peers.delete(peerId);
  }

  leave() {
    getSocket().emit("group-call:leave", { callId: this.callId });
    this.close();
  }

  close() {
    this.localStream?.getTracks().forEach((t) => t.stop());
    for (const pc of this.peers.values()) pc.close();
    this.peers.clear();
  }
}
