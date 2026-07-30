import { initials, avatarColor, isOnline } from "@/lib/ui";

/**
 * Shows a user's uploaded photo when they have one, otherwise a coloured
 * initials badge. Used everywhere people are represented so avatars stay
 * consistent across the app.
 *
 * Pass `presence` (the user's lastSeenAt) to overlay a live online/offline dot
 * in the corner, the way chat apps show who is currently around.
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
  presence?: Date | string | null;
}) {
  const dimension = { width: size, height: size };
  const fontSize = Math.max(10, Math.round(size * 0.38));
  const showDot = presence !== undefined;
  const online = isOnline(presence);
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
        title={online ? "Active now" : "Offline"}
        style={{ width: dotSize, height: dotSize }}
        className={`absolute bottom-0 right-0 rounded-full ring-2 ring-white dark:ring-slate-800 ${
          online ? "bg-green-500" : "bg-slate-300 dark:bg-slate-600"
        }`}
      />
    </span>
  );
}
