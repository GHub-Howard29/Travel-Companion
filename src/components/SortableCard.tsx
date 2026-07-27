import type { ReactNode } from "react";
import { GripVertical } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface SortableCardProps {
  id: string;
  disabled?: boolean;
  children: (dragHandle: ReactNode) => ReactNode;
}

export const SortableCard = ({ id, disabled = false, children }: SortableCardProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled });

  const dragHandle = disabled ? null : (
    <button
      ref={setActivatorNodeRef}
      type="button"
      className="inline-flex h-8 w-7 shrink-0 touch-none items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
      aria-label="拖拉排序"
      title="按住後拖拉排序"
      {...attributes}
      {...listeners}
    >
      <GripVertical size={16} />
    </button>
  );

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.45 : 1,
      }}
    >
      {children(dragHandle)}
    </div>
  );
};
