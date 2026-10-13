import { prisma, type Prisma } from "@mimitales/database";
import { CHARACTERS, WORLDS } from "@mimitales/story-engine";

const toJson = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonObject;

async function main() {
  for (const c of CHARACTERS) {
    const data = { name: c.name, config: toJson(c), isActive: true };
    await prisma.character.upsert({
      where: { slug: c.slug },
      create: { slug: c.slug, ...data },
      update: data,
    });
  }
  // Anything removed from the code is switched off, not deleted (stories may reference it).
  await prisma.character.updateMany({
    where: { slug: { notIn: CHARACTERS.map((c) => c.slug) } },
    data: { isActive: false },
  });

  for (const w of WORLDS) {
    const data = { name: w.name, config: toJson(w), isActive: true };
    await prisma.storyWorld.upsert({
      where: { slug: w.slug },
      create: { slug: w.slug, ...data },
      update: data,
    });
  }
  await prisma.storyWorld.updateMany({
    where: { slug: { notIn: WORLDS.map((w) => w.slug) } },
    data: { isActive: false },
  });

  console.log(`Seeded ${CHARACTERS.length} characters and ${WORLDS.length} worlds`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err instanceof Error ? err.message : err);
    await prisma.$disconnect();
    process.exit(1);
  });