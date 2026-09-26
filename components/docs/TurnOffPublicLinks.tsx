"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { turnOffAllPublicLinks } from "@/lib/actions/documents";

export default function TurnOffPublicLinks() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!window.confirm("Turn off every public link in the company? Files go back to 'Looms & Berries' access; people with old links can't download any more.")) return;
        start(async () => {
          await turnOffAllPublicLinks();
          router.refresh();
        });
      }}
      className="btn-danger text-sm"
    >
      Turn off all public links
    </button>
  );
}
