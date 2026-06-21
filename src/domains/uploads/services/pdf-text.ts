const PDF_SIGNATURE = "%PDF-";

const decodePdfTextFragment = (fragment: string) => {
  return fragment
    .replace(/\\n/g, " ")
    .replace(/\\r/g, " ")
    .replace(/\\t/g, " ")
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/\\\\/g, "\\");
};

export const looksLikePdf = (file: File, fileText: string) => {
  return (
    file.type === "application/pdf" ||
    file.name.toLowerCase().endsWith(".pdf") ||
    fileText.startsWith(PDF_SIGNATURE)
  );
};

export const extractPdfText = (fileText: string) => {
  const fragments = Array.from(fileText.matchAll(/\(([^()]*)\)/g), (match) =>
    decodePdfTextFragment(match[1] ?? "")
  );

  return fragments.join(" ").replace(/\s+/g, " ").trim();
};

export const extractPdfTextFromBytes = (fileBytes: ArrayBuffer) => {
  const fileText = new TextDecoder().decode(fileBytes);
  return {
    fileText,
    extractedText: extractPdfText(fileText)
  };
};

export const createTextPreview = (text: string) => {
  if (!text) {
    return "";
  }

  return text.slice(0, 280);
};
