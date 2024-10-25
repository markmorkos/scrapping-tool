import puppeteer from "puppeteer";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { addExtra } from 'puppeteer-extra';
import fs from "fs";
import { google } from "googleapis";

const puppeteerExtra = addExtra(puppeteer);
// Add the stealth plugin to puppeteer
puppeteerExtra.use(StealthPlugin());

// Constants and configurations
const LOGIN_URL = "https://www.geoweb.it/2fa/login.aspx";
const CODE_CHECK_URL =
  "https://sister.agenziaentrate.gov.it/Visure/Informativa.do?tipo=/T/TM/VCVC_";
const COOKIES_PATH = "cookies.json"; // Path for saving cookies
const CODES_PATH = "partita_iva.json"; // Path to JSON file with codes
const RESULTS_PATH = "results.json"; // Path to save the results
const USERNAME = "Studiostaart"; // Replace with your username
const PASSWORD = "3350Geometra28!"; // Replace with your password
const SPREADSHEET_ID = "1Xf0yqjGSbdU-xbY2fKMGk8i9Of3naCHB740_CiCVAKk"; // Replace with your Spreadsheet ID
const SHEET_NAME = "Sheet1"; // Replace with your sheet name if different


// Delay helper function
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Function to save cookies to a file
async function saveCookies(page) {
  const cookies = await page.cookies();
  fs.writeFileSync(COOKIES_PATH, JSON.stringify(cookies));
  console.log("Cookies saved.");
}

// Function to load cookies from a file, if they exist
async function loadCookies(page) {
  if (fs.existsSync(COOKIES_PATH)) {
    const cookies = JSON.parse(fs.readFileSync(COOKIES_PATH, "utf8"));
    await page.setCookie(...cookies);
    console.log("Cookies loaded.");
  } else {
    console.log("Cookies file not found. Authentication will be performed.");
  }
}

// Function to load codes from a JSON file
function loadCodes() {
  if (fs.existsSync(CODES_PATH)) {
    const codes = JSON.parse(fs.readFileSync(CODES_PATH, "utf8"));
    return codes;
  } else {
    console.error("Codes file not found.");
    return [];
  }
}

async function authenticateGoogle() {
  const credentials = JSON.parse(
    Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS, "base64").toString("utf8")
  );
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  const authClient = await auth.getClient();
  return authClient;
}


// Function to append data to Google Sheets
async function appendToSheet(authClient, data) {
  const sheets = google.sheets({ version: "v4", auth: authClient });
  const resource = {
    values: data,
  };
  try {
    const result = await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A1`, // Adjust the range as needed
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      resource,
    });
    console.log("Data appended to Google Sheets.");
  } catch (err) {
    console.error("Error appending data to Google Sheets:", err);
  }
}

// Function to perform authentication
async function authenticate(page) {
  // Load cookies before navigation
  await loadCookies(page);

  // Set extra HTTP headers
  await page.setExtraHTTPHeaders({
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    Connection: "keep-alive",
  });

  console.log(`Navigating to page: ${LOGIN_URL}`);
  await page.goto(LOGIN_URL, { waitUntil: "domcontentloaded" });

  // Check if authentication is required
  if (page.url().includes("login.aspx")) {
    console.log("Authentication required. Starting login process...");

    // Find input fields for username and password
    const usernameInput = await page.waitForSelector(
      "form#form1 input[name='utente']"
    );
    const passwordInput = await page.waitForSelector(
      "form#form1 input[name='password']"
    );

    if (usernameInput && passwordInput) {
      console.log("Filling in username and password...");
      await usernameInput.type(USERNAME);
      await passwordInput.type(PASSWORD);
    } else {
      console.error("Could not find input fields for username or password.");
      throw new Error("Login fields not found");
    }

    // Click the login button
    console.log("Clicking the login button...");
    const loginButton = await page.waitForSelector("#loginGeoweb");

    if (loginButton) {
      await loginButton.click();
    } else {
      console.error("Could not find the login button.");
      throw new Error("Login button not found");
    }

    // Wait for navigation after login
    await page.waitForNavigation({ waitUntil: "domcontentloaded" });

    console.log("Authentication successful, saving cookies...");
    await saveCookies(page);
  } else {
    console.log("Already authenticated via cookies.");
  }
}

// Function to navigate to the 'Catasto' section
async function navigateToCatasto(page) {
  console.log("Clicking the 'Skip' button...");
  const skipClicked = await page.evaluate(() => {
    const link = document.querySelector("#LbSkip");
    if (link) {
      link.click();
      return true;
    }
    return false;
  });

  if (!skipClicked) {
    console.error("Could not find the 'Skip' button.");
    throw new Error("'Skip' button not found");
  }

  await page.waitForNavigation({ waitUntil: "domcontentloaded" });

  console.log("Clicking the 'Catasto' button...");
  const catastoClicked = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll("a.card-service-link"));
    const link = links.find((link) =>
      link
        .querySelector("span.visually-hidden")
        ?.textContent.includes("Catasto")
    );
    if (link) {
      link.click();
      return true;
    }
    return false;
  });

  if (!catastoClicked) {
    console.error("Could not find the 'Catasto' button.");
    throw new Error("'Catasto' button not found");
  }

  await page.waitForNavigation({ waitUntil: "domcontentloaded" });

  console.log("Clicking the next button...");
  const nextButtonClicked = await page.evaluate(() => {
    const button = document.querySelector(
      "#Div_3 .col-md-4:first-of-type .card .card-footer .col-3 a"
    );
    if (button) {
      button.removeAttribute("target");
      button.click();
      return true;
    }
    return false;
  });

  if (!nextButtonClicked) {
    console.error("Could not find the next button.");
    throw new Error("Next button not found");
  }

  await page.waitForNavigation({ waitUntil: "domcontentloaded" });
  await delay(2000);
}

// Function to navigate to the code check page
async function navigateToCodeCheck(page) {
  console.log(`Navigating to code check page: ${CODE_CHECK_URL}`);
  await page.goto(CODE_CHECK_URL, { waitUntil: "domcontentloaded" });

  // Click 'Conferma' button
  const confirmClicked = await page.evaluate(() => {
    const confirmButton = document.querySelector('input[value="Conferma"]');
    if (confirmButton) {
      confirmButton.click();
      return true;
    }
    return false;
  });

  if (!confirmClicked) {
    console.error("Could not find 'Conferma' button.");
    throw new Error("'Conferma' button not found");
  }

  await page.waitForNavigation({ waitUntil: "domcontentloaded" });

  // Click 'Consultazioni e Certificazioni' tab
  const consultazioniTabClicked = await page.evaluate(() => {
    const tabLink = document.querySelector(
      '[data-active="Consultazioni e Certificazioni"] a'
    );
    if (tabLink) {
      tabLink.click();
      return true;
    }
    return false;
  });

  if (!consultazioniTabClicked) {
    console.error("Could not find 'Consultazioni e Certificazioni' tab.");
    throw new Error("'Consultazioni e Certificazioni' tab not found");
  }

  await page.waitForNavigation({ waitUntil: "domcontentloaded" });

  // Click 'Visure catastali' tab
  const visureTabClicked = await page.evaluate(() => {
    const tabLink = document.querySelector(
      '[data-active="Visure catastali"] a'
    );
    if (tabLink) {
      tabLink.click();
      return true;
    }
    return false;
  });

  if (!visureTabClicked) {
    console.error("Could not find 'Visure catastali' tab.");
    throw new Error("'Visure catastali' tab not found");
  }

  await page.waitForNavigation({ waitUntil: "domcontentloaded" });

  // Click 'Conferma Lettura'
  const confirmReadClicked = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll("a"));
    const link = links.find((link) =>
      link.textContent.includes("Conferma Lettura")
    );
    if (link) {
      link.click();
      return true;
    }
    return false;
  });

  if (!confirmReadClicked) {
    console.error("Could not find 'Conferma Lettura' link.");
    throw new Error("'Conferma Lettura' link not found");
  }

  await page.waitForNavigation({ waitUntil: "domcontentloaded" });

  // Select 'NAZIONALE-IT' in the dropdown
  const selectOption = await page.evaluate(() => {
    const selectElement = document.querySelector('select[name="listacom"]');
    if (selectElement) {
      selectElement.value = " NAZIONALE-IT"; // Set value manually
      selectElement.dispatchEvent(new Event("change")); // Trigger change event
      return true;
    }
    return false;
  });

  if (!selectOption) {
    console.error("Could not find the select element.");
    throw new Error("Select element not found");
  }

  // Click 'Applica' button
  const applyClicked = await page.evaluate(() => {
    const applyButton = document.querySelector('input[value="Applica"]');
    if (applyButton) {
      applyButton.click();
      return true;
    }
    return false;
  });

  if (!applyClicked) {
    console.error("Could not find 'Applica' button.");
    throw new Error("'Applica' button not found");
  }

  await page.waitForNavigation({ waitUntil: "domcontentloaded" });

  // Click 'Persona giuridica' link
  const personaGiuridicaClicked = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll("a"));
    const link = links.find((link) =>
      link.textContent.includes("Persona giuridica")
    );
    if (link) {
      link.click();
      return true;
    }
    return false;
  });

  if (!personaGiuridicaClicked) {
    console.error("Could not find 'Persona giuridica' link.");
    throw new Error("'Persona giuridica' link not found");
  }

  await page.waitForNavigation({ waitUntil: "domcontentloaded" });
}

// Function to process the list of codes
async function processCodes(page, codes) {
  let results = [];

  for (const item of codes) {
    const code = item.partitaIva; // Extract 'partitaIva' from JSON
    console.log(`Processing code: ${code}`);

    try {
      await delay(2000);

      // Select radio button 'CF_PNF'
      const radioClicked = await page.evaluate(() => {
        const radio = document.querySelector('input[value="CF_PNF"]');
        if (radio) {
          radio.click();
          return true;
        }
        return false;
      });

      if (!radioClicked) {
        console.error("Could not select radio button 'CF_PNF'.");
        continue;
      }

      // Enter VAT code
      const vatInserted = await page.evaluate((code) => {
        const vatInput = document.querySelector("input#cf");
        if (vatInput) {
          vatInput.value = code;
          return true;
        }
        return false;
      }, code);

      if (!vatInserted) {
        console.error("Could not insert VAT code.");
        continue;
      }

      await delay(2000);

      // Click 'ricerca' button
      const searchClicked = await page.evaluate(() => {
        const searchButton = document.querySelector('input[name="ricerca"]');
        if (searchButton) {
          searchButton.removeAttribute("disabled");
          searchButton.click();
          return true;
        }
        return false;
      });

      if (!searchClicked) {
        console.error("Could not click the search button.");
        continue;
      }

      await delay(2000);

      // Get 'Omonimi individuati' count
      const omonimiCount = await page.evaluate(() => {
        const riepilogoText = document.querySelector("div.riepilogo")
          ?.innerText;
        if (riepilogoText) {
          let omText = riepilogoText.split("Omonimi individuati:")[1];
          return Number(omText) ? Number(omText) : 0;
        }
        return 0;
      });

      console.log(`Omonimi individuati: ${omonimiCount}`);

      if (omonimiCount > 0) {

        if (omonimiCount === 1) {
        // Click 'visura' button  
          const visuraClicked = await page.evaluate(() => {
            const visuraButton = document.querySelector('input[name="visura"]');
            if (visuraButton) {
              visuraButton.click();
              return true;
            }
            return false;
          });

          if (!visuraClicked) {
            console.error("Could not click 'visura' button.");
            continue;
          }

          await delay(2000);

          // Click 'immobili' button
          const immobiliClicked = await page.evaluate(() => {
            const immobiliButton = document.querySelector(
              'input[name="immobili"]'
            );
            if (immobiliButton) {
              immobiliButton.click();
              return true;
            }
            return false;
          });

          if (!immobiliClicked) {
            console.error("Could not click 'immobili' button.");
            continue;
          }

          await delay(2000);

          // Check for elements with 'classamento' including 'F'
          const hasF = await page.evaluate(() => {
            const items = document.querySelectorAll('[headers="classamento"]');
            console.log(`Found classamento elements: ${items.length}`);
            if (items.length > 2) {
              for (let item of items) {
                console.log(`Checking element: ${item.innerText}`);
                if (item.innerText.includes("F") || item.innerText.includes("A")) {
                  number ++;
                }
              }
            }
            if(number > 2) {
              return true;
            }
            return false;
          });

          if (hasF) {
            console.log(`Adding code ${code} to results.`);
            results.push(code);
          } else {
            console.log(`No matching elements found for code ${code}.`);
          }
        } else {
            // Need to click on the first input [name="omonimoSelezionato"], proceed to the next page,
            // then on the next page, check for inputs [property="omonimonazionale"], click on each,
            // perform the search, and check for 'F' or 'A' in the columns.
            // Then go back and click the next input, and repeat until all inputs are processed.
          
            // Get all 'omonimoSelezionato' inputs
            const omonimoSelezionatoCount = await page.$$eval(
              'input[name="omonimoSelezionato"]',
              (inputs) => inputs.length
            );
          
            for (let i = 0; i < omonimoSelezionatoCount; i++) {
              // Select the 'omonimoSelezionato' input by index
              const selected = await page.evaluate((index) => {
                const inputs = document.querySelectorAll('input[name="omonimoSelezionato"]');
                if (inputs[index]) {
                  inputs[index].click();
                  return true;
                }
                return false;
              }, i);
          
              if (selected) {
                console.log(`Selected 'omonimoSelezionato' input ${i + 1}`);
              } else {
                console.error(`Could not select 'omonimoSelezionato' input ${i + 1}`);
                continue;
              }
          
              // Click 'visura' button to proceed
              const visuraClicked = await page.evaluate(() => {
                const visuraButton = document.querySelector('input[name="visura"]');
                if (visuraButton) {
                  visuraButton.click();
                  return true;
                }
                return false;
              });
          
              if (visuraClicked) {
                console.log("Clicked 'visura' button.");
              } else {
                console.error("Could not click 'visura' button.");
                continue;
              }
          
              await page.waitForNavigation({ waitUntil: "domcontentloaded" });
              await delay(2000);
          
              // Get all 'omonimonazionale' inputs
              const omonimoNazionaleCount = await page.$$eval(
                'input[property="omonimonazionale"], input[name="omonimonazionale"]',
                (inputs) => inputs.length
              );
              
              console.log(omonimoNazionaleCount +' radio count');
          
              if (omonimoNazionaleCount > 0) {
                for (let j = 0; j < omonimoNazionaleCount; j++) {
                  // Select the 'omonimonazionale' input by index
                  const selectedNazionale = await page.evaluate((index) => {
                    const inputs = document.querySelectorAll('input[property="omonimonazionale"], input[name="omonimonazionale"]');
                    if (inputs[index]) {
                      inputs[index].click();
                      return true;
                    }
                    return false;
                  }, j);
          
                  if (selectedNazionale) {
                    console.log(`Selected 'omonimonazionale' input ${j + 1}`);
                  } else {
                    console.error(`Could not select 'omonimonazionale' input ${j + 1}`);
                    continue;
                  }
          
                  

                  // Click 'immobili' button
                  const immobiliClicked = await page.evaluate(() => {
                    const immobiliButton = document.querySelector(
                      'input[name="immobili"]'
                    );
                    if (immobiliButton) {
                      immobiliButton.click();
                      return true;
                    }
                    return false;
                  });

                  if (!immobiliClicked) {
                    console.error("Could not click 'immobili' button.");
                    continue;
                  }
          
                  await page.waitForNavigation({ waitUntil: "domcontentloaded" });
                  await delay(2000);
          
                  // Perform the check for 'classamento' including 'F' or 'A'
                  const hasFA = await page.evaluate(() => {
                    const items = document.querySelectorAll('[headers="classamento"]');
                    console.log(`Found 'classamento' elements: ${items.length}`);
                    if (items.length > 2) {
                      for (let item of items) {
                        console.log(`Checking element: ${item.innerText}`);
                        if (item.innerText.includes("F") || item.innerText.includes("A")) {
                          number ++;
                        }
                      }
                    }
                    if(number > 2) {
                      return true;
                    }
                    return false;
                  });
          
                  if (hasFA) {
                    console.log(`Adding code ${code} to results.`);
                    results.push(code);
                    // Since we found a match, we can break out of both loops
                    j = omonimoNazionaleCount;
                    i = omonimoSelezionatoCount;
                    break;
                  } else {
                    console.log(
                      `No matching elements found for code ${code} at 'omonimonazionale' input ${
                        j + 1
                      }.`
                    );
                  }
          
                  // Go back to the previous page
                  const backClicked = await page.evaluate(() => {
                    const backButton = document.querySelector('input[name="indietro"]');
                    if (backButton) {
                      backButton.click();
                      return true;
                    }
                    return false;
                  });
          
                  if (backClicked) {
                    console.log("Clicked 'indietro' button to go back.");
                  } else {
                    console.error("Could not click 'indietro' button.");
                    break;
                  }
          
                  await page.waitForNavigation({ waitUntil: "domcontentloaded" });
                  await delay(1000);
                }
              } else {
                // If no 'omonimonazionale' inputs, perform the same check
                // Perform the check for 'classamento' including 'F' or 'A'
                const hasFA = await page.evaluate(() => {
                  const items = document.querySelectorAll('[headers="classamento"]');
                  let number = 0;
                  console.log(`Found 'classamento' elements: ${items.length}`);
          
                  if (items.length > 2) {
                    for (let item of items) {
                      console.log(`Checking element: ${item.innerText}`);
                      if (item.innerText.includes("F") || item.innerText.includes("A")) {
                        number ++;
                      }
                    }
                  }
                  if(number > 2) {
                    return true;
                  }
                  return false;
                });
          
                if (hasFA) {
                  console.log(`Adding code ${code} to results.`);
                  results.push(code);
                  // Since we found a match, we can break out of the loop
                  i = omonimoSelezionatoCount;
                  break;
                } else {
                  console.log(`No matching elements found for code ${code}.`);
                }
              }
          
              // After processing, go back to the previous page
              const backToOmonimoClicked = await page.evaluate(() => {
                const backButton = document.querySelector('input[name="indietro"]');
                if (backButton) {
                  backButton.click();
                  return true;
                }
                return false;
              });
          
              if (backToOmonimoClicked) {
                console.log("Clicked 'indietro' button to return to 'omonimoSelezionato' inputs.");
              } else {
                console.error("Could not click 'indietro' button.");
                break;
              }
          
              await page.waitForNavigation({ waitUntil: "domcontentloaded" });
              await delay(1000);
            }
          
        }
      } else {
        await delay(2000);
      }

      // Click 'indietro' button multiple times
      for (let i = 0; i < 3; i++) {
        const backClicked = await page.evaluate(() => {
          const backButton = document.querySelector('input[name="indietro"]');
          if (backButton) {
            backButton.click();
            return true;
          }
          return false;
        });

        if (backClicked) {
          console.log("Clicked 'indietro' button.");
        } else {
          console.error("Could not click 'indietro' button.");
          break;
        }

        await delay(1000);
      }
    } catch (error) {
      console.error("An error occurred while processing the code:", error);
      // Click on the user collapse button as in your original code
      await page.click("#user-collapse .btn"); 
    }
  }

  return results;
}

// Main function to run the script
export async function loginToGeoweb() {
  let browser;
  try {
    console.log(`Launching browser for URL: ${LOGIN_URL}`);
    const browser = await puppeteerExtra.launch({
      // executablePath: process.env.CHROME_BIN || '/app/.chrome-for-testing/chrome-linux64/chrome',
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
    });
    const page = await browser.newPage();

    await authenticate(page);
    await navigateToCatasto(page);

    // Load codes from JSON file
    const codes = loadCodes();
    if (codes.length === 0) {
      console.error("No codes to process.");
      return;
    }

    let results = [];

    try {
      await navigateToCodeCheck(page);

      // Process each code
      results = await processCodes(page, codes);
    } catch (error) {
      console.error("An error occurred during code processing:", error);
      // Click on the user collapse button as in your original code
      await page.click("#user-collapse .btn");
    }

    console.log("Process completed.");
    console.log("Results:", results);

    // Authenticate with Google Sheets
    const authClient = await authenticateGoogle();

    // Prepare data for Google Sheets (convert results to a 2D array)
    // Assuming results is an array of codes or false values
    const dataToAppend = results.map((result) => [result || "No Match"]);

    // Append results to Google Sheets
    await appendToSheet(authClient, dataToAppend);

    // Save results to a JSON file
    fs.writeFileSync(
      RESULTS_PATH,
      JSON.stringify(results, null, 2),
      (err) => {
        if (err) throw err;
        console.log(`Results saved to ${RESULTS_PATH}`);
      }
    );

    // Click on the user collapse button as in your original code
    await page.click("#user-collapse .btn");
  } catch (error) {
    console.error("An error occurred during execution:", error);
  } finally {
    if (browser) {
      await page.click("#user-collapse .btn");
      await browser.close();
    }
  }
}

