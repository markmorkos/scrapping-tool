import puppeteer from "puppeteer-core";
import * as cheerio from "cheerio";
import fs from "fs";

const mainUrl = "https://portalecreditori.it/procedure.php?altre=fallimenti&order=data&verso=desc";
let partitaIvaList = [];

// Функция для записи массива Partita Iva в JSON файл
function saveToJsonFile() {
  fs.writeFileSync("partita_iva.json", JSON.stringify(partitaIvaList, null, 2), (err) => {
    if (err) throw err;
    console.log("Partita Iva данные сохранены в файл JSON");
  });
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchData(url) {
  try {
    console.log(`Открываем браузер для URL: ${url}`);
    const browser = await puppeteer.launch({
      executablePath: process.env.CHROME_BIN || '/app/.chrome-for-testing/chrome-linux64/chrome',
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

    console.log(`Переходим на страницу: ${url}`);
    await page.goto(url, { waitUntil: "domcontentloaded" });

    console.log(`Загружаем контент страницы: ${url}`);
    const content = await page.content();

    console.log(`Закрываем браузер для URL: ${url}`);
    await browser.close();

    console.log(`Контент страницы загружен для URL: ${url}`);
    return cheerio.load(content);
  } catch (error) {
    console.error(`Ошибка при запросе ${url}:`, error);
  }
}

async function parseMainPage() {
  console.log("Начинаем парсинг главной страницы...");
  const links = [];
  console.log("Ищем все ссылки...");

  for(let i = 1; i < 2; i++) {
    const $ = await fetchData(mainUrl+'&page='+i);

    if (!$) {
      console.error("Не удалось загрузить страницу" + i);
      return;
    }
    $("a").each((index, element) => {
      const href = $(element).attr("href");
      if (href && href.includes("procedura")) {
        console.log(`Найдена ссылка: ${href}`);
        links.push(href);
      }
    });
  }
  

  

  if (links.length === 0) {
    console.log("Ссылки на страницы компаний не найдены.");
    return;
  }

  console.log(`Найдено ${links.length} ссылок. Начинаем парсинг страниц компаний...`);

  for (const link of links) {
    const fullLink = `https://portalecreditori.it${link}`;
    console.log(`Переходим по ссылке: ${fullLink}`);
    await parseCompanyPage(fullLink);
  }

  // Сохранение всех собранных данных в JSON файл
  saveToJsonFile();
}

async function parseCompanyPage(url) {
  console.log(`Начинаем парсинг страницы компании: ${url}`);
  const $ = await fetchData(url);

  if (!$) {
    console.error(`Не удалось загрузить страницу компании: ${url}`);
    return;
  }

  const partitaIva = $("body")
    .text()
    .match(/Partita Iva:\s*([\d]+)/);
  if (partitaIva) {
    const iva = partitaIva[1];
    console.log(`Partita Iva: ${iva} на странице ${url}`);

    // Добавляем найденный Partita Iva в массив
    partitaIvaList.push({ url, partitaIva: iva });
  } else {
    console.log(`Partita Iva не найдена на странице ${url}`);
  }
}

parseMainPage();
