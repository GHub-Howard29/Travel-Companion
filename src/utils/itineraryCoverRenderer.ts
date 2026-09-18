import {
  getItineraryCoverPlacement,
  type ItineraryCoverCropTransform,
} from "./itineraryCoverCrop";

export const drawItineraryCover = (
  context: CanvasRenderingContext2D,
  image: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  transform: ItineraryCoverCropTransform,
): void => {
  const outputWidth = context.canvas.width;
  const outputHeight = context.canvas.height;
  const outputSize = Math.min(outputWidth, outputHeight);
  context.clearRect(0, 0, outputWidth, outputHeight);

  const backgroundScale = (outputSize / Math.min(sourceWidth, sourceHeight)) * 1.12;
  const backgroundWidth = sourceWidth * backgroundScale;
  const backgroundHeight = sourceHeight * backgroundScale;
  context.save();
  context.filter = `blur(${Math.max(10, Math.round(outputSize * 0.035))}px)`;
  context.drawImage(
    image,
    (outputWidth - backgroundWidth) / 2,
    (outputHeight - backgroundHeight) / 2,
    backgroundWidth,
    backgroundHeight,
  );
  context.restore();
  context.fillStyle = "rgba(15, 23, 42, 0.16)";
  context.fillRect(0, 0, outputWidth, outputHeight);

  const foreground = getItineraryCoverPlacement(sourceWidth, sourceHeight, transform, outputSize);
  context.drawImage(image, foreground.x, foreground.y, foreground.width, foreground.height);
};
