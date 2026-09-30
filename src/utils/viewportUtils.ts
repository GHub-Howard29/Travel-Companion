export const releaseFocusedControl = () => {
  if (document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }
};

export const revealElementTopWhenViewportStable = (
  target: HTMLElement,
  topGap = 8,
): (() => void) => {
  const viewport = window.visualViewport;
  let previousHeight = viewport?.height;
  let previousOffsetTop = viewport?.offsetTop;
  let stableFrames = 0;
  let attempts = 0;
  let frameId = 0;
  let cancelled = false;

  const revealWhenStable = () => {
    if (cancelled || !document.contains(target)) return;

    attempts += 1;
    const currentHeight = viewport?.height;
    const currentOffsetTop = viewport?.offsetTop;
    const heightIsStable =
      currentHeight === undefined ||
      previousHeight === undefined ||
      Math.abs(currentHeight - previousHeight) < 1;
    const offsetIsStable =
      currentOffsetTop === undefined ||
      previousOffsetTop === undefined ||
      Math.abs(currentOffsetTop - previousOffsetTop) < 1;

    if (heightIsStable && offsetIsStable) {
      stableFrames += 1;
    } else {
      stableFrames = 0;
    }

    previousHeight = currentHeight;
    previousOffsetTop = currentOffsetTop;

    if (!viewport || stableFrames >= 2 || attempts >= 24) {
      const viewportOffset = viewport?.offsetTop ?? 0;
      const targetTop = window.scrollY + target.getBoundingClientRect().top;
      window.scrollTo({
        top: Math.max(0, targetTop - viewportOffset - topGap),
        behavior: "auto",
      });
      return;
    }

    frameId = requestAnimationFrame(revealWhenStable);
  };

  frameId = requestAnimationFrame(revealWhenStable);

  return () => {
    cancelled = true;
    if (frameId) cancelAnimationFrame(frameId);
  };
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
