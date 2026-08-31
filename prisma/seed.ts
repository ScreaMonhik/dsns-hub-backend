import { PrismaClient } from '@prisma/client';
import * as fs from 'node:fs';
import * as path from 'node:path';

const prisma = new PrismaClient();

interface FlatDepartment {
  id: string;
  pid: string | null;
  label: string;
}

async function main() {
  const filePath = path.join(__dirname, 'org_structure.json');
  if (!fs.existsSync(filePath)) {
    console.error('Error: org_structure.json file not found in prisma/ directory.');
    return;
  }

  const rawData = fs.readFileSync(filePath, 'utf-8');
  const parsed = JSON.parse(rawData) as { flat?: FlatDepartment[] } | FlatDepartment[];
  const rawItems: FlatDepartment[] = Array.isArray(parsed) ? parsed : (parsed.flat || []);

  console.log(`Original record count from JSON: ${rawItems.length}`);

  // 1. Build map for O(1) lookups
  const itemMap = new Map<string, FlatDepartment>();
  rawItems.forEach((item) => itemMap.set(item.id, item));

  // 2. Topological sort to respect Foreign Key constraints (parents before children)
  const sorted: FlatDepartment[] = [];
  const visited = new Set<string>();

  function visit(item: FlatDepartment) {
    if (visited.has(item.id)) return;
    
    // Prevent self-referencing and ensure parent exists in dataset
    if (item.pid && item.pid !== item.id && itemMap.has(item.pid)) {
      const parent = itemMap.get(item.pid);
      if (parent) visit(parent);
    }
    
    visited.add(item.id);
    sorted.push(item);
  }

  rawItems.forEach((item) => visit(item));

  // 3. Reset relationships and clean table
  console.log('Unlinking users from existing departments...');
  await prisma.user.updateMany({
    data: { departmentId: null },
  });

  console.log('Cleaning existing department database table...');
  await prisma.department.deleteMany();

  // 4. Seed 1:1 exact structure
  console.log(`Seeding EXACT organizational structure (${sorted.length} records)...`);
  
  for (const item of sorted) {
    const parentId = item.pid && item.pid !== item.id && itemMap.has(item.pid) ? item.pid : null;

    await prisma.department.create({
      data: {
        id: item.id,
        name: item.label || 'Без назви',
        parentId,
      },
    });
  }

  console.log('Exact Org structure successfully seeded to database!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });