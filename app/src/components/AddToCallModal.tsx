import { StaffMember } from "./Roster";

export default function AddToCallModal({
  candidates,
  onAdd,
  onCancel,
}: {
  candidates: StaffMember[];
  onAdd: (staffId: string) => void;
  onCancel: () => void;
}) {
  return (
    <div className="ring-overlay">
      <div className="ring-compose group-call-compose">
        <h2>➕ Add someone to this call</h2>
        <p className="section-sub">
          This turns it into a group call — the current call ends and everyone (including the
          person you're already talking to) is invited to join together.
        </p>
        <div className="group-call-candidates">
          {candidates.length === 0 && <p className="empty">No one else is online right now.</p>}
          {candidates.map((s) => (
            <button key={s.id} type="button" className="add-to-call-candidate" onClick={() => onAdd(s.id)}>
              {s.name}
            </button>
          ))}
        </div>
        <div className="ring-actions">
          <button type="button" className="dismiss" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
