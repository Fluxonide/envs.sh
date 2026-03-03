import { useState, useRef, useCallback, useEffect } from "react";

interface UploadResult {
    url: string;
    filename: string;
    size?: number;
    timestamp: number;
}

type UploadMode = "url" | "file";

const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg"];

function isImageUrl(url: string): boolean {
    try {
        const filename = new URL(url).pathname.split("/").pop() || "";
        const ext = filename.split(".").pop()?.toLowerCase() || "";
        return IMAGE_EXTENSIONS.includes(ext);
    } catch {
        const ext = url.split(".").pop()?.toLowerCase() || "";
        return IMAGE_EXTENSIONS.includes(ext);
    }
}

function buildWeservUrl(originalUrl: string, w: string, h: string): string {
    const params = new URLSearchParams();
    params.set("url", originalUrl);
    if (w) params.set("w", w);
    if (h) params.set("h", h);
    return `https://images.weserv.nl/?${params.toString()}`;
}

export default function Upload() {
    const [mode, setMode] = useState<UploadMode>("url");
    const [url, setUrl] = useState("");
    const [file, setFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);
    const [result, setResult] = useState<UploadResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const [dragActive, setDragActive] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Resize panel state
    const [showResize, setShowResize] = useState(false);
    const [resizeWidth, setResizeWidth] = useState("");
    const [resizeHeight, setResizeHeight] = useState("");
    const [resizeCopied, setResizeCopied] = useState(false);

    const saveToHistory = (item: UploadResult) => {
        try {
            const existing: UploadResult[] = JSON.parse(localStorage.getItem("upload_history") || "[]");
            const updated = [item, ...existing].slice(0, 50);
            localStorage.setItem("upload_history", JSON.stringify(updated));
        } catch {
            localStorage.setItem("upload_history", JSON.stringify([item]));
        }
    };

    const handleUpload = async () => {
        setUploading(true);
        setError(null);
        setResult(null);
        setCopied(false);
        setShowResize(false);
        setResizeWidth("");
        setResizeHeight("");
        setResizeCopied(false);

        const userhash = localStorage.getItem("catbox_userhash") || "";

        try {
            let res: Response;

            if (mode === "url") {
                if (!url.trim()) {
                    setError("Please enter a URL");
                    setUploading(false);
                    return;
                }
                res = await fetch("/api/upload/url", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ imageUrl: url.trim(), userhash }),
                });
            } else {
                if (!file) {
                    setError("Please select a file");
                    setUploading(false);
                    return;
                }
                const formData = new FormData();
                formData.append("file", file);
                if (userhash) formData.append("userhash", userhash);
                res = await fetch("/api/upload/file", {
                    method: "POST",
                    body: formData,
                });
            }

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || "Upload failed");
            }

            const uploadResult: UploadResult = {
                url: data.url,
                filename: data.filename || (mode === "url" ? url.split("/").pop() || "file" : file?.name || "file"),
                size: data.size || file?.size,
                timestamp: Date.now(),
            };

            setResult(uploadResult);
            saveToHistory(uploadResult);
            setUrl("");
            setFile(null);
        } catch (err: unknown) {
            const e = err as Error;
            setError(e.message || "Upload failed");
        } finally {
            setUploading(false);
        }
    };

    const handleCopy = async () => {
        if (!result) return;
        try {
            await navigator.clipboard.writeText(result.url);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            // fallback
            const input = document.createElement("input");
            input.value = result.url;
            document.body.appendChild(input);
            input.select();
            document.execCommand("copy");
            document.body.removeChild(input);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    const copyResizedUrl = async () => {
        if (!result) return;
        const resizedUrl = buildWeservUrl(result.url, resizeWidth, resizeHeight);
        try {
            await navigator.clipboard.writeText(resizedUrl);
        } catch {
            const inp = document.createElement("input");
            inp.value = resizedUrl;
            document.body.appendChild(inp);
            inp.select();
            document.execCommand("copy");
            document.body.removeChild(inp);
        }
        setResizeCopied(true);
        setTimeout(() => setResizeCopied(false), 2000);
    };

    const handleDrag = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === "dragenter" || e.type === "dragover") {
            setDragActive(true);
        } else if (e.type === "dragleave") {
            setDragActive(false);
        }
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            setFile(e.dataTransfer.files[0]);
            setMode("file");
        }
    }, []);

    // Auto-upload triggered after paste sets state visually
    const [pendingAutoUpload, setPendingAutoUpload] = useState(false);

    useEffect(() => {
        if (!pendingAutoUpload) return;
        // Brief delay so user sees the pasted content before upload starts
        const timer = setTimeout(() => {
            setPendingAutoUpload(false);
            handleUpload();
        }, 600);
        return () => clearTimeout(timer);
    }, [pendingAutoUpload]);

    // Global paste handler — visual paste-then-upload
    useEffect(() => {
        const handlePaste = (e: ClipboardEvent) => {
            // Don't intercept if user is typing in an input
            const tag = (e.target as HTMLElement)?.tagName;
            if (tag === "INPUT" || tag === "TEXTAREA") return;
            if (uploading) return;

            const items = e.clipboardData?.items;
            if (!items) return;

            // Check for pasted files (screenshots, copied images)
            for (let i = 0; i < items.length; i++) {
                if (items[i].kind === "file") {
                    const pastedFile = items[i].getAsFile();
                    if (pastedFile) {
                        e.preventDefault();
                        setMode("file");
                        setFile(pastedFile);
                        setResult(null);
                        setError(null);
                        setPendingAutoUpload(true);
                        return;
                    }
                }
            }

            // Check for pasted URL text
            const text = e.clipboardData?.getData("text/plain")?.trim();
            if (text && /^https?:\/\/.+/i.test(text)) {
                e.preventDefault();
                setMode("url");
                setUrl(text);
                setResult(null);
                setError(null);
                setPendingAutoUpload(true);
            }
        };

        document.addEventListener("paste", handlePaste);
        return () => document.removeEventListener("paste", handlePaste);
    }, [uploading]);

    return (
        <div className="upload-page">
            <div className="page-header">
                <h1>Upload to CatInBox</h1>
                <p className="page-subtitle">
                    Share files instantly. Up to 200MB per file, no account needed.
                </p>
            </div>

            {/* Mode Toggle */}
            <div className="mode-toggle">
                <button
                    className={`mode-btn ${mode === "url" ? "active" : ""}`}
                    onClick={() => setMode("url")}
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
                        <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
                    </svg>
                    URL
                </button>
                <button
                    className={`mode-btn ${mode === "file" ? "active" : ""}`}
                    onClick={() => setMode("file")}
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z" />
                        <polyline points="13 2 13 9 20 9" />
                    </svg>
                    File
                </button>
            </div>

            {/* Upload Card */}
            <div className="upload-card glass-card">
                <div className="mode-content" key={mode}>
                    {mode === "url" ? (
                        <div className="url-input-group">
                            <div className="input-wrapper">
                                <svg className="input-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
                                    <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
                                </svg>
                                <input
                                    id="url-input"
                                    type="url"
                                    placeholder="Paste a direct file URL..."
                                    value={url}
                                    onChange={(e) => setUrl(e.target.value)}
                                    onKeyDown={(e) => e.key === "Enter" && handleUpload()}
                                    disabled={uploading}
                                    className="text-input"
                                />
                            </div>
                        </div>
                    ) : (
                        <div
                            className={`drop-zone ${dragActive ? "drag-active" : ""} ${file ? "has-file" : ""}`}
                            onDragEnter={handleDrag}
                            onDragLeave={handleDrag}
                            onDragOver={handleDrag}
                            onDrop={handleDrop}
                            onClick={() => fileInputRef.current?.click()}
                        >
                            <input
                                ref={fileInputRef}
                                type="file"
                                onChange={(e) => e.target.files?.[0] && setFile(e.target.files[0])}
                                style={{ display: "none" }}
                            />
                            {file ? (
                                <div className="file-preview">
                                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z" />
                                        <polyline points="13 2 13 9 20 9" />
                                    </svg>
                                    <div className="file-info">
                                        <span className="file-name">{file.name}</span>
                                        <span className="file-size">{formatSize(file.size)}</span>
                                    </div>
                                    <button
                                        className="file-remove"
                                        onClick={(e) => { e.stopPropagation(); setFile(null); }}
                                    >
                                        ✕
                                    </button>
                                </div>
                            ) : (
                                <div className="drop-zone-content">
                                    <div className="drop-icon-container">
                                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                                            <polyline points="17 8 12 3 7 8" />
                                            <line x1="12" y1="3" x2="12" y2="15" />
                                        </svg>
                                    </div>
                                    <p className="drop-text">
                                        <strong>Drop a file here</strong> or click to browse
                                    </p>
                                    <p className="drop-hint">Any file type, up to 200MB</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <button
                    id="upload-btn"
                    className={`upload-btn ${uploading ? "uploading" : ""}`}
                    onClick={handleUpload}
                    disabled={uploading || (mode === "url" ? !url.trim() : !file)}
                >
                    {uploading ? (
                        <>
                            <span className="spinner" />
                            Uploading...
                        </>
                    ) : (
                        <>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                                <polyline points="17 8 12 3 7 8" />
                                <line x1="12" y1="3" x2="12" y2="15" />
                            </svg>
                            Upload
                        </>
                    )}
                </button>
            </div>

            {/* Result */}
            {result && (
                <div className="result-card glass-card success-glow">
                    <div className="result-header">
                        <span className="result-check">✓</span>
                        <span>Uploaded successfully!</span>
                    </div>
                    <div className="result-url-row">
                        <input
                            id="result-url"
                            type="text"
                            readOnly
                            value={result.url}
                            className="result-url-input"
                            onClick={(e) => (e.target as HTMLInputElement).select()}
                        />
                        <button
                            className={`copy-btn ${copied ? "copied" : ""}`}
                            onClick={handleCopy}
                        >
                            {copied ? (
                                <>
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="20 6 9 17 4 12" />
                                    </svg>
                                    Copied!
                                </>
                            ) : (
                                <>
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                                        <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                                    </svg>
                                    Copy
                                </>
                            )}
                        </button>
                    </div>
                </div>
            )}

            {/* Resize Panel */}
            {result && isImageUrl(result.url) && (
                <div className="resize-panel glass-card">
                    <button
                        className={`resize-toggle ${showResize ? "active" : ""}`}
                        onClick={() => setShowResize(!showResize)}
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="3" width="18" height="18" rx="2" />
                            <path d="M15 3v18" />
                            <path d="M9 3v18" />
                            <path d="M3 9h18" />
                            <path d="M3 15h18" />
                        </svg>
                        Resize Image
                        <svg className={`resize-chevron ${showResize ? "open" : ""}`} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="6 9 12 15 18 9" />
                        </svg>
                    </button>

                    {showResize && (
                        <div className="resize-body">
                            <div className="resize-controls">
                                <div className="resize-field">
                                    <label>Width (px)</label>
                                    <input
                                        type="number"
                                        placeholder="Auto"
                                        value={resizeWidth}
                                        onChange={(e) => setResizeWidth(e.target.value)}
                                        min="1"
                                        max="9999"
                                        className="text-input resize-input"
                                    />
                                </div>
                                <div className="resize-field">
                                    <label>Height (px)</label>
                                    <input
                                        type="number"
                                        placeholder="Auto"
                                        value={resizeHeight}
                                        onChange={(e) => setResizeHeight(e.target.value)}
                                        min="1"
                                        max="9999"
                                        className="text-input resize-input"
                                    />
                                </div>
                            </div>

                            {(resizeWidth || resizeHeight) && (
                                <>
                                    <div className="resize-preview">
                                        <img
                                            src={buildWeservUrl(result.url, resizeWidth, resizeHeight)}
                                            alt="Resized preview"
                                            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                                        />
                                    </div>
                                    <div className="resize-url-row">
                                        <input
                                            type="text"
                                            readOnly
                                            value={buildWeservUrl(result.url, resizeWidth, resizeHeight)}
                                            className="result-url-input"
                                            onClick={(e) => (e.target as HTMLInputElement).select()}
                                        />
                                        <button
                                            className={`copy-btn ${resizeCopied ? "copied" : ""}`}
                                            onClick={copyResizedUrl}
                                        >
                                            {resizeCopied ? (
                                                <>
                                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                        <polyline points="20 6 9 17 4 12" />
                                                    </svg>
                                                    Copied!
                                                </>
                                            ) : (
                                                <>
                                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                                                        <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                                                    </svg>
                                                    Copy Resized URL
                                                </>
                                            )}
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Error */}
            {error && (
                <div className="error-card glass-card">
                    <span className="error-icon">✕</span>
                    <span>{error}</span>
                </div>
            )}

        </div>
    );
}

function formatSize(bytes: number): string {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}
