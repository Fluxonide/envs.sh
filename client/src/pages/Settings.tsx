import { useState, useEffect } from "react";

interface UploadResult {
    url: string;
    filename: string;
    size?: number;
    timestamp: number;
}

export default function Settings() {
    const [userhash, setUserhash] = useState("");
    const [saved, setSaved] = useState(false);
    const [cleared, setCleared] = useState(false);
    const [cookieInput, setCookieInput] = useState("");
    const [syncing, setSyncing] = useState(false);
    const [syncResult, setSyncResult] = useState<{ msg: string; type: "success" | "error" } | null>(null);

    useEffect(() => {
        const stored = localStorage.getItem("catbox_userhash");
        if (stored) setUserhash(stored);
    }, []);

    const handleSave = () => {
        const hash = userhash.trim();
        if (hash) {
            localStorage.setItem("catbox_userhash", hash);
            setSaved(true);
            setCleared(false);
            setTimeout(() => setSaved(false), 3000);
        } else {
            localStorage.removeItem("catbox_userhash");
            setCleared(true);
            setSaved(false);
            setTimeout(() => setCleared(false), 3000);
        }
    };

    const handleSync = async () => {
        if (!cookieInput.trim()) {
            setSyncResult({ msg: "Please paste your cookies JSON", type: "error" });
            setTimeout(() => setSyncResult(null), 3000);
            return;
        }

        setSyncing(true);
        setSyncResult(null);
        try {
            const res = await fetch("/api/fetch-files", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ cookies: cookieInput.trim() }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Fetch failed");

            const fetched: UploadResult[] = (data.files || []).map(
                (f: { url: string; filename: string; size: string; date: string }) => {
                    const sizeMatch = f.size.match(/([\d.]+)\s*MB/i);
                    const sizeBytes = sizeMatch ? Math.round(parseFloat(sizeMatch[1]) * 1024 * 1024) : undefined;
                    const ts = new Date(f.date.replace(" ", "T") + "Z").getTime() || Date.now();
                    return { url: f.url, filename: f.filename, size: sizeBytes, timestamp: ts };
                }
            );

            // Merge with existing history, deduplicate by URL, update missing sizes
            let existing: UploadResult[] = [];
            try {
                existing = JSON.parse(localStorage.getItem("upload_history") || "[]");
            } catch { /* empty */ }

            // Build a lookup from fetched data for size updates
            const fetchedMap = new Map(fetched.map((f) => [f.url, f]));
            let updatedCount = 0;

            // Update existing entries that are missing size
            existing = existing.map((entry) => {
                if (!entry.size && fetchedMap.has(entry.url)) {
                    const fetSize = fetchedMap.get(entry.url)!.size;
                    if (fetSize) { updatedCount++; return { ...entry, size: fetSize }; }
                }
                return entry;
            });

            const existingUrls = new Set(existing.map((h) => h.url));
            const newFiles = fetched.filter((f) => !existingUrls.has(f.url));
            const merged = [...existing, ...newFiles].sort((a, b) => b.timestamp - a.timestamp);

            localStorage.setItem("upload_history", JSON.stringify(merged));

            const parts = [`${newFiles.length} new`];
            if (updatedCount) parts.push(`${updatedCount} updated`);
            setSyncResult({
                msg: `Synced ${data.total} files (${parts.join(", ")}). Check History tab.`,
                type: "success",
            });
            setCookieInput("");
        } catch (err: unknown) {
            const e = err as Error;
            setSyncResult({ msg: e.message || "Sync failed", type: "error" });
        } finally {
            setSyncing(false);
            setTimeout(() => setSyncResult(null), 5000);
        }
    };

    return (
        <div className="settings-page">
            <div className="page-header">
                <h1>Settings</h1>
                <p className="page-subtitle">
                    Configure your Catbox.moe account for upload management.
                </p>
            </div>

            <div className="settings-card glass-card">
                <div className="settings-section">
                    <div className="settings-label">
                        <h3>Userhash</h3>
                        <p>
                            Your catbox.moe userhash links uploads to your account. Find it on
                            your{" "}
                            <a
                                href="https://catbox.moe/user/manage.php"
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                account page
                            </a>
                            .
                        </p>
                    </div>

                    <div className="settings-input-group">
                        <div className="input-wrapper">
                            <svg className="input-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                                <path d="M7 11V7a5 5 0 0110 0v4" />
                            </svg>
                            <input
                                id="userhash-input"
                                type="text"
                                placeholder="Enter your catbox userhash..."
                                value={userhash}
                                onChange={(e) => setUserhash(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && handleSave()}
                                className="text-input"
                            />
                        </div>
                        <button className="save-btn" onClick={handleSave}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" />
                                <polyline points="17 21 17 13 7 13 7 21" />
                                <polyline points="7 3 7 8 15 8" />
                            </svg>
                            Save
                        </button>
                    </div>

                    {saved && (
                        <div className="toast toast-success">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12" />
                            </svg>
                            Userhash saved successfully!
                        </div>
                    )}
                    {cleared && (
                        <div className="toast toast-warning">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="3 6 5 6 21 6" />
                                <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                            </svg>
                            Userhash cleared
                        </div>
                    )}
                </div>

                <div className="settings-section">
                    <div className="settings-label">
                        <h3>Sync from Catbox Account</h3>
                        <p>
                            Paste your catbox.moe browser cookies to import all your
                            account files into History. Supports JSON and Netscape format.
                            Export using{" "}
                            <a href="https://chromewebstore.google.com/detail/cookie-editor/hlkenndednhfkekhgcdicdfddnkalmdm" target="_blank" rel="noopener noreferrer">
                                Cookie-Editor
                            </a>.
                        </p>
                    </div>

                    <textarea
                        className="sync-textarea"
                        placeholder='JSON: [{"name":"PHPSESSID","value":"..."}] or Netscape format'
                        value={cookieInput}
                        onChange={(e) => setCookieInput(e.target.value)}
                        rows={4}
                        disabled={syncing}
                    />
                    <button
                        className="sync-btn"
                        onClick={handleSync}
                        disabled={syncing || !cookieInput.trim()}
                    >
                        {syncing ? (
                            <><span className="spinner" /> Fetching files...</>
                        ) : (
                            <>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="23 4 23 10 17 10" />
                                    <polyline points="1 20 1 14 7 14" />
                                    <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
                                </svg>
                                Import Files
                            </>
                        )}
                    </button>

                    {syncResult && (
                        <div className={`toast ${syncResult.type === "success" ? "toast-success" : "toast-error"}`}>
                            {syncResult.type === "success" ? (
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
                            {syncResult.msg}
                        </div>
                    )}
                </div>

                <div className="settings-section">
                    <div className="settings-label">
                        <h3>About</h3>
                        <p>
                            envs.sh is a modern file uploader that uses{" "}
                            <a href="https://catbox.moe" target="_blank" rel="noopener noreferrer">
                                catbox.moe
                            </a>{" "}
                            as the storage backend. Upload via URL or drag-and-drop, and your
                            upload history is stored locally in your browser.
                        </p>
                    </div>
                    <div className="about-badges">
                        <span className="badge">v2.0</span>
                        <span className="badge">TypeScript</span>
                        <span className="badge">React</span>
                    </div>
                </div>
            </div>
        </div>
    );
}

