import puppeteer from "puppeteer";
// import StealthPlugin from "puppeteer-extra-plugin-stealth";
// import { addExtra } from 'puppeteer-extra';
import * as cheerio from "cheerio";
import fs from "fs";
import * as geo from "./geo.mjs";
import path from "path"; // Importing path

// Path to the log file
const LOG_FILE_PATH = path.join('/home/ec2-user', 'app.log');
const CODES_PATH = path.join('/home/ec2-user', 'partita_iva.json');

// Function to log messages to a file
function logToFile(message) {
  const timestamp = new Date().toISOString(); // Formatting date and time
  fs.appendFileSync(LOG_FILE_PATH, `${timestamp} - ${message}\n`, 'utf8');
}

// Overriding console.log and console.error
console.log = (...args) => {
  const message = args.join(' ');
  logToFile(message); // Logging to file
  process.stdout.write(`${message}\n`); // Output to console
};

console.error = (...args) => {
  const message = args.join(' ');
  logToFile(message); // Logging to file
  process.stderr.write(`${message}\n`); // Output to console
};

const mainUrl = "https://portalecreditori.it/procedure.php?altre=fallimenti&order=data&verso=desc";
let partitaIvaList = [];

// Function to save the Partita Iva array to a JSON file
function saveToJsonFile() {
  fs.writeFileSync(CODES_PATH, JSON.stringify(partitaIvaList, null, 2), (err) => {
    if (err) throw err;
    console.log("Partita Iva data saved to JSON file");
  });
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchData(url) {
  try {
    console.log(`Opening browser for URL: ${url}`);
    const browser = await puppeteer.launch({
      // executablePath: process.env.CHROME_BIN || '/app/.chrome-for-testing/chrome-linux64/chrome',
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
    });
    const page = await browser.newPage();

    await page.setExtraHTTPHeaders({
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9",
      "Accept-Encoding": "gzip, deflate, br",
      Connection: "keep-alive",
    });
    logToFile(Date.now());
    console.log(`Navigating to page: ${url}`);
    await page.goto(url, { waitUntil: "domcontentloaded" });

    console.log(`Loading page content: ${url}`);
    const content = await page.content();

    console.log(`Closing browser for URL: ${url}`);
    await browser.close();

    console.log(`Page content loaded for URL: ${url}`);
    return cheerio.load(content);
  } catch (error) {
    console.error(`Error fetching ${url}:`, error);
  }
}

async function parseMainPage() {
  console.log("Starting to parse the main page...");
  const links = [];
  console.log("Searching for all links...");

  for (let i = 1; i < 2; i++) {
    const $ = await fetchData(mainUrl + '&page=' + i);

    if (!$) {
      console.error("Failed to load page " + i);
      return;
    }
    $("a").each((index, element) => {
      const href = $(element).attr("href");
      if (href && href.includes("procedura")) {
        console.log(`Found link: ${href}`);
        links.push(href);
      }
    });
  }

  if (links.length === 0) {
    console.log("No links to company pages found.");
    return;
  }

  console.log(`Found ${links.length} links. Starting to parse company pages...`);

  for (const link of links) {
    const fullLink = `https://portalecreditori.it${link}`;
    console.log(`Navigating to link: ${fullLink}`);
    await parseCompanyPage(fullLink);
  }

  saveToJsonFile();
  geo.loginToGeoweb();
}

async function parseCompanyPage(url) {
  console.log(`Starting to parse company page: ${url}`);
  const $ = await fetchData(url);

  if (!$) {
    console.error(`Failed to load company page: ${url}`);
    return;
  }

  const partitaIva = $("body")
    .text()
    .match(/Partita Iva:\s*([\d]+)/);
  if (partitaIva) {
    const iva = partitaIva[1];
    console.log(`Partita Iva: ${iva} on page ${url}`);

    partitaIvaList.push({ url, partitaIva: iva });
  } else {
    console.log(`Partita Iva not found on page ${url}`);
  }
}

parseMainPage();
