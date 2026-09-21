/** Right-pane placeholder for /discussion with no group selected yet
 *  (desktop only — on mobile this route just shows the group list, per
 *  GroupsShell). */
export default function DiscussionPage() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 bg-slate-50 p-8 text-center dark:bg-slate-900/40">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-slate-100 text-4xl dark:bg-slate-800">
        👥
      </div>
      <h2 className="text-lg font-semibold text-slate-600 dark:text-slate-300">Group chats</h2>
      <p className="max-w-xs text-sm text-slate-400">
        Select a group from the list, or create a new one, to see it here.
      </p>
    </div>
  );
}
