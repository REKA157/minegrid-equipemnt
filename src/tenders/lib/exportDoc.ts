/**
 * Exports professionnels des documents générés.
 *
 * - Word : fichier .doc (HTML compatible Word) — s'ouvre et se modifie dans
 *   Word / LibreOffice. Un vrai .docx pourra remplacer ce format plus tard
 *   sans changer les appels (même signature).
 * - PDF : fenêtre d'impression stylée (l'utilisateur choisit « Enregistrer
 *   en PDF ») — fonctionne sans dépendance supplémentaire.
 * - Excel : exceljs (BPU, DPGF, grilles) — import dynamique comme dans le
 *   reste du projet (~600 kB évités au chargement initial).
 * - ZIP : jszip — dossier final complet d'un AO (tous les documents).
 */

import type { CompanyProfile, GeneratedDocument, Tender } from '../types';
import { DOCUMENT_TYPE_LABELS, formatDate } from '../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function paragraphs(content: string): string {
  return content
    .split(/\n{2,}/)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br/>')}</p>`)
    .join('\n');
}

export function sanitizeFileName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9 _-]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 80) || 'document';
}

function triggerDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5_000);
}

// ---------------------------------------------------------------------------
// HTML du document (partagé Word / PDF / aperçu)
// ---------------------------------------------------------------------------

const DOC_STYLES = `
  body { font-family: 'Calibri', 'Segoe UI', Arial, sans-serif; color: #1a1a1a; line-height: 1.5; font-size: 11pt; margin: 2.2cm; }
  header.doc { border-bottom: 3px solid #ea580c; padding-bottom: 12px; margin-bottom: 28px; }
  .company { font-size: 9pt; color: #555; white-space: pre-line; }
  h1 { font-size: 17pt; color: #9a3412; margin: 8px 0 2px; }
  .meta { font-size: 9pt; color: #777; }
  h2 { font-size: 13pt; color: #c2410c; border-bottom: 1px solid #fed7aa; padding-bottom: 3px; margin-top: 24px; page-break-after: avoid; }
  p { margin: 6px 0; text-align: justify; }
  table { border-collapse: collapse; width: 100%; margin: 10px 0; font-size: 9.5pt; }
  th { background: #fff7ed; border: 1px solid #d9d9d9; padding: 5px 7px; text-align: left; color: #9a3412; }
  td { border: 1px solid #d9d9d9; padding: 5px 7px; vertical-align: top; }
  footer.doc { margin-top: 36px; padding-top: 8px; border-top: 1px solid #ddd; font-size: 8.5pt; color: #999; }
`;

export function documentToHtml(doc: GeneratedDocument, company: CompanyProfile): string {
  const sectionsHtml = doc.sections
    .map((section) => {
      const tableHtml = section.table
        ? `<table><thead><tr>${section.table.columns
            .map((c) => `<th>${escapeHtml(c)}</th>`)
            .join('')}</tr></thead><tbody>${section.table.rows
            .map((r) => `<tr>${r.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`)
            .join('')}</tbody></table>`
        : '';
      return `<h2>${escapeHtml(section.title)}</h2>\n${paragraphs(section.content)}\n${tableHtml}`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8"/>
<title>${escapeHtml(doc.title)}</title>
<style>${DOC_STYLES}</style>
</head>
<body>
<header class="doc">
  <div class="company">${escapeHtml(company.name)} — ${escapeHtml(company.address)}, ${escapeHtml(company.city)}</div>
  <h1>${escapeHtml(doc.title)}</h1>
  <div class="meta">${escapeHtml(DOCUMENT_TYPE_LABELS[doc.type])} — édité le ${formatDate(doc.updatedAt)}${doc.status === 'valide' ? ' — VALIDÉ' : doc.status === 'en_validation' ? ' — EN VALIDATION' : ' — BROUILLON'}</div>
</header>
${sectionsHtml}
<footer class="doc">${escapeHtml(company.name)} — document généré via MineGrid, à relire et adapter avant diffusion.</footer>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Word (.doc)
// ---------------------------------------------------------------------------

export function exportWord(doc: GeneratedDocument, company: CompanyProfile): void {
  const html = documentToHtml(doc, company);
  const blob = new Blob(['﻿', html], { type: 'application/msword;charset=utf-8' });
  triggerDownload(blob, `${sanitizeFileName(doc.title)}.doc`);
}

// ---------------------------------------------------------------------------
// PDF (impression navigateur)
// ---------------------------------------------------------------------------

export function exportPdf(doc: GeneratedDocument, company: CompanyProfile): boolean {
  const html = documentToHtml(doc, company);
  const win = window.open('', '_blank', 'width=900,height=700');
  if (!win) return false; // popup bloquée
  win.document.write(html);
  win.document.close();
  win.focus();
  // Laisse le temps au rendu avant d'ouvrir la boîte d'impression.
  setTimeout(() => win.print(), 400);
  return true;
}

// ---------------------------------------------------------------------------
// Excel (tableaux : BPU, DPGF, grilles)
// ---------------------------------------------------------------------------

export async function exportExcel(doc: GeneratedDocument): Promise<void> {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'MineGrid — Appels d\'offres';

  const tables = doc.sections.filter((sct) => sct.table);
  const sheetSections = tables.length > 0 ? tables : doc.sections;

  sheetSections.forEach((section, i) => {
    const rawName = section.title.replace(/[\\/*?:[\]]/g, ' ').slice(0, 28) || `Feuille ${i + 1}`;
    const sheet = workbook.addWorksheet(rawName);

    if (section.table) {
      sheet.addRow(section.table.columns);
      const headerRow = sheet.getRow(1);
      headerRow.font = { bold: true, color: { argb: 'FF9A3412' } };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFFF7ED' },
      };
      section.table.rows.forEach((r) => sheet.addRow(r));
      sheet.columns.forEach((col, idx) => {
        const header = section.table!.columns[idx] ?? '';
        const maxLen = Math.max(
          header.length,
          ...section.table!.rows.map((r) => (r[idx] ?? '').length),
        );
        col.width = Math.min(Math.max(maxLen + 2, 10), 60);
      });
    } else {
      // Section texte : une cellule par paragraphe (relecture hors ligne).
      sheet.getColumn(1).width = 110;
      section.content.split(/\n{2,}/).forEach((p) => {
        const row = sheet.addRow([p]);
        row.getCell(1).alignment = { wrapText: true, vertical: 'top' };
      });
    }
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  triggerDownload(blob, `${sanitizeFileName(doc.title)}.xlsx`);
}

// ---------------------------------------------------------------------------
// ZIP — dossier final d'un appel d'offres
// ---------------------------------------------------------------------------

export async function exportTenderZip(
  tender: Tender,
  documents: GeneratedDocument[],
  company: CompanyProfile,
): Promise<void> {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  const root = zip.folder(sanitizeFileName(tender.reference)) ?? zip;

  const readme =
    `DOSSIER DE RÉPONSE — ${tender.reference}\n` +
    `${tender.title}\n` +
    `Acheteur : ${tender.buyer}\n` +
    `Date limite de remise : ${formatDate(tender.deadline)}\n\n` +
    `Contenu du dossier (${documents.length} document(s)) :\n` +
    documents.map((d) => `  - ${d.title} [${d.status === 'valide' ? 'validé' : d.status}]`).join('\n') +
    `\n\nPièces exigées non couvertes :\n` +
    (tender.requiredDocuments
      .filter((rd) => !rd.available && !rd.generatedDocId)
      .map((rd) => `  - ${rd.label}`)
      .join('\n') || '  (aucune — dossier complet)') +
    `\n\nGénéré le ${formatDate(new Date().toISOString())} via MineGrid — Appels d'offres.`;
  root.file('LISEZ-MOI.txt', readme);

  const adminFolder = root.folder('1_Dossier_administratif');
  const techFolder = root.folder('2_Offre_technique');
  const finFolder = root.folder('3_Offre_financiere');

  const folderFor = (doc: GeneratedDocument) => {
    switch (doc.type) {
      case 'reponse_administrative':
      case 'pieces_manquantes':
        return adminFolder;
      case 'bpu':
      case 'dpgf':
        return finFolder;
      default:
        return techFolder;
    }
  };

  for (const doc of documents) {
    const html = documentToHtml(doc, company);
    const target = folderFor(doc) ?? root;
    target.file(`${sanitizeFileName(doc.title)}.doc`, '﻿' + html);

    // Les documents à tableaux partent aussi en .xlsx dans le ZIP.
    if (doc.sections.some((sct) => sct.table)) {
      const { default: ExcelJS } = await import('exceljs');
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Données');
      doc.sections
        .filter((sct) => sct.table)
        .forEach((sct) => {
          sheet.addRow([sct.title]).font = { bold: true };
          sheet.addRow(sct.table!.columns).font = { bold: true };
          sct.table!.rows.forEach((r) => sheet.addRow(r));
          sheet.addRow([]);
        });
      sheet.getColumn(1).width = 40;
      const buffer = await workbook.xlsx.writeBuffer();
      target.file(`${sanitizeFileName(doc.title)}.xlsx`, buffer);
    }
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  triggerDownload(blob, `${sanitizeFileName(tender.reference)}_dossier_final.zip`);
}
