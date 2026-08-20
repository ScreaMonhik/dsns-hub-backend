import { PrismaClient } from '@prisma/client';
import * as fs from 'node:fs';
import * as path from 'node:path';

const prisma = new PrismaClient();

interface FlatDepartment {
  id: string;
  pid: string | null;
  label: string;
  hasChildren: boolean;
  hasAccess: number;
}

// Regex patterns for technical garbage or deleted records
const GARBAGE_PATTERNS = [
  /ТЕСТ/i,
  /TEST/i,
  /АРХІВ/i,
  /ВИДАЛЕН/i,
  /DELETE/i,
  /НЕ ВИКОРИСТОВУЄТЬСЯ/i,
  /ДУБЛЬ/i,
  /ТЕМП/i,
  /TEMP/i,
  /^\s*$/,
];

// Cyrillic-safe patterns WITHOUT ASCII-only '\b' boundaries
const INTERNAL_OFFICE_PATTERNS = [
  /відділ/i,
  /відділення/i,
  /сектор/i,
  /апарат/i,
  /бухгалтер/i,
  /канцеляр/i,
  /секретар/i,
  /юрист/i,
  /юридичн/i,
  /прес-служб/i,
  /штаб/i,
  /група/i,
  /лаборатор/i,
  /служба\s+забезпечення/i,
];

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isExcludedDepartment(label: string, hasAccess: number): boolean {
  if (hasAccess !== 1) return true;

  const trimmed = label.trim();

  if (GARBAGE_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    return true;
  }

  if (INTERNAL_OFFICE_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    return true;
  }

  // Filter out non-main "Управління" (keep "Головне управління" and "ГУ")
  const lower = trimmed.toLowerCase();
  if (lower.includes('управління') || lower.includes('управлiння')) {
    const isMain =
      lower.includes('головне') ||
      lower.includes(' гу ') ||
      lower.startsWith('гу ') ||
      lower.endsWith(' гу') ||
      lower === 'гу';

    if (!isMain) {
      return true;
    }
  }

  return false;
}

function normalizeLabel(rawLabel: string, parentLabel?: string): string {
  let label = rawLabel.trim();

  // 1. Remove tech indices in brackets at the end, like "(09)", "( 12 )"
  label = label.replace(/\s*\([\d\s,-]+\)\s*$/g, '');

  // 2. Strip quotes and № symbol
  label = label.replace(/["'«»]/g, '').replace(/№\s*/g, '');

  // 3. Unify hyphens/dashes between numbers and unit acronyms (e.g. "1-ДПРЗ" -> "1 ДПРЗ")
  label = label.replace(/(\d+)\s*[-–—]\s*([А-ЯІЇЄҐа-яіїєґ]+)/gi, '$1 $2');
  label = label.replace(/([А-ЯІЇЄҐа-яіїєґ]+)\s*[-–—]\s*(\d+)/gi, '$1 $2');

  // 4. Strip parent label text if child explicitly repeats its parent full name
  if (parentLabel && parentLabel.trim().length > 0) {
    const cleanParent = parentLabel.replace(/["'«»]/g, '').trim();
    if (label.toLowerCase().includes(cleanParent.toLowerCase())) {
      const reg = new RegExp(escapeRegExp(cleanParent), 'gi');
      label = label.replace(reg, '');
    }
  }

  // 5. Strip redundant regional management mentions from sub-unit labels
  if (parentLabel) {
    label = label.replace(
      /\s*(ГУ|ГОЛОВН(Е|ОГО)\s+УПРАВЛІНН(Я|Ю))\s+ДСНС(\s+УКРАЇНИ)?(\s+(У|В)\s+[А-ЯІЇЄҐ\s-]+ОБЛАСТ(І|Я))?/gi,
      '',
    );
    label = label.replace(/\s*ДСНС\s+УКРАЇНИ/gi, '');
  }

  // 6. Clean up orphan punctuation, double spaces, and trailing symbols
  label = label
    .replace(/^[\s,-]+|[\s,-]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return label.length > 0 ? label : rawLabel.trim();
}

async function main() {
  const filePath = path.join(__dirname, 'org_structure.json');
  if (!fs.existsSync(filePath)) {
    console.error('Error: org_structure.json file not found in prisma/ directory.');
    return;
  }

  const rawData = fs.readFileSync(filePath, 'utf-8');
  const parsed = JSON.parse(rawData);
  const rawItems: FlatDepartment[] = parsed.flat || parsed;

  console.log(`Original record count: ${rawItems.length}`);

  // Step 1: Build initial parent lookup map for context-aware normalization
  const rawItemMap = new Map<string, FlatDepartment>();
  rawItems.forEach((item) => rawItemMap.set(item.id, item));

  // Step 2: Filter out internal offices & garbage, normalize valid operational labels
  const sanitizedItems: FlatDepartment[] = [];
  const validIds = new Set<string>();

  for (const item of rawItems) {
    const parent = item.pid ? rawItemMap.get(item.pid) : undefined;
    const parentLabel = parent?.label;
    const cleanedText = normalizeLabel(item.label, parentLabel);

    if (!isExcludedDepartment(cleanedText, item.hasAccess)) {
      sanitizedItems.push({
        ...item,
        label: cleanedText,
      });
      validIds.add(item.id);
    }
  }

  // Helper to re-parent operational units if their intermediate administrative parent was filtered out
  function getNearestValidParentId(pid: string | null): string | null {
    let currentPid = pid;
    while (currentPid && currentPid !== '00000000-0000-0000-0000-000000000000') {
      if (validIds.has(currentPid)) {
        return currentPid;
      }
      const parent = rawItemMap.get(currentPid);
      currentPid = parent ? parent.pid : null;
    }
    return null;
  }

  // Step 3: Re-parent operational units to valid higher-level ancestors
  const validTreeItems = sanitizedItems.map((item) => {
    const resolvedPid = getNearestValidParentId(item.pid);
    return {
      ...item,
      pid: resolvedPid,
    };
  });

  // Step 3: Deduplicate entries having identical label under the same parent
  const uniqueItemsMap = new Map<string, FlatDepartment>();
  for (const item of validTreeItems) {
    const compositeKey = `${item.pid || 'root'}_${item.label.toLowerCase()}`;
    if (!uniqueItemsMap.has(compositeKey)) {
      uniqueItemsMap.set(compositeKey, item);
    }
  }

  const finalItems = Array.from(uniqueItemsMap.values());
  console.log(`Sanitized clean record count: ${finalItems.length} (Removed ${rawItems.length - finalItems.length} garbage/duplicate records)`);

  // Step 4: Map dependencies and topological sort to respect foreign keys
  const itemMap = new Map<string, FlatDepartment>();
  finalItems.forEach((item) => itemMap.set(item.id, item));

  const sorted: FlatDepartment[] = [];
  const visited = new Set<string>();

  function visit(item: FlatDepartment) {
    if (visited.has(item.id)) return;
    if (item.pid && itemMap.has(item.pid)) {
      const parent = itemMap.get(item.pid);
      if (parent) visit(parent);
    }
    visited.add(item.id);
    sorted.push(item);
  }

  finalItems.forEach((item) => visit(item));

  // Step 5: Unlink users first to avoid Foreign Key constraint violations
  console.log('Unlinking users from existing departments...');
  await prisma.user.updateMany({
    data: { departmentId: null },
  });

  console.log('Cleaning existing department database table...');
  await prisma.department.deleteMany();

  console.log('Seeding clean organization structure...');
  for (const item of sorted) {
    const parentId =
      item.pid && item.pid !== item.id && itemMap.has(item.pid)
        ? item.pid
        : null;

    await prisma.department.create({
      data: {
        id: item.id,
        name: item.label,
        parentId,
      },
    });
  }

  console.log('Sanitized Org structure successfully seeded to database!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });