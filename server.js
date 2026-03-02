const express = require("express");
const axios = require("axios");
const FormData = require("form-data");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(express.urlencoded({ extended: true }));

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, "public")));

app.post("/upload", async (req, res) => {
  const { imageUrl } = req.body;

  if (!imageUrl) {
    return res.status(400).send("No image URL provided.");
  }

  try {
    const form = new FormData();
    form.append("reqtype", "urlupload");
    form.append("url", imageUrl);

    const uploadResponse = await axios({
      method: "POST",
      url: "https://catbox.moe/user/api.php",
      data: form,
      headers: form.getHeaders(),
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
