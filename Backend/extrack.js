import fs from "fs";
import pdf from "pdf-parse-fixed";

export async function extractTextFromPDF(path) {
  const dataBuffer = fs.readFileSync(path);
  const data = await pdf(dataBuffer);

  return {
    text: data.text || "",
    numPages: data.numpages || 0
  };
}
