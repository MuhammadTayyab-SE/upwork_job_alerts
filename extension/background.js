/*
 * Upwork Job Alert Extension - Background Service Worker
 *
 * How to load:
 * 1. Open Chrome and go to chrome://extensions.
 * 2. Enable "Developer mode".
 * 3. Click "Load unpacked" and select this extension folder.
 *
 * How to see logs:
 * 1. Open chrome://extensions.
 * 2. Find "Upwork Job Alert".
 * 3. Click "service worker" or "Inspect views" to open DevTools.
 *
 * Successful run:
 * - Every 2 minutes the console logs "Alarm fired - requesting scrape".
 * - If an Upwork find-work tab is open, it logs that a scrape message was sent.
 * - If no matching tab is open, it logs "No Upwork tab found, skipping".
 */

const ALARM_NAME = "scrapeJobs";
const UPWORK_FIND_WORK_URL = "https://www.upwork.com/nx/find-work/*";

function createScrapeAlarm() {
  chrome.alarms.create(ALARM_NAME, {
    periodInMinutes: 2
  });
}

async function requestScrapeFromUpworkTab() {
  const tabs = await chrome.tabs.query({
    active: true,
    url: UPWORK_FIND_WORK_URL
  });

  const tab = tabs.find((candidate) => typeof candidate.id === "number");

  if (!tab) {
    console.log("No Upwork tab found, skipping");
    return;
  }

  await chrome.tabs.sendMessage(tab.id, { action: "scrape" });
  console.log("Scrape message sent to Upwork tab");
}

chrome.runtime.onInstalled.addListener(() => {
  createScrapeAlarm();
});

chrome.runtime.onStartup.addListener(() => {
  createScrapeAlarm();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== ALARM_NAME) {
    return;
  }

  console.log("Alarm fired - requesting scrape");
  requestScrapeFromUpworkTab().catch((error) => {
    console.error("Failed to request scrape", error);
  });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.action !== "scrape") {
    return false;
  }

  console.log("Manual scrape requested");
  requestScrapeFromUpworkTab()
    .then(() => sendResponse({ ok: true }))
    .catch((error) => {
      console.error("Failed to request manual scrape", error);
      sendResponse({ ok: false, error: error.message });
    });

  return true;
});
