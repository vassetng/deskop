import { getSocket } from "./socket";

const ICE_SERVERS: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];

export type CallHandlers = {
  onRemoteStream: (stream: MediaStream) => void;
  onClose: () => void;
};

export class CallSession {
  peerId: string;
  pc: RTCPeerConnection;
  localStream: MediaStream | null = null;
  cameraTrack: MediaStreamTrack | null = null;
  private handlers: CallHandlers;
  private started = false;

  constructor(peerId: string, handlers: CallHandlers) {
    this.peerId = peerId;
    this.handlers = handlers;
    this.pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    this.pc.onicecandidate = (e) => {
      if (e.candidate) {
        getSocket().emit("call:ice", { to: peerId, candidate: e.candidate });
      }
    };

    this.pc.ontrack = (e) => {
      this.handlers.onRemoteStream(e.streams[0]);
    };

    this.pc.onconnectionstatechange = () => {
      if (["closed", "failed", "disconnected"].includes(this.pc.connectionState)) {
        this.handlers.onClose();
      }
    };
  }

  async start(localVideo: HTMLVideoElement) {
    if (this.started) return;
    this.started = true;
    this.localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    this.cameraTrack = this.localStream.getVideoTracks()[0] || null;
    localVideo.srcObject = this.localStream;
    this.localStream.getTracks().forEach((track) => this.pc.addTrack(track, this.localStream!));
  }

  async createOffer() {
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    getSocket().emit("call:offer", { to: this.peerId, offer });
  }

  async handleOffer(offer: RTCSessionDescriptionInit) {
    if (this.pc.signalingState !== "stable") return;
    await this.pc.setRemoteDescription(offer);
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    getSocket().emit("call:answer", { to: this.peerId, answer });
  }

  async handleAnswer(answer: RTCSessionDescriptionInit) {
    if (this.pc.signalingState !== "have-local-offer") return;
    await this.pc.setRemoteDescription(answer);
  }

  async handleIce(candidate: RTCIceCandidateInit) {
    try {
      await this.pc.addIceCandidate(candidate);
    } catch (err) {
      console.error("Failed to add ICE candidate", err);
    }
  }

  async toggleScreenShare(): Promise<boolean> {
    const sender = this.pc.getSenders().find((s) => s.track?.kind === "video");
    if (!sender) return false;

    const isSharingScreen = sender.track?.label.toLowerCase().includes("screen");
    if (isSharingScreen && this.cameraTrack) {
      await sender.replaceTrack(this.cameraTrack);
      return false;
    }

    const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
    const screenTrack = screenStream.getVideoTracks()[0];
    await sender.replaceTrack(screenTrack);
    screenTrack.onended = () => {
      if (this.cameraTrack) sender.replaceTrack(this.cameraTrack);
    };
    return true;
  }

  hangup() {
    getSocket().emit("call:hangup", { to: this.peerId });
    this.close();
  }

  close() {
    this.localStream?.getTracks().forEach((t) => t.stop());
    this.pc.close();
  }
}
