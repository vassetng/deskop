export type StaffMember = { id: string; name: string };

export default function Roster({
  roster,
  selfId,
  onRing,
  onCall,
  busy,
}: {
  roster: StaffMember[];
  selfId: string | null;
  onRing: (id: string) => void;
  onCall: (id: string, withVideo: boolean) => void;
  busy: boolean;
}) {
  const others = roster.filter((s) => s.id !== selfId);

  return (
    <div className="roster">
      <h2>Staff online ({others.length})</h2>
      {others.length === 0 && <p className="empty">No one else is online yet.</p>}
      <ul>
        {others.map((staff) => (
          <li key={staff.id} className="roster-item">
            <span className="dot" />
            <span className="staff-name">{staff.name}</span>
            <div className="roster-actions">
              <button disabled={busy} onClick={() => onRing(staff.id)} title="Ring to summon">
                🔔
              </button>
              <button disabled={busy} onClick={() => onCall(staff.id, false)} title="Audio call">
                🎤
              </button>
              <button disabled={busy} onClick={() => onCall(staff.id, true)} title="Video call">
                🎥
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
