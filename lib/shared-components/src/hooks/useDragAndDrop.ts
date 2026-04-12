import { useCallback, useState } from 'react';

interface DraggedItem {
  id: string;
  type: string;
}

/**
 * Manages drag-and-drop state for a single dragged item and drop zone.
 *
 * Consumers must wire `handleDragStart`, `handleDrop`, and `handleDragEnd`
 * to the interaction events used by their UI. Depending on the interface,
 * that may include pointer, mouse, touch, keyboard, or custom event handling.
 */
export const useDragAndDrop = () => {
  const [draggedItem, setDraggedItem] = useState<DraggedItem | null>(null);
  const [dropZone, setDropZone] = useState<string | null>(null);

  const handleDragStart = useCallback(
    (item: DraggedItem) => setDraggedItem(item),
    [],
  );

  const handleDrop = useCallback((zone: string) => {
    setDropZone(zone);
    setDraggedItem(null);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggedItem(null);
    setDropZone(null);
  }, []);

  return { draggedItem, dropZone, handleDragStart, handleDrop, handleDragEnd };
};
