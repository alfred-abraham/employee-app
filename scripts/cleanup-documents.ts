import { claimDocumentCleanup, documentRepository } from "../src/lib/document-repository";
import { documentStorage } from "../src/lib/document-storage";
import { db } from "../src/db";

async function main() {
  const documents = await claimDocumentCleanup();
  let failed = 0;
  for (const document of documents) {
    try {
      await documentStorage.delete(document);
      await documentRepository.remove(document.id);
    } catch (error) {
      failed++;
      console.error("Document cleanup needs retry", { documentId: document.id, error });
    }
  }
  console.log(`Document cleanup: ${documents.length - failed} removed, ${failed} awaiting retry.`);
  if (failed) process.exitCode = 1;
}

main().catch((error) => { console.error("Document cleanup failed", error); process.exitCode = 1; }).finally(() => db.$client.end());
