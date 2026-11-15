import { useEffect, useState } from "react";

export function useDominantColor(imageUrl: string | undefined): string {
  const [color, setColor] = useState("18, 18, 18");

  useEffect(() => {
    if (!imageUrl) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = imageUrl;
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 1;
        canvas.height = 1;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, 1, 1);
        const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
        setColor(`${r}, ${g}, ${b}`);
      } catch {
        // Fallback for CORS or canvas errors
        setColor("18, 18, 18");
      }
    };
    img.onerror = () => {
      setColor("18, 18, 18");
    };
  }, [imageUrl]);

  return color;
}
