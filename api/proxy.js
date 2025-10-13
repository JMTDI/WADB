import express from "express";
import fetch from "node-fetch";

const app = express();
const port = process.env.PORT || 3000;

console.log("ENV PORT:", process.env.PORT);

app.options("/proxy", (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.status(200).end();
});

app.get("/proxy", async (req, res) => {
  const { variant = "general" } = req.query;

  const apkUrls = {
    "general": "https://github.com/offlinesoftwaresolutions/eGate/releases/latest/download/app-general-release.apk",
    "lg-classic": "https://github.com/offlinesoftwaresolutions/eGate/releases/latest/download/app-lgclassic-release.apk",
    "external": "https://github.com/offlinesoftwaresolutions/eGate/releases/latest/download/app-external_accessibility-release.apk"
  };

  const apkUrl = apkUrls[variant] || apkUrls["general"];

  try {
    const response = await fetch(apkUrl);

    if (!response.ok) {
      return res.status(response.status).json({ error: "Failed to fetch APK" });
    }

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Content-Type", "application/vnd.android.package-archive");
    res.setHeader("Content-Disposition", `attachment; filename="app-${variant}-release.apk"`);

    const contentLength = response.headers.get("content-length");
    if (contentLength) {
      res.setHeader("Content-Length", contentLength);
    }

    response.body.pipe(res);
  } catch (error) {
    console.error("Error fetching APK:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Health route for devpu.sh
app.get("/", (req, res) => {
  res.status(200).send("Server is up!");
});

app.listen(port, () => {
  console.log(`APK proxy server running on port ${port}`);
});
