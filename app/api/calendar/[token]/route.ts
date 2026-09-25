import { feedFor } from "@/lib/calendarFeed";

export const dynamic = "force-dynamic";

/**
 * Personal calendar feed (iCalendar) that Google Calendar, Outlook or Apple
 * Calendar subscribe to. The secret token in the URL is the only credential —
 * calendar apps can't sign in — so it's long, random and can be reset from
 * Settings. Unknown or reset tokens get a plain 404.
 */
export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const body = await feedFor(params.token.replace(/\.ics$/, ""));
  if (!body) return new Response("Not found", { status: 404 });
  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="looms-berries-tasks.ics"',
      "Cache-Control": "private, max-age=300",
    },
  });
}
