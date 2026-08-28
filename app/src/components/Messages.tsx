import { useEffect, useMemo, useRef, useState } from "react";
import { authFetch, getServerUrl, getSession, getToken, Staff } from "../lib/auth";
import { getSocket } from "../lib/socket";

export type Conversation = { kind: "dm"; staffId: string; name: string } | { kind: "channel"; department: string };

type Attachment = { storedName: string; originalName: string; size: number };

type Message = {
  id: string;
  kind: "dm" | "channel";
  target: string;
  fromId: string;
  fromName: string;
  text: string;
  attachment: Attachment | null;
  sentAt: string;
};

export function conversationKey(c: Conversation): string {
  return c.kind === "dm" ? `dm:${c.staffId}` : `channel:${c.department}`;
}

function dmKey(idA: string, idB: string): string {
  return [idA, idB].sort().join(":");
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function Messages({
  selected,
  onSelect,
  unreadCounts,
}: {
  selected: Conversation | null;
  onSelect: (c: Conversation) => void;
  unreadCounts: Record<string, number>;
}) {
  const self = getSession()!.staff;
  const [staff, setStaff] = useState<Staff[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [uploading, setUploading] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);
  const threadEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    authFetch("/auth/staff").then((r) => r.json()).then(setStaff).catch(() => {});
    authFetch("/departments").then((r) => r.json()).then(setDepartments).catch(() => {});
  }, []);

  const visibleChannels = useMemo(() => {
    if (self.role === "admin") return departments;
    return departments.filter((d) => d === self.department);
  }, [departments, self]);

  useEffect(() => {
    if (!selected) return;
    const params =
      selected.kind === "dm"
        ? `kind=dm&with=${selected.staffId}`
        : `kind=channel&department=${encodeURIComponent(selected.department)}`;
    authFetch(`/messages?${params}`)
      .then((r) => r.json())
      .then(setMessages)
      .catch(() => setMessages([]));
  }, [selected && conversationKey(selected)]);

  useEffect(() => {
    const socket = getSocket();
    const onNew = (msg: Message) => {
      if (!selected) return;
      const matches =
        (selected.kind === "dm" && msg.kind === "dm" && msg.target === dmKey(self.id, selected.staffId)) ||
        (selected.kind === "channel" && msg.kind === "channel" && msg.target === selected.department);
      if (matches) setMessages((prev) => [...prev, msg]);
    };
    socket.on("message:new", onNew);
    return () => {
      socket.off("message:new", onNew);
    };
  }, [selected && conversationKey(selected)]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function sendPayload(text: string, attachment: Attachment | null) {
    if (!selected) return;
    const socket = getSocket();
    if (selected.kind === "dm") {
      socket.emit("message:send", { kind: "dm", to: selected.staffId, text, attachment });
    } else {
      socket.emit("message:send", { kind: "channel", to: selected.department, text, attachment });
    }
  }

  function send(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    sendPayload(draft.trim(), null);
    setDraft("");
  }

  async function handleAttach(file: File) {
    if (!selected) return;
    setUploading(true);
    setAttachError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await authFetch("/messages/attachments", { method: "POST", body: form });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Server rejected the upload (HTTP ${res.status}).`);
      }
      const attachment: Attachment = await res.json();
      sendPayload("", attachment);
    } catch (err: any) {
      const reason = err?.message || "Check your connection and try again.";
      setAttachError(`Couldn't send "${file.name}": ${reason}`);
    } finally {
      setUploading(false);
    }
  }

  const contacts = staff.filter((s) => s.id !== self.id);

  return (
    <div className="messages-panel">
      <div className="conversation-list">
        <h3>Channels</h3>
        <ul>
          {visibleChannels.map((d) => {
            const unread = unreadCounts[`channel:${d}`] || 0;
            return (
              <li key={d}>
                <button
                  className={selected?.kind === "channel" && selected.department === d ? "active" : ""}
                  onClick={() => onSelect({ kind: "channel", department: d })}
                >
                  # {d}
                  {unread > 0 && <span className="unread-badge">{unread}</span>}
                </button>
              </li>
            );
          })}
        </ul>
        <h3>Direct messages</h3>
        <ul>
          {contacts.map((s) => {
            const unread = unreadCounts[`dm:${s.id}`] || 0;
            return (
              <li key={s.id}>
                <button
                  className={selected?.kind === "dm" && selected.staffId === s.id ? "active" : ""}
                  onClick={() => onSelect({ kind: "dm", staffId: s.id, name: s.displayName })}
                >
                  {s.displayName}
                  {unread > 0 && <span className="unread-badge">{unread}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="thread">
        {!selected && <p className="empty">Pick a channel or a person to start messaging.</p>}
        {selected && (
          <>
            <div className="thread-header">
              {selected.kind === "channel" ? `# ${selected.department}` : selected.name}
            </div>
            <div className="thread-messages">
              {messages.length === 0 && <p className="empty">No messages yet. Say hello.</p>}
              {messages.map((m) => (
                <div key={m.id} className={`message-bubble ${m.fromId === self.id ? "own" : ""}`}>
                  {m.fromId !== self.id && <div className="message-author">{m.fromName}</div>}
                  {m.text && <div className="message-text">{m.text}</div>}
                  {m.attachment && (
                    <a
                      className="message-attachment"
                      href={`${getServerUrl()}/messages/attachments/${m.attachment.storedName}?token=${getToken()}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      📎 {m.attachment.originalName}
                      <span className="meta"> · {formatSize(m.attachment.size)}</span>
                    </a>
                  )}
                  <div className="message-time">{new Date(m.sentAt).toLocaleTimeString()}</div>
                </div>
              ))}
              <div ref={threadEndRef} />
            </div>
            {attachError && <div className="report-error">{attachError}</div>}
            <form className="thread-composer" onSubmit={send}>
              <button
                type="button"
                className="attach-btn"
                title="Attach a file"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploading ? "…" : "📎"}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleAttach(file);
                  e.target.value = "";
                }}
              />
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Type a message…"
                autoFocus
              />
              <button type="submit" disabled={!draft.trim()}>
                Send
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
