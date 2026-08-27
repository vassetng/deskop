import { useCallback, useEffect, useRef, useState } from "react";
import { getServerUrl, getSocket } from "../lib/socket";

type SharedFile = {
  id: string;
  originalName: string;
  storedName: string;
  size: number;
  uploadedBy: string;
  uploadedAt: string;
};

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function Files({ selfName }: { selfName: string }) {
  const [files, setFiles] = useState<SharedFile[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch(`${getServerUrl()}/files`)
      .then((r) => r.json())
      .then(setFiles)
      .catch(() => {});

    const socket = getSocket();
    const onNew = (file: SharedFile) => setFiles((prev) => [...prev, file]);
    socket.on("files:new", onNew);
    return () => {
      socket.off("files:new", onNew);
    };
  }, []);

  const upload = useCallback(
    async (file: File) => {
      setUploading(true);
      setError(null);
      const form = new FormData();
      form.append("file", file);
      form.append("uploadedBy", selfName);
      try {
        const res = await fetch(`${getServerUrl()}/files/upload`, { method: "POST", body: form });
        if (!res.ok) throw new Error("Upload failed");
      } catch {
        setError(`Couldn't upload "${file.name}". Check your connection to the server and try again.`);
      } finally {
        setUploading(false);
      }
    },
    [selfName]
  );

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) upload(file);
  }

  return (
    <div className="files-panel">
      <h2>Shared documents</h2>
      <div
        className={`dropzone ${dragOver ? "drag-over" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      >
        {uploading ? "Uploading…" : "Drag & drop a file here, or click to choose"}
        <input
          ref={inputRef}
          type="file"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) upload(file);
            e.target.value = "";
          }}
        />
      </div>
      {error && <div className="report-error files-error">{error}</div>}
      <ul className="file-list">
        {files.length === 0 && <p className="empty">No files shared yet.</p>}
        {files
          .slice()
          .reverse()
          .map((f) => (
            <li key={f.id} className="file-item">
              <div>
                <div className="file-name">{f.originalName}</div>
                <div className="file-meta">
                  {formatSize(f.size)} · shared by {f.uploadedBy}
                </div>
              </div>
              <a href={`${getServerUrl()}/files/download/${f.storedName}`} target="_blank" rel="noreferrer">
                Download
              </a>
            </li>
          ))}
      </ul>
    </div>
  );
}
