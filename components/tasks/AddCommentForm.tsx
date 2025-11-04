"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { addComment } from "@/lib/actions/task";
import { MessageSquare, Loader2 } from "lucide-react";
import toast from "react-hot-toast";

interface AddCommentFormProps {
  taskId: string;
  userId: string;
}

export function AddCommentForm({ taskId, userId }: AddCommentFormProps) {
  const [content, setContent] = useState("");
  const [isPending, startTransition] = useTransition();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!content.trim()) {
      toast.error("O comentário não pode estar vazio");
      return;
    }

    startTransition(async () => {
      const result = await addComment(taskId, content);

      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Comentário adicionado com sucesso");
        setContent(""); // Clear the form
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="flex items-center gap-2 mb-2">
        <MessageSquare className="h-4 w-4" />
        <h3 className="font-medium text-sm">Adicionar Comentário</h3>
      </div>

      <Textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Digite seu comentário..."
        disabled={isPending}
        rows={3}
        className="resize-none"
      />

      <Button type="submit" disabled={isPending || !content.trim()} size="sm">
        {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
        {isPending ? "Enviando..." : "Enviar Comentário"}
      </Button>
    </form>
  );
}
