export function calculateEditorHeight({ toolbarHeight, contentHeight }) {
  return Math.ceil(toolbarHeight + contentHeight + 2);
}

export function isResizeHandlePointer({
  clientX,
  clientY,
  rect,
  handleSize = 20,
}) {
  return clientX >= rect.right - handleSize
    && clientY >= rect.bottom - handleSize;
}
