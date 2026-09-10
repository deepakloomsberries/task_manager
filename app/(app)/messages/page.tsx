/** Right-pane placeholder for /messages with no conversation selected yet
 *  (desktop only — on mobile this route just shows the chat list, per
 *  MessagesShell). */
export default function MessagesPage() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 bg-slate-50 p-8 text-center dark:bg-slate-900/40">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-slate-100 text-4xl dark:bg-slate-800">
        💬
      </div>
      <h2 className="text-lg font-semibold text-slate-600 dark:text-slate-300">Your messages</h2>
      <p className="max-w-xs text-sm text-slate-400">
        Select a conversation from the list, or start a new one, to see it here.
      </p>
    </div>
  );
}
