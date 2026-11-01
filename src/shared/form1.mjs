// Content-control candidate based on WA Schedule 4 Form 1.
// Final legal/form-layout approval is an explicit release gate, not implied by this dataset.
export const FORM1_VERSION = 'wa-form1-gov-3e39e234-2026-11-01';
export const FORM1_SOURCE = 'https://www.consumerprotection.wa.gov.au/publications/property-condition-report-form-1';
// Transcribed from the pinned official document; comparison is automated.
export const FORM1_SECTIONS = Object.freeze([
  [
    "ENTRY",
    [
      "front door",
      "screen door/security door",
      "walls/picture hooks",
      "windows/screens",
      "ceiling",
      "light fittings",
      "blinds/curtains",
      "power points",
      "floorcoverings"
    ]
  ],
  [
    "LOUNGE ROOM",
    [
      "doors/doorway frames",
      "walls/picture hooks",
      "windows/screens",
      "ceiling",
      "light fittings",
      "blinds/curtains",
      "TV/power points",
      "floorcoverings"
    ]
  ],
  [
    "DINING ROOM",
    [
      "doors/doorway frames",
      "walls/picture hooks",
      "windows/screens",
      "ceiling",
      "light fittings",
      "blinds/curtains",
      "power points",
      "floorcoverings"
    ]
  ],
  [
    "KITCHEN",
    [
      "Doors/doorway frames",
      "walls/picture hooks",
      "windows/screens",
      "ceiling",
      "light fittings",
      "blinds/curtains",
      "power points",
      "floorcoverings",
      "cupboards/drawers",
      "bench tops/tiling",
      "sink/taps",
      "stove top/hot plates",
      "oven/griller",
      "exhaust fan/range hood"
    ]
  ],
  [
    "EACH BEDROOM",
    [
      "doors/doorway frames",
      "walls/picture hooks",
      "windows/screens",
      "ceiling",
      "light fittings",
      "blinds/curtains",
      "power points",
      "floorcoverings"
    ]
  ],
  [
    "EACH BATHROOM",
    [
      "doors/doorway frames",
      "walls/tiles",
      "windows/screens",
      "ceiling",
      "light fittings",
      "blinds/curtains",
      "power points",
      "floorcoverings",
      "bath/taps",
      "shower/screen/taps",
      "wash basin/taps",
      "mirror/cabinet/vanity",
      "towel rails",
      "toilet/cistern/seat",
      "toilet roll holder",
      "heating/exhaust fan/vent"
    ]
  ],
  [
    "LAUNDRY",
    [
      "doors/doorway frames",
      "walls/tiles",
      "windows/screens",
      "ceiling",
      "light fittings",
      "blinds/curtains",
      "power points",
      "floorcoverings",
      "washing machine taps",
      "exhaust fan/vent",
      "washing tub"
    ]
  ],
  [
    "SECURITY/ SAFETY",
    [
      "smoke alarms",
      "electrical safety switch",
      "keys/other opening devices"
    ]
  ],
  [
    "GENERAL",
    [
      "garden",
      "lawn/edges",
      "letterbox/street number",
      "water tanks/septic tanks",
      "garbage bins",
      "paving/driveways",
      "clothesline",
      "garage/carport/storeroom",
      "garden shed",
      "hot water system",
      "gutters/downpipes"
    ]
  ]
]);
export const FORM1_COLUMNS = Object.freeze(['Clean', 'Undamaged', 'Working', 'Tenant agrees', 'Comments']);
export const FORM1_WORK_FIELDS = Object.freeze(['paintingPremisesExternalDate', 'paintingPremisesInternalDate', 'floorcoveringsLaidDate', 'floorcoveringsCleanedDate']);
const key = (s, i) => `wa-form1:${s + 1}:${i + 1}`;
export function mandatoryAreas() {
    return FORM1_SECTIONS.map(([name, items], s) => ({ id: crypto.randomUUID(), name, statutorySection: s + 1, items: items.map((name, i) => ({ id: crypto.randomUUID(), name, statutoryKey: key(s, i), clean: null, undamaged: null, working: null, tenantAgrees: null, agentComments: '', tenantComments: '' })) }));
}
export function seedForm1(report) {
    const result = structuredClone(report);
    result.details = { ...result.details, reportType: 'Entry', waFormVersion: FORM1_VERSION, formName: 'Property Condition Report', formNumber: 'FORM 1', actNotice: 'RESIDENTIAL TENANCIES ACT 1987 (WA) Section 27C(6)', tenantReceivedDate: result.details?.tenantReceivedDate || '', reportReturnDate: result.details?.reportReturnDate || '' };
    for (const field of FORM1_WORK_FIELDS)
        result.details[field] = result.details[field] || '';
    result.areas = [...mandatoryAreas(), ...(result.areas || []).filter(area => !area.statutorySection)];
    return result;
}
export function form1Issues(report) {
    if (report.details?.reportType !== 'Entry')
        return [];
    const issues = [];
    if (report.details.waFormVersion !== FORM1_VERSION)
        issues.push('The WA Form 1 content version is missing or out of date.');
    if (report.details.formName !== 'Property Condition Report')
        issues.push('The prescribed property condition report title must be retained.');
    if (report.details.actNotice !== 'RESIDENTIAL TENANCIES ACT 1987 (WA) Section 27C(6)')
        issues.push('The prescribed statutory reference must be retained.');
    if (report.details.formNumber !== 'FORM 1')
        issues.push('The prescribed Form 1 title must be retained.');
    const occurrences = new Map();
    for (const area of report.areas || [])
        for (const item of area.items || [])
            if (item.statutoryKey) {
                const matches = occurrences.get(item.statutoryKey) || [];
                matches.push({ area, item });
                occurrences.set(item.statutoryKey, matches);
            }
    FORM1_SECTIONS.forEach(([name, items], s) => items.forEach((label, i) => {
        const found = occurrences.get(key(s, i)) || [];
        if (found.length !== 1) {
            issues.push(`Prescribed item must appear exactly once: ${name} / ${label}.`);
            return;
        }
        const { area, item } = found[0];
        if (area.name !== name || area.statutorySection !== s + 1 || item.name !== label)
            issues.push(`A prescribed heading or item was changed: ${name} / ${label}.`);
        for (const field of ['clean', 'undamaged', 'working', 'tenantAgrees'])
            if (!Object.hasOwn(item, field) || ![null, true, false].includes(item[field]))
                issues.push(`Missing or invalid prescribed response field: ${name} / ${label} / ${field}.`);
        for (const field of ['agentComments', 'tenantComments'])
            if (typeof item[field] !== 'string')
                issues.push(`A prescribed comments field is missing: ${name} / ${label}.`);
    }));
    for (const field of FORM1_WORK_FIELDS)
        if (typeof report.details[field] !== 'string')
            issues.push(`Prescribed work-date field is missing: ${field}.`);
    return issues;
}
export function mergeAdditionalAreas(report, importedAreas) {
    if (!Array.isArray(importedAreas)) throw new Error('Imported areas must be an array.');
    const copy = structuredClone(report), normalize = s => String(s || '').trim().toLocaleLowerCase('en-AU');
    copy.areas ||= [];
    for (const source of importedAreas) {
        const name = String(source.name || '').trim();
        if (!name || !Array.isArray(source.items)) throw new Error('Every imported area needs a name and item list.');
        let area = copy.areas.find(a => normalize(a.name) === normalize(name));
        if (!area) { area = {id:crypto.randomUUID(),name,items:[]};copy.areas.push(area); }
        for (const sourceItem of source.items) {
            const itemName = String(sourceItem.name || '').trim();
            if (!itemName) throw new Error('An imported item has no name.');
            let item = area.items.find(i => normalize(i.name) === normalize(itemName));
            if (!item) { item={id:crypto.randomUUID(),name:itemName,agentComments:'',tenantComments:''};area.items.push(item); }
            // Identity, statutory keys and required labels can never be replaced by a CSV.
            for (const field of ['agentComments','tenantComments','actionComments','maintenanceCommentary'])
                if (typeof sourceItem[field] === 'string') item[field]=sourceItem[field];
            for (const field of ['clean','undamaged','working','tenantAgrees','maintenanceRequired'])
                if (Object.hasOwn(sourceItem,field) && [null,true,false].includes(sourceItem[field])) item[field]=sourceItem[field];
        }
    }
    const issues=form1Issues(copy);if(issues.length)throw new Error(issues[0]);
    return copy;
}
