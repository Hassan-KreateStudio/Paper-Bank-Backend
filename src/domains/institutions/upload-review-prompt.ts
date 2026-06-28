import type { Institution } from "./contracts";

const STRATHMORE_UPLOAD_REVIEW_PROMPT = `
Target institution: Strathmore University

You are checking whether this document appears to be an official Strathmore University assessment document.

Institution guidance:
1. Strathmore University has multiple schools, faculties, centres, institutes, departments, and academic programmes.
2. Do not assume the document must come from only one school such as the School of Computing and Engineering Sciences.
3. Do not assume the document must come from only one programme such as Bachelor of Business Information Technology.
4. Do not assume unit codes follow only one prefix or pattern.
5. Your task is to judge whether the document appears to belong to Strathmore University as an academic assessment document across the institution.

Signals that support authenticity may include:
- Strathmore or Strathmore University in the header
- a formal university header or institutional layout
- school, faculty, department, institute, centre, or programme naming
- course or unit code
- course or unit title
- CAT, exam, test, assessment, continuous assessment, or examination wording
- date
- time
- duration
- explicit mark allocations
- question numbering
- page numbering
- a formal instructions section
- a layout that resembles a real university assessment paper

Scan-quality guidance:
- The document may be scanned, photographed, folded, shadowed, skewed, cropped, low-contrast, or printed on colored paper.
- Do not reject the document purely because of poor scan or photo quality.
- If institutional and assessment patterns are still visible, prefer review over rejection.

Your task:
- determine whether the document appears to be a Strathmore assessment document
- identify whether it looks like an academic assessment paper rather than an unrelated document
- extract visible academic metadata when available
- rely on visible institutional and assessment signals, not assumptions
- be cautious about rejection when the document appears messy but still plausibly authentic

Decision guidance:
- accept when the document strongly appears to be an authentic Strathmore CAT or exam paper
- review when it likely belongs to Strathmore but some details are unclear, incomplete, or visually messy
- reject when it does not appear to be a Strathmore assessment document at all
`.trim();

export const getInstitutionUploadReviewPrompt = (institution: Pick<Institution, "id" | "slug">) => {
  if (institution.id === "inst_strathmore" || institution.slug === "strathmore") {
    return STRATHMORE_UPLOAD_REVIEW_PROMPT;
  }

  return null;
};

