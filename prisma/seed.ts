import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

async function main() {
  const companies = [
    { name: "Looms & Berries India", code: "IND" },
    { name: "Looms & Berries UAE", code: "UAE" },
    { name: "Looms & Berries Saudi Arabia", code: "KSA" },
  ];

  for (const c of companies) {
    await db.company.upsert({
      where: { code: c.code },
      create: c,
      update: { name: c.name },
    });
  }

  const india = await db.company.findUniqueOrThrow({ where: { code: "IND" } });

  const adminEmail = process.env.ADMIN_EMAIL ?? "sales@loomsberries.com";
  const adminPassword = process.env.ADMIN_PASSWORD ?? "Admin@12345";

  const existing = await db.user.findUnique({ where: { email: adminEmail } });
  if (!existing) {
    await db.user.create({
      data: {
        name: "Administrator",
        email: adminEmail,
        passwordHash: await bcrypt.hash(adminPassword, 10),
        role: "ADMIN",
        companyId: india.id,
        mustChangePassword: true,
      },
    });
    console.log(`Created admin user ${adminEmail} (password: ${adminPassword})`);
  } else {
    console.log(`Admin user ${adminEmail} already exists — skipping.`);
  }
}

main()
  .then(() => db.$disconnect())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
