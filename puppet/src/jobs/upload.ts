import path from "path";
import fs from "fs/promises";
import { setTimeout } from "timers/promises";
import puppeteer, {
  CookieParam,
  ElementHandle,
  Page,
  PuppeteerError,
} from "puppeteer";
import "dotenv";

interface Credential {
  url: string;
  localData: LocalDatum[];
  cookies: CookieParam[];
}

interface LocalDatum {
  store: string;
  key: string;
  value: string;
}

type NullableCredential = Credential | null;

const isInsideContainer = process.env.IS_INSIDE_CONTAINER;
const credentialPath = path.join(__dirname, "..", "credential.json");
const queuePath = path.join(__dirname, "..", "queue", "files");
const isFileUploadingIndicatorPath = path.join(
  __dirname,
  "..",
  "queue",
  "is-file-uploading",
);

async function getCredential(): Promise<NullableCredential> {
  const data = await fs
    .readFile(credentialPath, {
      encoding: "utf8",
    })
    .catch(() => "");

  if (data === "") {
    return null;
  }

  return JSON.parse(data) as NullableCredential;
}

async function checkQueue() {
  const data = await fs.readFile(queuePath, { encoding: "utf8" });
  return data;
}

function getFirstLine(data: string) {
  return (data.match(/(^.*)/) || [])[1] || "";
}

async function isFileUploading() {
  const data = await fs
    .readFile(isFileUploadingIndicatorPath, {
      encoding: "utf8",
    })
    .catch(() => "false");
  const result = getFirstLine(data) === "true" ? true : false;
  return result;
}

async function waitForAllRequestsToComplete(page: Page): Promise<void> {
  const pendingRequests = new Set<string>();

  page.on("request", (request) => {
    pendingRequests.add(request.url());
  });

  page.on("requestfinished", (request) => {
    pendingRequests.delete(request.url());
  });

  page.on("requestfailed", (request) => {
    pendingRequests.delete(request.url());
  });

  // Wait until all pending requests are resolved
  while (pendingRequests.size > 0) {
    await setTimeout(100);
  }
}

async function removeLineFromFile(
  filePath: string,
  match: string,
): Promise<void> {
  const tempFilePath = filePath + ".tmp";

  try {
    // Read the entire file content
    const fileContent = await fs.readFile(filePath, "utf-8");

    // Filter out the lines that contain the match
    const filteredContent = fileContent
      .split("\n")
      .filter((line) => !line.includes(match))
      .join("\n");

    // Write the filtered content to a temporary file
    await fs.writeFile(tempFilePath, filteredContent);

    // Replace the original file with the temporary file
    await fs.rename(tempFilePath, filePath);
  } catch (error) {
    console.error("Error processing file:", error);
    // Optionally, handle the error (e.g., remove the temp file if needed)
  }
}

(async () => {
  const credential = await getCredential();
  if (!credential) {
    return console.log("No credential file found!");
  }
  const isUploading = await isFileUploading();
  if (isUploading) {
    return console.log("Waiting for job to be finished...");
  }

  const queues = await checkQueue();
  if (queues === "") {
    return console.log("No queue for now.");
  }

  try {
    const isContainer = isInsideContainer === "true";
    console.log("is inside container: ", isContainer);
    await fs.writeFile(isFileUploadingIndicatorPath, "true");
    const fileNames = await checkQueue();
    const fileName = getFirstLine(fileNames);
    const filePath = path.join(__dirname, "..", "files", fileName);

    console.log("Begin upload process...");
    const browser = await puppeteer.launch({
      protocolTimeout: 0,
      args: isContainer ? ["--no-sandbox"] : undefined,
      executablePath: isContainer ? "/usr/bin/google-chrome" : undefined,
    });

    const page = await browser.newPage();

    await page.goto(credential.url);
    await page.setCookie(...credential.cookies);
    await page.evaluate(
      ({ localData }) => {
        localData.forEach((data) => {
          localStorage.setItem(data.key, data.value);
        });
      },
      { localData: credential.localData },
    );
    await page.goto(credential.url);
    await page.setViewport({ width: 1080, height: 1024 });
    const logoutBtnXpath = '::-p-xpath(//*[contains(text(), "Logout")])';
    const logoutBtn = await page
      .waitForSelector(logoutBtnXpath, {
        timeout: 1000,
      })
      .catch(async (_err) => {
        await fs.writeFile(isFileUploadingIndicatorPath, "false");
        return null;
      });
    if (!logoutBtn) {
      await browser.close();
      return console.log("No account detected.");
    }
    const inputHandle = (await page.$(
      "#file-uploader",
    )) as ElementHandle<HTMLInputElement>;
    await inputHandle.uploadFile(filePath);
    const uploadBtnXpath = '::-p-xpath(//*[contains(text(), "UPLOAD")])';
    const uploadBtn = (await page.waitForSelector(
      uploadBtnXpath,
    )) as ElementHandle<HTMLButtonElement>;
    await uploadBtn.click();
    await setTimeout(2000);
    await page.waitForSelector(".overflow-hidden.z-10", {
      timeout: 0,
    });
    await setTimeout(2000);
    await waitForAllRequestsToComplete(page);
    // Set screen size.
    await fs.writeFile(isFileUploadingIndicatorPath, "false");
    await removeLineFromFile(queuePath, fileName);
    await fs.unlink(filePath);
    await browser.close();
    console.log("File uploaded!");
  } catch (error) {
    if (error instanceof PuppeteerError) {
      await fs.writeFile(isFileUploadingIndicatorPath, "false");
    }
  }
})();
