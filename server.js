const express = require("express");
const axios = require("axios");
const FormData = require("form-data");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(express.urlencoded({ extended: true }));

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, "public")));

// Map content-type to file extension
function getExtension(contentType) {
  const map = {
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
  };
  return map[(contentType || "").split(";")[0].trim().toLowerCase()] || "jpg";
}

app.get("/login", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

app.post("/upload", async (req, res) => {
  const { imageUrl, userhash } = req.body;

  if (!imageUrl) {
    return res.status(400).send("No image URL provided.");
  }

  try {
    // Step 1: Download the file from the URL
    const downloadResponse = await axios({
      method: "GET",
      url: imageUrl,
      responseType: "stream",
    });

    const ext = getExtension(downloadResponse.headers["content-type"]);
    const filename = `upload.${ext}`;

    // Step 2: Upload to catbox as a file
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
    res.json({ url: resultUrl });
  } catch (error) {
    console.error("Error during upload:", {
      message: error.message,
      response: error.response ? error.response.data : "No response data",
      stack: error.stack,
    });
    res.status(500).send(`Error: ${error.message}`);
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
