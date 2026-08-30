export const releaseFocusedControl = () => {
  if (document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }
};

export const focusAndRevealControl = (elementId: string) => {
  const target = document.getElementById(elementId);
  if (!(target instanceof HTMLElement)) return;

  target.focus({ preventScroll: true });

  const viewport = window.visualViewport;
  let previousHeight = viewport?.height;
  let stableFrames = 0;
  let attempts = 0;

  const revealWhenStable = () => {
    if (!document.contains(target)) return;

    attempts += 1;
    const currentHeight = viewport?.height;
    if (
      currentHeight === undefined ||
      previousHeight === undefined ||
      Math.abs(currentHeight - previousHeight) < 1
    ) {
      stableFrames += 1;
    } else {
      stableFrames = 0;
    }
    previousHeight = currentHeight;

    if (!viewport || stableFrames >= 2 || attempts >= 24) {
      target.scrollIntoView({ block: "center", behavior: "auto" });
      return;
    }

    requestAnimationFrame(revealWhenStable);
  };

  requestAnimationFrame(revealWhenStable);
};
