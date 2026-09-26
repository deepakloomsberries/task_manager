import { db } from "@/lib/db";
import { isUnlocked } from "@/lib/publicAccess";

/** A live, unlocked bundle with the files still in it (not binned). Null otherwise. */
export async function openBundle(token: string) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return { bundle: null, locked: false };
  const bundle = await db.fileBundle.findFirst({
    where: { token, disabled: false },
    include: {
      createdBy: { select: { name: true } },
      items: { include: { attachment: true }, where: { attachment: { deletedAt: null } } },
    },
  });
  if (!bundle || (bundle.expiresAt && bundle.expiresAt <= new Date())) return { bundle: null, locked: false };
  const locked = !(await isUnlocked("b", token, bundle.passwordHash));
  return { bundle, locked };
}
