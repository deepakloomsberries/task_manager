"use client";

import { useState } from "react";
import { createTask } from "@/lib/actions/tasks";
import { draftTaskFromCompose } from "@/lib/actions/ai";
import type { TaskDraft } from "@/lib/ai";
import SearchSelect from "@/components/SearchSelect";
import DatePicker from "@/components/DatePicker";
import { TASK_PRIORITIES } from "@/lib/ui";

type PastedImage = { file: File; previewUrl: string };

/**
 * "Create a task with AI": paste an email, chat message, or a screenshot and
 * Gemini drafts a title/description/priority/due date from it. The draft is
 * always shown as an editable form before anything is saved — nothing is
 * created until the person reviews it and clicks "Create task".
 */
export default function AiTaskCompose({
  users,
  projects,
  currentUserId,
}: {
  users: { id: number; name: string; jobTitle: string | null }[];
  projects: { id: number; name: string }[];
  currentUserId: number;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [image, setImage] = useState<PastedImage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<TaskDraft | null>(null);
  const [draftVersion, setDraftVersion] = useState(0);

  function clearImage() {
    if (image) URL.revokeObjectURL(image.previewUrl);
    setImage(null);
  }

  function reset() {
    setText("");
    clearImage();
    setDraft(null);
    setError(null);
  }

  function onPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const items = e.clipboardData?.items;
    if (!items) return;
    // Copying from Excel/Sheets/email puts both an image and text on the
    // clipboard — if there's real text, let it paste normally as text.
    const pastedText = e.clipboardData?.getData("text/plain");
    if (pastedText && pastedText.trim()) return;
    for (const item of Array.from(items)) {
      if (item.kind === "file" && item.type.startsWith("image/")) {
        const blob = item.getAsFile();
        if (blob) {
          e.preventDefault();
          clearImage();
          setImage({ file: blob, previewUrl: URL.createObjectURL(blob) });
        }
        return;
      }
    }
  }

  async function onDraft() {
    if (!text.trim() && !image) return;
    setLoading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("text", text.trim());
      if (image) fd.append("image", image.file);
      const result = await draftTaskFromCompose(fd);
      if (result.ok) {
        setDraft(result.draft);
        setDraftVersion((v) => v + 1);
      } else {
        setError(result.error);
      }
    } catch {
      setError("Something went wrong — please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn-secondary shrink-0 whitespace-nowrap">
        ✨ New task with AI
      </button>
    );
  }

  return (
    <div className="card w-full p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-semibold">✨ Create a task with AI</h2>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            reset();
          }}
          className="text-sm text-slate-400 hover:text-slate-600"
        >
          Close
        </button>
      </div>

      {!draft ? (
        <>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onPaste={onPaste}
            rows={4}
            placeholder="Paste an email, chat message, or a screenshot (Ctrl/Cmd+V works for images too)…"
            className="input w-full"
          />
          {image && (
            <div className="mt-2 flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={image.previewUrl}
                alt="Pasted screenshot"
                className="h-16 w-16 rounded-md border border-slate-200 object-cover"
              />
              <button type="button" onClick={clearImage} className="text-xs text-slate-400 hover:text-red-600">
                Remove image
              </button>
            </div>
          )}
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={() => void onDraft()}
              disabled={loading || (!text.trim() && !image)}
              className="btn-primary disabled:cursor-not-allowed disabled:opacity-40"
            >
              {loading ? "Drafting…" : "Draft with AI"}
            </button>
          </div>
        </>
      ) : (
        <form action={createTask} className="grid gap-4 md:grid-cols-2">
          <p className="text-xs text-slate-400 md:col-span-2">Review and edit before creating — nothing is saved yet.</p>
          <div className="md:col-span-2">
            <label className="label">Title *</label>
            <input key={draftVersion} name="title" required defaultValue={draft.title} className="input" />
          </div>
          <div className="md:col-span-2">
            <label className="label">Description</label>
            <textarea key={draftVersion} name="description" rows={3} defaultValue={draft.description} className="input" />
          </div>
          <div>
            <label className="label">Project</label>
            <SearchSelect
              key={draftVersion}
              name="projectId"
              placeholder="— None —"
              searchPlaceholder="Search projects…"
              options={[{ value: "", label: "— None —" }, ...projects.map((p) => ({ value: String(p.id), label: p.name }))]}
            />
          </div>
          <div>
            <label className="label">Assignee</label>
            <SearchSelect
              key={draftVersion}
              name="assigneeId"
              defaultValue={String(currentUserId)}
              placeholder="— Unassigned —"
              searchPlaceholder="Search people…"
              options={[
                { value: "", label: "— Unassigned —" },
                ...users.map((u) => ({ value: String(u.id), label: u.name, hint: u.jobTitle ?? undefined })),
              ]}
            />
          </div>
          <div>
            <label className="label">Priority</label>
            <SearchSelect
              key={draftVersion}
              name="priority"
              defaultValue={draft.priority}
              options={TASK_PRIORITIES.map((p) => ({ value: p.value, label: p.label }))}
            />
          </div>
          <div>
            <label className="label">Due date</label>
            <DatePicker key={draftVersion} name="dueDate" defaultValue={draft.dueDate ?? ""} />
          </div>
          <div className="flex gap-2 md:col-span-2">
            <button type="submit" className="btn-primary">
              Create task
            </button>
            <button type="button" onClick={reset} className="btn-secondary">
              Start over
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
