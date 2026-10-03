"use client";

import { Ref, useEffect, useImperativeHandle, useRef, useState } from "react";
import { defaultFraming, photoGeometry, type PhotoFraming } from "@/lib/photo-framing";

export type PhotoCropHandle = { exportPhoto: () => Promise<File> };

export function PhotoCropEditor({ source, ref, onReady, onError, disabled }: {
  source: string; ref: Ref<PhotoCropHandle>; onReady: (ready: boolean) => void;
  onError: (message: string) => void; disabled: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [framing, setFraming] = useState<PhotoFraming>(defaultFraming);

  useEffect(() => {
    let cancelled = false;
    const photo = new window.Image();
    photo.onload = () => { if (!cancelled) setImage(photo); };
    photo.onerror = () => { if (!cancelled) onError("This photo could not be opened. Choose another photo."); };
    photo.src = source;
    return () => { cancelled = true; };
  }, [source, onError]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !image) return;
    if (!context) { onError("The photo editor is unavailable in this browser."); return; }
    const geometry = photoGeometry(image.naturalWidth, image.naturalHeight, canvas.width, framing);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.save();
    context.translate(canvas.width / 2, canvas.height / 2);
    context.rotate(geometry.radians);
    context.drawImage(image, geometry.x, geometry.y, geometry.width, geometry.height);
    context.restore();
    onReady(true);
  }, [image, framing, onReady, onError]);

  useImperativeHandle(ref, () => ({
    exportPhoto: () => new Promise<File>((resolve, reject) => {
      const canvas = canvasRef.current;
      if (!canvas || !image) { reject(new Error("The photo preview is not ready yet.")); return; }
      canvas.toBlob((blob) => {
        if (blob) resolve(new File([blob], "profile.jpg", { type: "image/jpeg" }));
        else reject(new Error("Unable to prepare the photo. Try again."));
      }, "image/jpeg", 0.95);
    }),
  }), [image]);

  const controls = [
    { field: "horizontal", label: "Horizontal position", min: -100, max: 100, step: 1, value: `${framing.horizontal}%` },
    { field: "vertical", label: "Vertical position", min: -100, max: 100, step: 1, value: `${framing.vertical}%` },
    { field: "zoom", label: "Zoom", min: 1, max: 3, step: 0.05, value: `${framing.zoom.toFixed(2)}×` },
    { field: "angle", label: "Straighten", min: -45, max: 45, step: 1, value: `${framing.angle}°` },
  ] as const;

  return <div className="mt-5">
    <div className="relative mx-auto aspect-square w-full max-w-64 overflow-hidden rounded-xl bg-[#edf2ef]">
      <canvas ref={canvasRef} width={512} height={512} role="img" aria-label="Final profile photo preview" className="block size-full"/>
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-full border-2 border-white/70"/>
    </div>
    <p className="mt-2 text-center text-xs text-[#66736b]">Center your face inside the circle. The saved avatar uses this framing.</p>
    <fieldset disabled={!image || disabled} className="mt-4 grid gap-3 disabled:opacity-50">
      {controls.map((control) => <label key={control.field} className="text-sm text-[#435047]">
        <span className="flex justify-between"><span>{control.label}</span><span>{control.value}</span></span>
        <input type="range" min={control.min} max={control.max} step={control.step} value={framing[control.field]} onChange={(event) => setFraming((current) => ({ ...current, [control.field]: Number(event.target.value) }))} className="mt-1 block w-full accent-[#173f2b]"/>
      </label>)}
      <button type="button" onClick={() => setFraming(defaultFraming)} className="justify-self-start text-sm font-semibold text-[#315f43] underline">Reset framing</button>
    </fieldset>
  </div>;
}
