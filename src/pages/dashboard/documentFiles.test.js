import { DOCUMENT_ERROR, validateDocumentContents, validateDocumentFile } from "./documentFiles";
import { isEssayImage } from "./essayPages";

test.each([
  ["essay.pdf", "%PDF-1.7", "application/pdf"],
  ["essay.docx", "PK\x03\x04", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  ["essay.doc", new Uint8Array([208, 207, 17, 224, 161, 177, 26, 225]), "application/msword"],
  ["essay.PDF", "%PDF-1.7", ""],
])("accepts %s with an appropriate signature", async (name, data, type) => {
  await expect(validateDocumentContents(new File([data], name, { type }))).resolves.toBeUndefined();
});

test.each(["txt", "md", "csv", "json", "jpg", "png", "webp", "bmp", "tiff", "xlsx", "pptx", "exe"])("rejects %s even with PDF MIME", extension => {
  expect(() => validateDocumentFile(new File(["%PDF-"], `essay.${extension}`, { type: "application/pdf" }))).toThrow(DOCUMENT_ERROR);
});

test("rejects MIME mismatch and renamed content; a subsequent PDF works", async () => {
  expect(() => validateDocumentFile(new File(["%PDF-"], "pdf"))).toThrow(DOCUMENT_ERROR);
  expect(() => validateDocumentFile(new File(["%PDF-"], "essay.pdf", { type: "image/jpeg" }))).toThrow(DOCUMENT_ERROR);
  await expect(validateDocumentContents(new File(["ordinary text"], "fake.pdf"))).rejects.toThrow(DOCUMENT_ERROR);
  await expect(validateDocumentContents(new File(["%PDF-1.7"], "valid.pdf"))).resolves.toBeUndefined();
  expect(isEssayImage(new File(["image"], "photo.jpg", { type: "image/jpeg" }))).toBe(true);
});
