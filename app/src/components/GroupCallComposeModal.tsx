import { useState } from "react";
import { StaffMember } from "./Roster";

const MAX_PARTICIPANTS = 6;

export default function GroupCallComposeModal({
  onlineStaff,
  selfId,
  onStart,
  onCancel,
}: {
  onlineStaff: StaffMember[];
  selfId: string;
  onStart: (participantIds: string[], withVideo: boolean) => void;
  onCancel: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [withVideo, setWithVideo] = useState(true);

  const candidates = onlineStaff.filter((s) => s.id !== selfId);
  const atLimit = selected.size >= MAX_PARTICIPANTS - 1;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < MAX_PARTICIPANTS - 1) {
        next.add(id);
      }
      return next;
    });
  }

  return (
    <div className="ring-overlay">
      <div className="ring-compose group-call-compose">
        <h2>👥 Start a group call</h2>
        <p className="section-sub">
          Pick up to {MAX_PARTICIPANTS - 1} people ({selected.size} selected). Everyone rings and joins once they
          accept.
        </p>
        <div className="group-call-candidates">
          {candidates.length === 0 && <p className="empty">No one else is online right now.</p>}
          {candidates.map((s) => (
            <label key={s.id} className="group-call-candidate">
              <input
                type="checkbox"
                checked={selected.has(s.id)}
                disabled={!selected.has(s.id) && atLimit}
                onChange={() => toggle(s.id)}
              />
              {s.name}
            </label>
          ))}
        </div>
        <div className="ring-pretexts">
          <button type="button" className={`pretext-chip ${withVideo ? "active" : ""}`} onClick={() => setWithVideo(true)}>
            🎥 Video
          </button>
          <button type="button" className={`pretext-chip ${!withVideo ? "active" : ""}`} onClick={() => setWithVideo(false)}>
            🎤 Audio only
          </button>
        </div>
        <div className="ring-actions">
          <button
            type="button"
            className="accept"
            disabled={selected.size === 0}
            onClick={() => onStart(Array.from(selected), withVideo)}
          >
            Start call
          </button>
          <button type="button" className="dismiss" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
