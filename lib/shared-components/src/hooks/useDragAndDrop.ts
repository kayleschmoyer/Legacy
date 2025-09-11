import { useState } from 'react';

interface DraggedItem {
  id: string;
  type: string;
}

export const useDragAndDrop = () => {
  const [draggedItem, setDraggedItem] = useState<DraggedItem | null>(null);
  const [dropZone, setDropZone] = useState<string | null>(null);

  const handleDragStart = (item: DraggedItem) => setDraggedItem(item);
  const handleDrop = (zone: string) => setDropZone(zone);

  return { draggedItem, dropZone, handleDragStart, handleDrop };
};
