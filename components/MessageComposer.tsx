"use client";

import { useRef } from "react";
import { sendDirectMessage } from "@/lib/actions/messages";

export default function MessageComposer({
  recipientId,
  recipientName,
}: {
  recipientId: number;
  recipientName: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  return (
    <form
      action={sendDirectMessage}
      onSubmit={() => {
        // Clear the box optimistically; the server action reloads the thread.
        setTimeout(() => {
          if (ref.current) ref.current.value = "";
        }, 0);
      }}
      className="card flex gap-3 p-4"
    >
      <input type="hidden" name="recipientId" value={recipientId} />
      <textarea
        ref={ref}
        name="body"
        rows={2}
        required
        maxLength={4000}
        placeholder={`Message ${recipientName.split(" ")[0]}…`}
        className="input flex-1"
      />
      <button type="submit" className="btn-primary self-end">
        Send
      </button>
    </form>
  );
}
