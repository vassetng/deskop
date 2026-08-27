import { useEffect, useMemo, useRef, useState } from "react";
import { authFetch, getSession, Staff } from "../lib/auth";
import { getSocket } from "../lib/socket";

type Conversation = { kind: "dm"; staffId: string; name: string } | { kind: "channel"; department: string };

type Message = {
  id: string;
  kind: "dm" | "channel";
  target: string;
  fromId: string;
  fromName: string;
  text: string;
  sentAt: string;
};

function conversationKey(c: Conversation): string {
  return c.kind === "dm" ? `dm:${c.staffId}` : `channel:${c.department}`;
}

function dmKey(idA: string, idB: string): string {
  return [idA, idB].sort().join(":");
}

export default function Messages({ initialConversation }: { initialConversation: Conversation | null }) {
  const self = getSession()!.staff;
  const [staff, setStaff] = useState<Staff[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [selected, setSelected] = useState<Conversation | null>(initialConversation);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const threadEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    authFetch("/auth/staff").then((r) => r.json()).then(setStaff).catch(() => {});
    authFetch("/departments").then((r) => r.json()).then(setDepartments).catch(() => {});
  }, []);

  useEffect(() => {
    if (initialConversation) setSelected(initialConversation);
  }, [initialConversation]);

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

  function send(e: React.FormEvent) {
    e.preventDefault();
    if (!selected || !draft.trim()) return;
    const socket = getSocket();
    if (selected.kind === "dm") {
      socket.emit("message:send", { kind: "dm", to: selected.staffId, text: draft.trim() });
    } else {
      socket.emit("message:send", { kind: "channel", to: selected.department, text: draft.trim() });
    }
    setDraft("");
  }

  const contacts = staff.filter((s) => s.id !== self.id);

  return (
    <div className="messages-panel">
      <div className="conversation-list">
        <h3>Channels</h3>
        <ul>
          {visibleChannels.map((d) => (
            <li key={d}>
              <button
                className={selected?.kind === "channel" && selected.department === d ? "active" : ""}
                onClick={() => setSelected({ kind: "channel", department: d })}
              >
                # {d}
              </button>
            </li>
          ))}
        </ul>
        <h3>Direct messages</h3>
        <ul>
          {contacts.map((s) => (
            <li key={s.id}>
              <button
                className={selected?.kind === "dm" && selected.staffId === s.id ? "active" : ""}
                onClick={() => setSelected({ kind: "dm", staffId: s.id, name: s.displayName })}
              >
                {s.displayName}
              </button>
            </li>
          ))}
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
                  <div className="message-text">{m.text}</div>
                  <div className="message-time">{new Date(m.sentAt).toLocaleTimeString()}</div>
                </div>
              ))}
              <div ref={threadEndRef} />
            </div>
            <form className="thread-composer" onSubmit={send}>
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
