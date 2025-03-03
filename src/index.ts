import "dotenv/config";

import { chromium, Browser } from "playwright";
import WebSocket from "ws";
import { scanWebsite } from "./scan";

const ws = new WebSocket("ws://localhost:8000/connect", {
  headers: {
    "x-api-key": process.env.API_KEY,
  },
});

let browser: Browser | null = null;

ws.on("open", async () => {
  console.log("Connected to server");
});

ws.on("message", async (data) => {
  if (!browser) {
    browser = await chromium.launch();
    console.log("Browser launched");
  }

  let { url }: { url: string } = JSON.parse(data.toString());

  if (!url.startsWith("http") && !url.startsWith("https")) {
    url = `https://${url}`;
  }

  console.log(url);

  const res = await scanWebsite(url, browser);

  console.log("Scanning done");

  ws.send(
    JSON.stringify({
      type: "scan_result",
      isPhishing: res.isPhishing,
      url: url.split("//")[1],
      explanation: res.explanation,
    }),
  );
});

ws.on("close", async () => {
  if (browser) {
    await browser.close();
  }

  console.log("Disconnected from server");
});
