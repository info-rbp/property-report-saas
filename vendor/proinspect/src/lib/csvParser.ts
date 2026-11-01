import { InspectionArea, InspectionItem } from '../types/report';

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"' && quoted && next === '"') {
      field += '"';
      i++;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      row.push(field);
      field = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') i++;
      row.push(field);
      if (row.some((value) => value.trim() !== '')) rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }

  row.push(field);
  if (row.some((value) => value.trim() !== '')) rows.push(row);
  return rows;
}

function parseBool(value: string | undefined): boolean | null {
  if (!value?.trim()) return null;
  const normalized = value.trim().toLowerCase();
  if (['yes', 'y', 'true', '1', 'x', 'tick'].includes(normalized)) return true;
  if (['no', 'n', 'false', '0'].includes(normalized)) return false;
  return null;
}

export function parseCsvText(text: string): { areas: InspectionArea[] } {
  const rows = parseCsv(text.replace(/^\uFEFF/, ''));
  if (rows.length < 2) {
    throw new Error('CSV must contain a header row and at least one data row.');
  }

  const header = rows[0].map((value) => value.trim().toLowerCase());
  const find = (...terms: string[]) => header.findIndex((value) => terms.some((term) => value.includes(term)));
  const areaColumn = find('area', 'room');
  const itemColumn = find('item', 'element', 'fixture');
  const commentsColumn = find('comment', 'notes', 'remark');
  const cleanColumn = find('clean', 'cln');
  const undamagedColumn = find('undamaged', 'udg');
  const workingColumn = find('working', 'wkg');

  if (areaColumn < 0 || itemColumn < 0 || commentsColumn < 0) {
    throw new Error('CSV must include Area, Item and Agent Comments columns.');
  }

  const areas = new Map<string, InspectionArea>();
  let currentArea = 'General';

  for (let index = 1; index < rows.length; index++) {
    const row = rows[index];
    const areaValue = (row[areaColumn] || '').trim();
    if (areaValue) currentArea = areaValue;
    const itemName = (row[itemColumn] || '').trim();
    if (!itemName) continue;

    if (!areas.has(currentArea)) {
      areas.set(currentArea, {
        id: `area-${crypto.randomUUID()}`,
        name: currentArea,
        items: [],
      });
    }

    const item: InspectionItem = {
      id: `item-${crypto.randomUUID()}`,
      name: itemName,
      clean: cleanColumn >= 0 ? parseBool(row[cleanColumn]) : null,
      undamaged: undamagedColumn >= 0 ? parseBool(row[undamagedColumn]) : null,
      working: workingColumn >= 0 ? parseBool(row[workingColumn]) : null,
      agentComments: (row[commentsColumn] || '').trim(),
    };
    areas.get(currentArea)!.items.push(item);
  }

  if (areas.size === 0) {
    throw new Error('No report items were found in the CSV.');
  }

  return { areas: Array.from(areas.values()) };
}

export async function parseCsvFile(file: File): Promise<{ areas: InspectionArea[] }> {
  if (!file.name.toLowerCase().endsWith('.csv')) {
    throw new Error('Please select a CSV file.');
  }
  return parseCsvText(await file.text());
}

export function generateStarterCsv(): string {
  const rows = [
    ['Area', 'Item', 'Clean (Y/N)', 'Undamaged (Y/N)', 'Working (Y/N)', 'Agent Comments'],
    ['Entry', 'Doors / walls / ceiling', 'Y', 'Y', 'Y', 'Clean and intact.'],
    ['Entry', 'Floor / floor coverings', 'Y', 'Y', '', 'Flooring clean and in good condition.'],
    ['Kitchen', 'Cupboards / drawers', 'Y', 'Y', 'Y', 'Clean, intact and working.'],
    ['Kitchen', 'Oven / griller', '', 'Y', '', 'Oven intact; operation not tested.'],
    ['Bedroom 1', 'Walls', 'Y', 'Y', '', 'Minor marks noted to western wall.'],
  ];

  return rows
    .map((row) => row.map((value) => `"${value.replace(/"/g, '""')}"`).join(','))
    .join('\n');
}

export function downloadStarterCsv(): void {
  const blob = new Blob([generateStarterCsv()], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'proinspect_report_commentary_template.csv';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
