/*
 * Upwork Job Alert Extension - Content Script
 *
 * How to load:
 * 1. Open Chrome and go to chrome://extensions.
 * 2. Enable "Developer mode".
 * 3. Click "Load unpacked" and select this extension folder.
 *
 * How to see logs:
 * 1. Open https://www.upwork.com/nx/find-work/ while logged in.
 * 2. Open DevTools on the Upwork page with F12 or Ctrl+Shift+I.
 * 3. Select the Console tab.
 *
 * Successful run:
 * - The console logs how many visible jobs were found.
 * - The console logs "Sent X jobs to Python backend".
 * - If the backend is not running, it logs "Backend not running. Start python server.py".
 */

const BACKEND_JOBS_URL = "http://localhost:5000/jobs";

function getText(root, selectors, fallback = "N/A") {
  for (const selector of selectors) {
    const element = root.querySelector(selector);
    const text = element && element.textContent ? element.textContent.trim() : "";

    if (text) {
      return normalizeWhitespace(text);
    }
  }

  return fallback;
}

function normalizeWhitespace(value) {
  return value.replace(/\s+/g, " ").trim();
}

function getJobCards() {
  const selectors = [
    '[data-test="job-tile"]',
    'article[class*="job-tile"]',
    'article[data-test*="job"]',
    'section[data-test="job-tile"]',
    'div[class*="job-tile"]'
  ];

  const seen = new Set();
  const cards = [];

  for (const selector of selectors) {
    document.querySelectorAll(selector).forEach((card) => {
      if (!seen.has(card)) {
        seen.add(card);
        cards.push(card);
      }
    });
  }

  return cards;
}

function getJobUrl(card) {
  const selectors = [
    'h2 a[href]',
    'h3 a[href]',
    'a[data-test="job-tile-title-link"][href]',
    'a[href*="/jobs/"][href]',
    'a[href*="/freelance-jobs/apply/"][href]',
    'a[href]'
  ];

  for (const selector of selectors) {
    const link = card.querySelector(selector);
    const href = link ? link.getAttribute("href") : "";

    if (href) {
      return new URL(href, window.location.origin).href;
    }
  }

  return "N/A";
}

function getBudget(card) {
  const selectors = [
    '[data-test="budget"]',
    '[data-test="job-type"]',
    '[data-test="job-budget"]',
    'span[class*="budget"]',
    'div[class*="budget"]',
    'span[class*="job-type"]',
    'div[class*="job-type"]',
    'li[class*="budget"]',
    'li[class*="job-type"]'
  ];

  const budget = getText(card, selectors, "");

  if (budget) {
    return budget;
  }

  const cardText = normalizeWhitespace(card.textContent || "");
  const hourlyMatch = cardText.match(/\$[\d,.]+\s*-\s*\$[\d,.]+\s*\/?\s*hr/i);
  const fixedMatch = cardText.match(/\$[\d,.]+\s*(?:fixed-price|fixed price|budget)?/i);

  if (hourlyMatch) {
    return hourlyMatch[0];
  }

  if (fixedMatch) {
    return fixedMatch[0];
  }

  return "Not specified";
}

function getFeedType() {
  const selectors = [
    '[aria-selected="true"]',
    '[role="tab"][aria-current="page"]',
    '[role="tab"].active',
    'a.active',
    'button.active'
  ];

  const selectedText = getText(document, selectors, "");

  if (/best match/i.test(selectedText)) {
    return "Best Match";
  }

  if (/most recent/i.test(selectedText)) {
    return "Most Recent";
  }

  if (/(u\+\s*feed|my feed)/i.test(selectedText)) {
    return "U+ Feed / My Feed";
  }

  const pageText = normalizeWhitespace(document.body ? document.body.textContent || "" : "");

  if (/Best Match/.test(pageText)) {
    return "Best Match";
  }

  if (/Most Recent/.test(pageText)) {
    return "Most Recent";
  }

  if (/U\+\s*Feed|My Feed/.test(pageText)) {
    return "U+ Feed / My Feed";
  }

  return "N/A";
}

function scrapeJobs() {
  const feedType = getFeedType();

  return getJobCards().map((card) => ({
    title: getText(card, [
      'h2[class*="title"]',
      'h3[class*="title"]',
      '[data-test="job-tile-title"]',
      '[data-test="job-title"]',
      'h2 a',
      'h3 a',
      'h2',
      'h3'
    ]),
    description: getText(card, [
      '[data-test="job-description"]',
      '[data-test="description"]',
      'div[class*="job-description"]',
      'p[class*="job-description"]',
      'div[class*="description"]',
      'p[class*="description"]',
      'p'
    ]),
    budget: getBudget(card),
    url: getJobUrl(card),
    posted_time: getText(card, [
      '[data-test="posted-on"]',
      'span[class*="posted"]',
      'div[class*="posted"]',
      'small[class*="posted"]',
      'time'
    ]),
    feed_type: feedType
  }));
}

async function sendJobsToBackend(jobs) {
  try {
    await fetch(BACKEND_JOBS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(jobs)
    });

    console.log(`Sent ${jobs.length} jobs to Python backend`);
  } catch (error) {
    console.error("Backend not running. Start python server.py", error);
  }
}

async function scrapeAndSendJobs() {
  const jobs = scrapeJobs();

  console.log(`${jobs.length} jobs found per scrape`);
  await sendJobsToBackend(jobs);
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.action !== "scrape") {
    return false;
  }

  scrapeAndSendJobs()
    .then(() => sendResponse({ ok: true }))
    .catch((error) => {
      console.error("Failed to scrape jobs", error);
      sendResponse({ ok: false, error: error.message });
    });

  return true;
});

scrapeAndSendJobs();
