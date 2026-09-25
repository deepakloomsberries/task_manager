import { initials, avatarColor } from "@/lib/ui";
import { PRESENCE, presenceLabel, resolvePresence, type PresenceInput } from "@/lib/presence";

/**
 * Shows a user's uploaded photo when they have one, otherwise a coloured
 * initials badge. Used everywhere people are represented so avatars stay
 * consistent across the app.
 *
 * Pass `presence` to overlay a Teams-style status dot in the corner: either the
 * user row itself (lastSeenAt + chosen status, see lib/presence) or just a
 * lastSeenAt date.
 */
export default function UserAvatar({
  user,
  size = 36,
  className = "",
  presence,
}: {
  user: { id: number; name: string; avatarPath?: string | null };
  size?: number;
  className?: string;
  presence?: Date | string | null | PresenceInput;
}) {
  const dimension = { width: size, height: size };
  const fontSize = Math.max(10, Math.round(size * 0.38));
  const showDot = presence !== undefined;
  const input: PresenceInput =
    presence && typeof presence === "object" && !(presence instanceof Date) ? presence : { lastSeenAt: presence ?? null };
  const status = resolvePresence(input);
  const dotSize = Math.max(8, Math.round(size * 0.28));

  const inner = user.avatarPath ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/api/avatar/${user.id}?v=${encodeURIComponent(user.avatarPath)}`}
      alt={user.name}
      style={dimension}
      className={`shrink-0 rounded-full object-cover ${className}`}
    />
  ) : (
    <span
      title={user.name}
      style={{ ...dimension, fontSize }}
      className={`flex shrink-0 items-center justify-center rounded-full font-semibold text-white ${avatarColor(user.name)} ${className}`}
    >
      {initials(user.name)}
    </span>
  );

  if (!showDot) return inner;

  return (
    <span className="relative inline-flex shrink-0" style={dimension}>
      {inner}
      <span
        title={presenceLabel(input)}
        style={{ width: dotSize, height: dotSize }}
        className={`absolute bottom-0 right-0 flex items-center justify-center rounded-full ring-2 ring-white dark:ring-slate-800 ${PRESENCE[status.key].dot}`}
      >
        {status.key === "DND" && <span className="h-[2px] w-1/2 rounded bg-white" />}
      </span>
    </span>
  );
}
