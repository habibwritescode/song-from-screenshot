const INSET = 8;

export interface HoverButton {
  element: HTMLButtonElement;
  /** The image the button currently sits on, if shown. */
  target: HTMLImageElement | null;
  showFor(image: HTMLImageElement): void;
  hide(): void;
}

export function createHoverButton(
  onClick: (image: HTMLImageElement) => void,
): HoverButton {
  const element = document.createElement("button");
  element.type = "button";
  element.className = "find";
  element.textContent = "♪ Find song";
  element.hidden = true;

  const button: HoverButton = {
    element,
    target: null,
    showFor(image) {
      button.target = image;
      element.hidden = false;
      const rect = image.getBoundingClientRect();
      const width = element.offsetWidth;
      // Stays on screen when the top of a tall image is scrolled away.
      element.style.top = `${Math.max(rect.top, 0) + INSET}px`;
      element.style.left = `${Math.min(rect.right, innerWidth) - width - INSET}px`;
    },
    hide() {
      button.target = null;
      element.hidden = true;
    },
  };

  element.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (button.target) onClick(button.target);
  });
  return button;
}
