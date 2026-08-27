import { useEffect, useMemo, useState } from "react";
import { authFetch, Staff, getSession } from "../lib/auth";

type OnlineStaffId = string;

export default function Directory({
  onlineStaffIds,
  onRing,
  onCall,
  onMessage,
}: {
  onlineStaffIds: Set<OnlineStaffId>;
  onRing: (staffId: string) => void;
  onCall: (staffId: string, withVideo: boolean) => void;
  onMessage: (staffId: string) => void;
}) {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [query, setQuery] = useState("");
  const [department, setDepartment] = useState("all");
  const selfId = getSession()?.staff.id;

  useEffect(() => {
    authFetch("/auth/staff").then((r) => r.json()).then(setStaff).catch(() => {});
  }, []);

  const departments = useMemo(() => {
    return Array.from(new Set(staff.map((s) => s.department))).sort();
  }, [staff]);

  const filtered = useMemo(() => {
    return staff
      .filter((s) => s.id !== selfId)
      .filter((s) => department === "all" || s.department === department)
      .filter((s) => {
        const q = query.trim().toLowerCase();
        if (!q) return true;
        return s.displayName.toLowerCase().includes(q) || s.username.toLowerCase().includes(q);
      })
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [staff, query, department, selfId]);

  return (
    <div className="directory-panel">
      <h2>Staff directory</h2>
      <div className="directory-filters">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or username"
        />
        <select value={department} onChange={(e) => setDepartment(e.target.value)}>
          <option value="all">All departments</option>
          {departments.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </div>

      {filtered.length === 0 && <p className="empty">No staff match your search.</p>}

      <ul className="directory-list">
        {filtered.map((s) => {
          const online = onlineStaffIds.has(s.id);
          return (
            <li key={s.id} className="directory-row">
              <span className={`dot ${online ? "" : "offline"}`} />
              <div className="directory-info">
                <strong>{s.displayName}</strong>
                <span className="meta">
                  {s.department} · {s.role === "admin" ? "Admin" : "Staff"} · {online ? "Online" : "Offline"}
                </span>
              </div>
              <div className="directory-actions">
                <button onClick={() => onMessage(s.id)}>Message</button>
                <button disabled={!online} onClick={() => onRing(s.id)}>
                  Ring
                </button>
                <button disabled={!online} onClick={() => onCall(s.id, false)}>
                  🎤 Audio
                </button>
                <button disabled={!online} onClick={() => onCall(s.id, true)}>
                  🎥 Video
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
