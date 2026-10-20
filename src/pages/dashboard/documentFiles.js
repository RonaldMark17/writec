export const DOCUMENT_ACCEPT = ".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export const DOCUMENT_ERROR = "Unsupported file type. Please upload a PDF, DOC, or DOCX file only.";
export const DOC_LIMITATION = "Legacy DOC processing is not supported. Save the document as PDF or DOCX and choose it again.";
const types = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

export function validateDocumentFile(file) {
  const extension = /\.([^.]+)$/.exec(file?.name || "")?.[1]?.toLowerCase();
  const mime = (file?.type || "").toLowerCase().split(";")[0];
  if (!types[extension] || (mime && mime !== "application/octet-stream" && mime !== types[extension])) {
    throw new Error(DOCUMENT_ERROR);
  }
}

export async function validateDocumentContents(file) {
  validateDocumentFile(file);
  const bytes = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result));
    reader.onerror = () => reject(new Error("The document could not be read. Choose it again."));
    reader.readAsArrayBuffer(file.slice(0, 8));
  });
  const extension = file.name.split(".").pop().toLowerCase();
  const signature = extension === "pdf" ? [37, 80, 68, 70, 45]
    : extension === "doc" ? [208, 207, 17, 224, 161, 177, 26, 225] : [80, 75, 3, 4];
  if (!signature.every((byte, index) => bytes[index] === byte)) throw new Error(DOCUMENT_ERROR);
}
