import chromium from "chrome-aws-lambda";
import puppeteer from "puppeteer-core";
import * as cheerio from "cheerio";
import fs from "fs";

const mainUrl = "https://portalecreditori.it/procedure.php?altre=fallimenti&order=data&verso=desc";

// Функция для записи найденных Partita Iva в файл, расположенный в /tmp
function appendToFile(data) {
  const filePath = "/tmp/partita_iva.txt"; // Используем /tmp для AWS Lambda
  fs.appendFileSync(filePath, `${data}\n`, (err) => {
    if (err) throw err;
    console.log("Partita Iva добавлена в файл");
  });
}

async function fetchData(url) {
  try {
    console.log(`Открываем браузер для URL: ${url}`);
    const browser = await puppeteer.launch({
      args: [
        ...chromium.args,
        '--no-sandbox', 
        '--disable-setuid-sandbox',
        '--single-process',
        '--disable-dev-shm-usage'
      ],
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath, // Используем оптимизированный Chromium для Lambda
      headless: chromium.headless, // Используем headless-режим
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
  const $ = await fetchData(mainUrl);

  if (!$) {
    console.error("Не удалось загрузить главную страницу.");
    return;
  }

  const links = [];
  console.log("Ищем все ссылки на странице...");
  $("a").each((index, element) => {
    const href = $(element).attr("href");
    if (href && href.includes("procedura")) {
      console.log(`Найдена ссылка: ${href}`);
      links.push(href);
    }
  });

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

    appendToFile(iva);
  } else {
    console.log(`Partita Iva не найдена на странице ${url}`);
  }
}

// Экспорт обработчика для AWS Lambda
export const handler = async (event) => {
  try {
    await parseMainPage();
    return {
      statusCode: 200,
      body: JSON.stringify("Парсинг завершен успешно."),
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify(`Ошибка при парсинге: ${error.message}`),
    };
  }
};
