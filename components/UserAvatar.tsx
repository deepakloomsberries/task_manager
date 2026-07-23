import { initials, avatarColor } from "@/lib/ui";

/**
 * Shows a user's uploaded photo when they have one, otherwise a coloured
 * initials badge. Used everywhere people are represented so avatars stay
 * consistent across the app.
 */
export default function UserAvatar({
  user,
  size = 36,
  className = "",
}: {
  user: { id: number; name: string; avatarPath?: string | null };
  size?: number;
  className?: string;
}) {
  const dimension = { width: size, height: size };
  const fontSize = Math.max(10, Math.round(size * 0.38));

  if (user.avatarPath) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`/api/avatar/${user.id}?v=${encodeURIComponent(user.avatarPath)}`}
        alt={user.name}
        style={dimension}
        className={`shrink-0 rounded-full object-cover ${className}`}
      />
    );
  }

  return (
    <span
      title={user.name}
      style={{ ...dimension, fontSize }}
      className={`flex shrink-0 items-center justify-center rounded-full font-semibold text-white ${avatarColor(user.name)} ${className}`}
    >
      {initials(user.name)}
    </span>
  );
}
