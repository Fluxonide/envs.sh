import { useState, useEffect } from "react";

interface UploadResult {
    url: string;
    filename: string;
    size?: number;
    timestamp: number;
    source?: "web" | "telegram";
    telegramUserId?: number;
}

const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg"];

function getFilenameFromUrl(url: string): string {
    try {
        return new URL(url).pathname.split("/").pop() || "";
    } catch {
        return url.split("/").pop() || "";
    }
}

function getThumbnailUrl(url: string): string | null {
    const filename = getFilenameFromUrl(url);
    const ext = filename.split(".").pop()?.toLowerCase() || "";
    if (IMAGE_EXTENSIONS.includes(ext)) {
        return `https://files.catbox.moe/thumbs/t_${filename}`;
    }
    return null;
}

function formatSize(bytes: number): string {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function formatTime(ts: number): string {
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    return new Date(ts).toLocaleDateString();
}

export default function History() {
    const [history, setHistory] = useState<UploadResult[]>([]);
    const [deleting, setDeleting] = useState<string | null>(null);
    const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
    const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
    const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    const userhash = localStorage.getItem("catbox_userhash") || "";

    useEffect(() => {
        fetchHistory();
    }, []);

    const fetchHistory = async () => {
        try {
            setLoading(true);
            const res = await fetch("/api/history");
            const data = await res.json();
            if (res.ok) {
                setHistory(data.history || []);
            } else {
                // Fallback to localStorage if server fails
                const stored = JSON.parse(localStorage.getItem("upload_history") || "[]");
                setHistory(stored);
            }
        } catch {
            // Fallback to localStorage
            const stored = JSON.parse(localStorage.getItem("upload_history") || "[]");
            setHistory(stored);
        } finally {
            setLoading(false);
        }
    };

    const showToast = (msg: string, type: "success" | "error") => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 3000);
    };

    const copyUrl = async (url: string) => {
        try {
            await navigator.clipboard.writeText(url);
        } catch {
            const inp = document.createElement("input");
            inp.value = url;
            document.body.appendChild(inp);
            inp.select();
            document.execCommand("copy");
            document.body.removeChild(inp);
        }
        setCopiedUrl(url);
        setTimeout(() => setCopiedUrl(null), 2000);
    };

    const removeFromHistory = (url: string) => {
        const updated = history.filter((h) => h.url !== url);
        setHistory(updated);
        localStorage.setItem("upload_history", JSON.stringify(updated));
    };

    const handleDelete = async (url: string) => {
        const filename = getFilenameFromUrl(url);
        if (!filename || !userhash) return;

        setDeleting(url);
        setConfirmDelete(null);

        try {
            const res = await fetch("/api/delete", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ files: filename, userhash }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Delete failed");
            removeFromHistory(url);
            showToast("File deleted successfully!", "success");
        } catch (err: unknown) {
            const e = err as Error;
            showToast(e.message || "Delete failed", "error");
        } finally {
            setDeleting(null);
        }
    };

    const clearHistory = () => {
        setHistory([]);
        localStorage.removeItem("upload_history");
    };

    return (
        <div className="history-page">
            <div className="page-header">
                <h1>Upload History</h1>
                <p className="page-subtitle">
                    Your recent uploads{userhash ? " — delete available with userhash" : " — set userhash in Settings to enable delete"}.
                </p>
            </div>

            {toast && (
                <div className={`toast ${toast.type === "success" ? "toast-success" : "toast-error"}`}>
                    {toast.type === "success" ? (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                        </svg>
                    ) : (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10" />
                            <line x1="15" y1="9" x2="9" y2="15" />
                            <line x1="9" y1="9" x2="15" y2="15" />
                        </svg>
                    )}
                    {toast.msg}
                </div>
            )}

            {history.length === 0 ? (
                <div className="history-empty glass-card">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                    </svg>
                    <p>No upload history yet</p>
                    <span>Your uploads will appear here after you upload files.</span>
                </div>
            ) : (
                <>
                    <div className="history-toolbar">
                        <span className="history-count">{history.length} file{history.length !== 1 ? "s" : ""}</span>
                        <button className="clear-btn" onClick={clearHistory}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="3 6 5 6 21 6" />
                                <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                            </svg>
                            Clear All
                        </button>
                    </div>

                    <div className="history-grid">
                        {history.map((item, i) => {
                            const thumb = getThumbnailUrl(item.url);
                            const filename = getFilenameFromUrl(item.url);
                            const isDeleting = deleting === item.url;
                            const isConfirming = confirmDelete === item.url;

                            return (
                                <div key={`${item.timestamp}-${i}`} className="history-card glass-card">
                                    <div className="history-card-thumb">
                                        {thumb ? (
                                            <img
                                                src={thumb}
                                                alt={filename}
                                                loading="lazy"
                                                onError={(e) => {
                                                    (e.target as HTMLImageElement).style.display = "none";
                                                    (e.target as HTMLImageElement).nextElementSibling?.classList.remove("hidden");
                                                }}
                                            />
                                        ) : null}
                                        <div className={`history-card-icon ${thumb ? "hidden" : ""}`}>
                                            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z" />
                                                <polyline points="13 2 13 9 20 9" />
                                            </svg>
                                        </div>
                                    </div>

                                    <div className="history-card-body">
                                        <span className="history-card-name" title={item.url}>
                                            {filename || item.url}
                                        </span>
                                        <span className="history-card-meta">
                                            {item.size ? formatSize(item.size) + " · " : ""}
                                            {formatTime(item.timestamp)}
                                        </span>
                                    </div>

                                    <div className="history-card-actions">
                                        <button className={`hist-action-btn ${copiedUrl === item.url ? "copied" : ""}`} onClick={() => copyUrl(item.url)} title="Copy link">
                                            {copiedUrl === item.url ? (
                                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--success)" }}>
                                                    <polyline points="20 6 9 17 4 12" />
                                                </svg>
                                            ) : (
                                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                                                    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                                                </svg>
                                            )}
                                        </button>
                                        <a href={item.url} target="_blank" rel="noopener noreferrer" className="hist-action-btn" title="Open">
                                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
                                                <polyline points="15 3 21 3 21 9" />
                                                <line x1="10" y1="14" x2="21" y2="3" />
                                            </svg>
                                        </a>
                                        {userhash && (
                                            isConfirming ? (
                                                <div className="confirm-delete">
                                                    <button className="confirm-yes" onClick={() => handleDelete(item.url)} disabled={isDeleting}>
                                                        {isDeleting ? <span className="spinner-sm" /> : "Yes"}
                                                    </button>
                                                    <button className="confirm-no" onClick={() => setConfirmDelete(null)}>No</button>
                                                </div>
                                            ) : (
                                                <button
                                                    className="hist-action-btn hist-delete-btn"
                                                    onClick={() => setConfirmDelete(item.url)}
                                                    title="Delete from Catbox"
                                                    disabled={isDeleting}
                                                >
                                                    {isDeleting ? (
                                                        <span className="spinner-sm" />
                                                    ) : (
                                                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                            <polyline points="3 6 5 6 21 6" />
                                                            <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                                                        </svg>
                                                    )}
                                                </button>
                                            )
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </>
            )}
        </div>
    );
}
