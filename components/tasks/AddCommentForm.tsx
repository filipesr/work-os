"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { addComment } from "@/lib/actions/task";
import { MessageSquare, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { useTranslations } from "next-intl";

interface AddCommentFormProps {
  taskId: string;
  userId: string;
}

export function AddCommentForm({ taskId, userId }: AddCommentFormProps) {
  const [content, setContent] = useState("");
  const [isPending, startTransition] = useTransition();
  const t = useTranslations("tasks.comments");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!content.trim()) {
      toast.error(t("emptyError"));
      return;
    }

    startTransition(async () => {
      const result = await addComment(taskId, content);

      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(t("addSuccess"));
        setContent(""); // Clear the form
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="flex items-center gap-2 mb-2">
        <MessageSquare className="h-4 w-4" />
        <h3 className="font-medium text-sm">{t("addComment")}</h3>
      </div>

      <Textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder={t("placeholder")}
        disabled={isPending}
        rows={3}
        className="resize-none"
      />

      <Button type="submit" disabled={isPending || !content.trim()} size="sm">
        {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
        {isPending ? t("sending") : t("submit")}
      </Button>
    </form>
  );
}
