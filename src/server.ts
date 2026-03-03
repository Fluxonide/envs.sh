import express, { Request, Response } from "express";
import axios from "axios";
import FormData from "form-data";
import cors from "cors";
import multer from "multer";
import path from "path";

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });

// Middleware
app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Serve static files from the 'public' directory (Vite build output)
app.use(express.static(path.join(__dirname, "..", "public")));

// Map content-type to file extension
function getExtension(contentType: string | undefined): string {
    const map: Record<string, string> = {
        "image/jpeg": "jpg",
        "image/png": "png",
        "image/gif": "gif",
        "image/webp": "webp",
        "image/svg+xml": "svg",
        "image/bmp": "bmp",
        "image/tiff": "tiff",
        "video/mp4": "mp4",
        "video/webm": "webm",
        "application/pdf": "pdf",
        "application/zip": "zip",
        "application/x-rar-compressed": "rar",
        "application/x-7z-compressed": "7z",
        "audio/mpeg": "mp3",
        "audio/ogg": "ogg",
        "audio/flac": "flac",
    };
    return map[(contentType || "").split(";")[0].trim().toLowerCase()] || "bin";
}

interface UploadResult {
    url: string;
    filename: string;
    size?: number;
}

// Upload via URL
app.post("/api/upload/url", async (req: Request, res: Response): Promise<void> => {
    const { imageUrl, userhash } = req.body as { imageUrl?: string; userhash?: string };

    if (!imageUrl) {
        res.status(400).json({ error: "No URL provided." });
        return;
    }

    try {
        const downloadResponse = await axios({
            method: "GET",
            url: imageUrl,
            responseType: "stream",
        });

        const ext = getExtension(downloadResponse.headers["content-type"]);
        // For weserv proxy URLs, extract the inner URL for a better filename
        let sourceUrl = imageUrl;
        try {
            const parsed = new URL(imageUrl);
            if (parsed.hostname.includes("weserv.nl") && parsed.searchParams.has("url")) {
                sourceUrl = parsed.searchParams.get("url")!;
            }
        } catch { }
        // Extract filename from URL path, strip query params, fallback to upload.ext
        const urlPath = new URL(sourceUrl).pathname;
        let urlFilename = urlPath.split("/").pop() || "";
        // Remove any query string or fragment that may have leaked into the filename
        urlFilename = urlFilename.split("?")[0].split("&")[0].split("#")[0];
        const filename = urlFilename && urlFilename.includes(".") ? urlFilename : `upload.${ext}`;

        const form = new FormData();
        form.append("reqtype", "fileupload");
        if (userhash) {
            form.append("userhash", userhash);
        }
        form.append("fileToUpload", downloadResponse.data, { filename });

        const uploadResponse = await axios({
            method: "POST",
            url: "https://catbox.moe/user/api.php",
            data: form,
            headers: form.getHeaders(),
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
        });

        const resultUrl = String(uploadResponse.data).trim();
        console.log("Upload Response:", resultUrl);
        const result: UploadResult = { url: resultUrl, filename, size: undefined };
        res.json(result);
    } catch (error: unknown) {
        const err = error as { message: string; response?: { data: unknown }; stack?: string };
        console.error("Error during URL upload:", {
            message: err.message,
            response: err.response ? err.response.data : "No response data",
        });
        res.status(500).json({ error: err.message });
    }
});

// Upload via direct file
app.post("/api/upload/file", upload.single("file"), async (req: Request, res: Response): Promise<void> => {
    const userhash = req.body?.userhash as string | undefined;

    if (!req.file) {
        res.status(400).json({ error: "No file provided." });
        return;
    }

    try {
        const form = new FormData();
        form.append("reqtype", "fileupload");
        if (userhash) {
            form.append("userhash", userhash);
        }
        form.append("fileToUpload", req.file.buffer, {
            filename: req.file.originalname,
            contentType: req.file.mimetype,
        });

        const uploadResponse = await axios({
            method: "POST",
            url: "https://catbox.moe/user/api.php",
            data: form,
            headers: form.getHeaders(),
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
        });

        const resultUrl = String(uploadResponse.data).trim();
        console.log("Upload Response:", resultUrl);
        const result: UploadResult = {
            url: resultUrl,
            filename: req.file.originalname,
            size: req.file.size,
        };
        res.json(result);
    } catch (error: unknown) {
        const err = error as { message: string; response?: { data: unknown } };
        console.error("Error during file upload:", {
            message: err.message,
            response: err.response ? err.response.data : "No response data",
        });
        res.status(500).json({ error: err.message });
    }
});

// Delete files from catbox
app.post("/api/delete", async (req: Request, res: Response): Promise<void> => {
    const { files, userhash } = req.body as { files?: string; userhash?: string };

    if (!files || !userhash) {
        res.status(400).json({ error: "Both 'files' and 'userhash' are required." });
        return;
    }

    try {
        const form = new FormData();
        form.append("reqtype", "deletefiles");
        form.append("userhash", userhash);
        form.append("files", files);

        const response = await axios({
            method: "POST",
            url: "https://catbox.moe/user/api.php",
            data: form,
            headers: form.getHeaders(),
        });

        const result = String(response.data).trim();
        console.log("Delete Response:", result);
        res.json({ success: true, message: result });
    } catch (error: unknown) {
        const err = error as { message: string; response?: { data: unknown } };
        console.error("Error during delete:", {
            message: err.message,
            response: err.response ? err.response.data : "No response data",
        });
        res.status(500).json({ error: err.message });
    }
});

// Fetch files from catbox account using session cookies
app.post("/api/fetch-files", async (req: Request, res: Response): Promise<void> => {
    const { cookies } = req.body as { cookies?: string };

    if (!cookies) {
        res.status(400).json({ error: "Cookies are required." });
        return;
    }

    try {
        // Parse cookies — supports JSON array or Netscape cookie file format
        let cookieString: string;
        const trimmed = cookies.trim();

        if (trimmed.startsWith("[")) {
            // JSON format: [{"name":"X","value":"Y"}, ...]
            try {
                const cookieArray: Array<{ name: string; value: string }> = JSON.parse(trimmed);
                cookieString = cookieArray.map((c) => `${c.name}=${c.value}`).join("; ");
            } catch {
                res.status(400).json({ error: "Invalid cookies JSON format." });
                return;
            }
        } else {
            // Netscape cookie file format — tab-separated lines:
            // domain  flag  path  secure  expiry  name  value
            const lines = trimmed.split("\n").filter((l) => l.trim() && !l.startsWith("#"));
            const pairs: string[] = [];
            for (const line of lines) {
                const parts = line.split("\t");
                if (parts.length >= 7) {
                    pairs.push(`${parts[5].trim()}=${parts[6].trim()}`);
                }
            }
            if (pairs.length === 0) {
                res.status(400).json({ error: "Could not parse cookies. Use JSON array or Netscape format." });
                return;
            }
            cookieString = pairs.join("; ");
        }

        const allFiles: Array<{ url: string; filename: string; size: string; date: string }> = [];
        let page = 1;
        let hasMore = true;

        while (hasMore) {
            const pageUrl = `https://catbox.moe/user/view.php?page=${page}&sortby=newest`;
            const response = await axios({
                method: "GET",
                url: pageUrl,
                headers: {
                    Cookie: cookieString,
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                },
                timeout: 15000,
            });

            const html = String(response.data);

            // Check if we got redirected to login (no results div or login form)
            if (html.includes("Sign up") && !html.includes("grid-bounds")) {
                res.status(401).json({ error: "Cookies are invalid or expired. Please update your cookies." });
                return;
            }

            // Parse file entries from div.col-1-8 elements
            const fileRegex = /<div class='col-1-8'><a href='(https:\/\/files\.catbox\.moe\/[^']+)'[^>]*>.*?<a class='linkbutton'[^>]*>([^<]+)<\/a>\s*<p>\s*([^<]+)<\/p><p>([^<]+)<\/p>/g;
            let match;
            let foundOnPage = 0;

            while ((match = fileRegex.exec(html)) !== null) {
                allFiles.push({
                    url: match[1].trim(),
                    filename: match[2].trim(),
                    date: match[3].trim(),
                    size: match[4].trim(),
                });
                foundOnPage++;
            }

            // Check pagination: if current page link exists for next page
            const nextPage = page + 1;
            if (html.includes(`page=${nextPage}`) && foundOnPage > 0) {
                page = nextPage;
            } else {
                hasMore = false;
            }
        }

        console.log(`Fetched ${allFiles.length} files from catbox account across ${page} page(s)`);
        res.json({ files: allFiles, total: allFiles.length });
    } catch (error: unknown) {
        const err = error as { message: string; response?: { data: unknown } };
        console.error("Error fetching files:", {
            message: err.message,
            response: err.response ? err.response.data : "No response data",
        });
        res.status(500).json({ error: err.message });
    }
});

// Legacy endpoint for backward compatibility
app.post("/upload", async (req: Request, res: Response): Promise<void> => {
    const { imageUrl, userhash } = req.body as { imageUrl?: string; userhash?: string };

    if (!imageUrl) {
        res.status(400).json({ error: "No image URL provided." });
        return;
    }

    try {
        const downloadResponse = await axios({
            method: "GET",
            url: imageUrl,
            responseType: "stream",
        });

        const ext = getExtension(downloadResponse.headers["content-type"]);
        let sourceUrl = imageUrl;
        try {
            const parsed = new URL(imageUrl);
            if (parsed.hostname.includes("weserv.nl") && parsed.searchParams.has("url")) {
                sourceUrl = parsed.searchParams.get("url")!;
            }
        } catch { }
        const urlPath = new URL(sourceUrl).pathname;
        let urlFilename = urlPath.split("/").pop() || "";
        urlFilename = urlFilename.split("?")[0].split("&")[0].split("#")[0];
        const filename = urlFilename && urlFilename.includes(".") ? urlFilename : `upload.${ext}`;

        const form = new FormData();
        form.append("reqtype", "fileupload");
        if (userhash) {
            form.append("userhash", userhash);
        }
        form.append("fileToUpload", downloadResponse.data, { filename });

        const uploadResponse = await axios({
            method: "POST",
            url: "https://catbox.moe/user/api.php",
            data: form,
            headers: form.getHeaders(),
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
        });

        const resultUrl = String(uploadResponse.data).trim();
        res.json({ url: resultUrl });
    } catch (error: unknown) {
        const err = error as { message: string; response?: { data: unknown } };
        res.status(500).send(`Error: ${err.message}`);
    }
});

// SPA fallback — serve index.html for all non-API routes
app.get("*", (_req: Request, res: Response) => {
    res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`🚀 Server is running on port ${port}`);
});

export default app;
