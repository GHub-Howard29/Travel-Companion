export const releaseFocusedControl = () => {
  if (document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }
};
