import { basename, resolve } from "node:path";

const defaultBaseUrl = "https://paper-bank-backend.hasanmutebi.workers.dev";
const defaultGoodPdfPath = resolve(process.cwd(), "tests/api/Business-Intelligence-CAT.pdf");
const defaultBadPdfPath = resolve(process.cwd(), "tests/api/KULUBYA HASSAN MUTEBI.pdf");

const readRequiredEnv = (name: string) => {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required.`);
  }

  return value;
};

const postPrefill = async (baseUrl: string, token: string, filePath: string) => {
  const file = Bun.file(filePath);
  const fileName = file.name || basename(filePath);

  if (!(await file.exists())) {
    throw new Error(`File not found: ${filePath}`);
  }

  const formData = new FormData();
  formData.set("file", new File([await file.arrayBuffer()], fileName, { type: file.type || "application/pdf" }));

  const response = await fetch(`${baseUrl}/api/uploads/prefill`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`
    },
    body: formData
  });

  const text = await response.text();

  return {
    filePath,
    status: response.status,
    ok: response.ok,
    body: text
  };
};

const printResult = (label: string, result: Awaited<ReturnType<typeof postPrefill>>) => {
  console.log(`\n=== ${label} ===`);
  console.log(`file: ${result.filePath}`);
  console.log(`status: ${result.status}`);

  try {
    console.log(JSON.stringify(JSON.parse(result.body), null, 2));
  } catch {
    console.log(result.body);
  }
};

const main = async () => {
  const token = readRequiredEnv("PREFILL_TEST_TOKEN");
  const baseUrl = process.env.PREFILL_TEST_URL?.trim() || defaultBaseUrl;
  const goodPdfPath = process.env.PREFILL_TEST_GOOD_PDF?.trim() || defaultGoodPdfPath;
  const badPdfPath = process.env.PREFILL_TEST_BAD_PDF?.trim() || defaultBadPdfPath;

  console.log(`Testing prefill against ${baseUrl}`);

  const goodResult = await postPrefill(baseUrl, token, goodPdfPath);
  printResult("REAL STRATHMORE PDF", goodResult);

  const badResult = await postPrefill(baseUrl, token, badPdfPath);
  printResult("WRONG PDF", badResult);
};

await main();
