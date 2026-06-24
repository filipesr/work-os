import type { Metadata } from "next";
import { Slideshow } from "@/components/task-flow/Slideshow";

export const metadata: Metadata = {
  title: "Apresentação",
};

export default function TaskFlowPresentation() {
  return <Slideshow />;
}
