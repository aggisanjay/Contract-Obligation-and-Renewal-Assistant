import fs from "node:fs";
import path from "node:path";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import JSZip from "jszip";

const SAMPLES_DIR = path.resolve(process.cwd(), "samples");
if (!fs.existsSync(SAMPLES_DIR)) {
  fs.mkdirSync(SAMPLES_DIR, { recursive: true });
}

// ----------------------------------------------------
// 1. Generate Sample PDFs using pdf-lib
// ----------------------------------------------------
async function generateSamplePdf(filename, isV2 = false) {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // Page 1
  const page1 = pdfDoc.addPage([595, 842]); // A4
  let y = 780;

  function drawHeading(text) {
    page1.drawText(text, { x: 50, y, size: 14, font: boldFont, color: rgb(0.1, 0.1, 0.2) });
    y -= 24;
  }

  function drawLine(text) {
    page1.drawText(text, { x: 50, y, size: 10, font, color: rgb(0.2, 0.2, 0.2) });
    y -= 16;
  }

  function addGap() {
    y -= 14;
  }

  drawHeading(isV2 ? "CLOUD SERVICES AGREEMENT (AMENDED VERSION 2)" : "MASTER CLOUD SERVICES AGREEMENT");
  drawLine(isV2 ? "This Amended Agreement is executed on October 1, 2025." : "This Agreement is executed on June 1, 2025.");
  addGap();

  drawHeading("Section 1.1 Parties and Effective Date");
  drawLine("This Agreement is entered into by and between CloudMatrix Solutions LLC (\"Provider\"),");
  drawLine("and Horizon Enterprise Retailers Inc. (\"Customer\").");
  drawLine("The Effective Date of this Agreement shall be June 15, 2025.");
  addGap();

  drawHeading("Section 2.1 Term and Expiration");
  drawLine("The initial term of this Agreement shall commence on the Effective Date and continue");
  drawLine(isV2 ? "for a period of thirty-six (36) months until June 15, 2028." : "for a period of twelve (12) months until June 15, 2026.");
  addGap();

  drawHeading("Section 2.2 Automatic Renewal");
  drawLine("This Agreement shall automatically renew for consecutive one-year terms");
  drawLine(isV2 ? "unless either party delivers written notice of non-renewal at least sixty (60) days prior to expiration." : "unless either party delivers written notice of non-renewal at least thirty (30) days prior to expiration.");
  addGap();

  drawHeading("Section 3.1 Operational Obligations and Service Deliverables");
  drawLine("Provider shall maintain 99.9% platform availability and provide monthly service uptime reports");
  drawLine("within ten (10) calendar days following the conclusion of each calendar month.");
  drawLine("Customer shall pay all undisputed recurring service invoices within thirty (30) days of receipt.");
  addGap();

  drawHeading("Section 4.1 Notice Delivery Requirements");
  drawLine("All formal legal notices, including notice of non-renewal or termination, must be delivered");
  drawLine("via certified registered mail or acknowledged email to legal@cloudmatrix.example.com.");

  const pdfBytes = await pdfDoc.save();
  const filePath = path.join(SAMPLES_DIR, filename);
  fs.writeFileSync(filePath, Buffer.from(pdfBytes));
  console.log(`Generated sample PDF: ${filePath} (${pdfBytes.length} bytes)`);
}

// ----------------------------------------------------
// 2. Generate Sample DOCX files using JSZip
// ----------------------------------------------------
async function generateSampleDocx(filename, isV2 = false) {
  const zip = new JSZip();

  // [Content_Types].xml
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`
  );

  // _rels/.rels
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`
  );

  // word/document.xml
  const paragraphs = [
    isV2 ? "MASTER PROFESSIONAL SERVICES AGREEMENT (REVISED V2)" : "MASTER PROFESSIONAL SERVICES AGREEMENT",
    "Section 1.1 Contracting Parties",
    "This Agreement is made by and between Vertex Consulting Corp (\"Consultant\") and Apex Global Dynamics Inc (\"Client\").",
    "Section 1.2 Effective Date",
    "The Effective Date of this Agreement is July 1, 2025.",
    "Section 2.1 Term Duration and Expiration",
    isV2
      ? "The term of this Agreement shall commence on the Effective Date and remain in full effect for twenty-four (24) months until July 1, 2027."
      : "The term of this Agreement shall commence on the Effective Date and remain in effect for twelve (12) months until July 1, 2026.",
    "Section 2.2 Renewal and Advance Notice",
    isV2
      ? "This Agreement shall automatically renew for successive 1-year terms unless either party provides written notice of non-renewal at least 45 days prior to expiration."
      : "This Agreement shall automatically renew for successive 1-year terms unless either party provides written notice of non-renewal at least 30 days prior to expiration.",
    "Section 3.1 Milestone Deliverables and Reporting Obligations",
    "Consultant shall deliver quarterly audit reports within 15 days following the end of each fiscal quarter.",
    "Client shall review and process monthly consulting fees within thirty (30) days from invoice receipt.",
    "Section 4.1 Termination and Cure Period",
    "Either party may terminate this Agreement upon thirty (30) days written notice in the event of material breach, subject to a fifteen (15) day cure period.",
  ];

  const bodyXml = paragraphs
    .map((p) => `<w:p><w:r><w:t>${p}</w:t></w:r></w:p>`)
    .join("\n    ");

  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${bodyXml}
  </w:body>
</w:document>`
  );

  const buffer = await zip.generateAsync({ type: "nodebuffer" });
  const filePath = path.join(SAMPLES_DIR, filename);
  fs.writeFileSync(filePath, buffer);
  console.log(`Generated sample DOCX: ${filePath} (${buffer.length} bytes)`);
}

async function main() {
  await generateSamplePdf("sample_contract_cloud_services.pdf", false);
  await generateSamplePdf("sample_contract_cloud_services_v2.pdf", true);
  await generateSampleDocx("sample_master_services_agreement.docx", false);
  await generateSampleDocx("sample_master_services_agreement_v2.docx", true);
  console.log("All sample contracts created successfully.");
}

main().catch((err) => {
  console.error("Error generating samples:", err);
  process.exit(1);
});
