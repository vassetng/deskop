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
  withVideo = true;
  private handlers: CallHandlers;
  private started = false;
  private sharingScreen = false;

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

  /**
   * Acquires local media and adds it to the peer connection. This MUST
   * complete before createOffer()/handleOffer() — adding tracks after the
   * initial offer/answer requires renegotiation (a fresh offer/answer round
   * on "negotiationneeded"), which this app doesn't implement, so tracks
   * added late are simply never carried to the other side. Binding the
   * resulting localStream to a preview <video> element is a separate,
   * later concern (see CallView), not this method's job.
   */
  async start(withVideo: boolean) {
    if (this.started) return;
    this.started = true;
    this.withVideo = withVideo;
    this.localStream = await navigator.mediaDevices.getUserMedia({ video: withVideo, audio: true });
    this.cameraTrack = this.localStream.getVideoTracks()[0] || null;
    this.localStream.getTracks().forEach((track) => this.pc.addTrack(track, this.localStream!));
  }

  async createOffer() {
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    getSocket().emit("call:offer", { to: this.peerId, offer, video: this.withVideo });
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

  /**
   * `sourceId` comes from Electron's desktopCapturer (via the app's screen
   * picker) and lets us capture a specific screen/window directly through
   * getUserMedia's Electron-specific constraint. Without it, falls back to
   * the browser's own getDisplayMedia picker (used only outside Electron).
   */
  async toggleScreenShare(sourceId?: string): Promise<boolean> {
    const sender = this.pc.getSenders().find((s) => s.track?.kind === "video");
    if (!sender) {
      throw new Error("No active video track to share your screen through — camera video isn't running.");
    }

    if (this.sharingScreen) {
      if (this.cameraTrack) await sender.replaceTrack(this.cameraTrack);
      this.sharingScreen = false;
      return false;
    }

    const screenStream = sourceId
      ? await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            mandatory: {
              chromeMediaSource: "desktop",
              chromeMediaSourceId: sourceId,
            },
          },
        } as MediaStreamConstraints)
      : await navigator.mediaDevices.getDisplayMedia({ video: true });

    const screenTrack = screenStream.getVideoTracks()[0];
    await sender.replaceTrack(screenTrack);
    this.sharingScreen = true;
    screenTrack.onended = () => {
      if (this.cameraTrack) sender.replaceTrack(this.cameraTrack);
      this.sharingScreen = false;
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
