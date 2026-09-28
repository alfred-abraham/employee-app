"use client";

import { ChangeEvent, ReactNode, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Building2, CalendarDays, Camera, House, LayoutDashboard, LoaderCircle, LogOut, Upload, Users, X } from "lucide-react";
import { authClient } from "@/lib/auth-client";

export type ShellUser = { name: string; email: string; image: string | null };
type Section = "directory" | "departments" | "time-away" | "address";

const nav = [
  { href: "/", label: "Directory", section: "directory", icon: LayoutDashboard },
  { href: "/departments", label: "Departments", section: "departments", icon: Building2 },
  { href: "/time-away", label: "Time away", section: "time-away", icon: CalendarDays },
  { href: "/my-address", label: "My address", section: "address", icon: House },
] as const;

export function AppShell({ user, section, title, action, children }: { user: ShellUser; section: Section; title: string; action?: ReactNode; children: ReactNode }) {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [photoUrl, setPhotoUrl] = useState(user.image?.startsWith("/api/me/photo") ? user.image : "");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);
  const [captured, setCaptured] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cameraRequest = useRef(0);
  const initials = user.name.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");

  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    queueMicrotask(() => setPreview(url));
    return () => { URL.revokeObjectURL(url); };
  }, [file]);

  useEffect(() => {
    const video = videoRef.current;
    if (cameraOpen && video && streamRef.current) video.srcObject = streamRef.current;
    return () => { if (video) video.srcObject = null; };
  }, [cameraOpen]);

  useEffect(() => () => { cameraRequest.current++; streamRef.current?.getTracks().forEach((track) => track.stop()); }, []);

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraOpen(false);
  }

  function closePhoto() { cameraRequest.current++; stopCamera(); setPhotoOpen(false); setFile(null); setPreview(""); setPhotoError(""); setCaptured(false); }

  async function openCamera() {
    setPhotoError("");
    if (!navigator.mediaDevices?.getUserMedia) { setPhotoError("Camera capture is unavailable in this browser. Upload a photo instead."); return; }
    const requestId = ++cameraRequest.current;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
      if (requestId !== cameraRequest.current) { stream.getTracks().forEach((track) => track.stop()); return; }
      streamRef.current = stream;
      setCameraOpen(true);
    } catch { setPhotoError("Camera access was denied or no camera is available. Upload a photo instead."); }
  }

  function capturePhoto() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) { setPhotoError("The camera is not ready yet."); return; }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) { setPhotoError("Unable to capture a photo. Try again."); return; }
      setFile(new File([blob], "camera.jpg", { type: "image/jpeg" }));
      setCaptured(true);
      stopCamera();
    }, "image/jpeg", 0.9);
  }

  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0];
    if (!selected) return;
    if (!(["image/jpeg", "image/png", "image/webp"].includes(selected.type)) || selected.size > 5 * 1024 * 1024) { setPhotoError("Choose a JPEG, PNG, or WebP image under 5 MB."); return; }
    stopCamera(); setFile(selected); setCaptured(false); setPhotoError("");
  }

  async function savePhoto() {
    if (!file) return;
    setPhotoBusy(true); setPhotoError("");
    try {
      const body = new FormData(); body.set("photo", file);
      const response = await fetch("/api/me/photo", { method: "POST", body });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to save photo.");
      setPhotoUrl(`/api/me/photo?v=${Date.now()}`); closePhoto();
    } catch (error) { setPhotoError(error instanceof Error ? error.message : "Unable to save photo."); }
    finally { setPhotoBusy(false); }
  }

  async function removePhoto() {
    setPhotoBusy(true); setPhotoError("");
    try {
      const response = await fetch("/api/me/photo", { method: "DELETE" });
      if (!response.ok) throw new Error("Unable to remove photo.");
      setPhotoUrl(""); closePhoto();
    } catch (error) { setPhotoError(error instanceof Error ? error.message : "Unable to remove photo."); }
    finally { setPhotoBusy(false); }
  }

  async function signOut() { setSigningOut(true); await authClient.signOut(); router.replace("/login"); router.refresh(); }

  return <div className="min-h-screen bg-[#f3f5f4] text-[#17221c] lg:grid lg:grid-cols-[228px_1fr]">
    <aside className="border-b border-[#dfe4e1] bg-[#153d2a] p-4 text-white lg:flex lg:flex-col lg:border-b-0 lg:border-r lg:p-5">
      <div className="flex items-center gap-3 lg:border-b lg:border-white/10 lg:pb-6"><div className="grid size-10 place-items-center rounded-xl bg-[#d7f06b] text-[#153d2a]"><Users size={21} strokeWidth={2.5}/></div><div><p className="font-semibold tracking-tight">PeopleCore</p><p className="text-xs text-white/55">Employee operations</p></div></div>
      <nav aria-label="Main navigation" className="mt-4 flex gap-1 overflow-x-auto text-sm lg:mt-6 lg:block lg:space-y-1">{nav.map((item) => <Link key={item.href} href={item.href} aria-current={section === item.section ? "page" : undefined} className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2.5 ${section === item.section ? "bg-white/10 font-semibold text-white" : "text-white/70 hover:bg-white/10 hover:text-white"}`}><item.icon size={17}/>{item.label}</Link>)}</nav>
      <div className="mt-auto hidden rounded-xl border border-white/10 bg-white/5 p-3 lg:block"><p className="text-xs font-semibold">System status</p><p className="mt-1 flex items-center gap-2 text-xs text-white/55"><span className="size-2 rounded-full bg-[#d7f06b]"/>Connected to PostgreSQL</p></div>
    </aside>
    <main className="min-w-0"><header className="border-b border-[#dfe4e1] bg-white px-5 py-4 sm:px-8"><div className="mx-auto flex max-w-7xl items-center justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#568067]">People operations</p><h1 className="mt-1 text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">{title}</h1></div><div className="flex items-center gap-2 sm:gap-3"><button type="button" onClick={() => setPhotoOpen(true)} aria-label="Manage profile picture" className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-full bg-[#e4efe7] text-sm font-bold text-[#315f43]">{photoUrl ? <Image unoptimized src={photoUrl} alt="Your profile" width={40} height={40} className="size-full object-cover"/> : initials}</button><div className="hidden text-right md:block"><p className="text-sm font-semibold">{user.name}</p><p className="text-xs text-[#7a857e]">{user.email}</p></div><button type="button" onClick={() => void signOut()} disabled={signingOut} aria-label="Log out" className="rounded-lg border border-[#d6dcd8] bg-white p-2.5 text-[#536058] disabled:opacity-50"><LogOut size={17}/></button>{action}</div></div></header>{children}</main>
    {photoOpen && <div className="fixed inset-0 z-50 grid place-items-center bg-[#0b1e14]/60 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) closePhoto(); }}><section role="dialog" aria-modal="true" aria-label="Profile picture" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"><div className="flex items-center justify-between"><h2 className="text-xl font-semibold">Profile picture</h2><button type="button" onClick={closePhoto} aria-label="Close"><X size={20}/></button></div><p className="mt-2 text-sm text-[#66736b]">Upload a photo or take one with your camera.</p>{photoError && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">{photoError}</p>}
      <div className="mt-5 grid h-52 place-items-center overflow-hidden rounded-xl bg-[#edf2ef]">{cameraOpen ? <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover"/> : preview ? <Image unoptimized src={preview} alt="Selected profile preview" width={512} height={208} className="h-full w-full object-cover"/> : photoUrl ? <Image unoptimized src={photoUrl} alt="Current profile" width={512} height={208} className="h-full w-full object-cover"/> : <span className="text-5xl font-bold text-[#315f43]">{initials}</span>}</div>
      <div className="mt-5 flex flex-wrap gap-2"><label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-[#d6dcd8] px-3 py-2 text-sm font-semibold"><Upload size={16}/>Upload<input type="file" accept="image/jpeg,image/png,image/webp" onChange={chooseFile} className="sr-only"/></label>{cameraOpen ? <><button type="button" onClick={capturePhoto} className="rounded-lg border border-[#d6dcd8] px-3 py-2 text-sm font-semibold">Capture</button><button type="button" onClick={stopCamera} className="rounded-lg border border-[#d6dcd8] px-3 py-2 text-sm">Cancel camera</button></> : <button type="button" onClick={() => void openCamera()} className="inline-flex items-center gap-2 rounded-lg border border-[#d6dcd8] px-3 py-2 text-sm font-semibold"><Camera size={16}/>{captured ? "Retake" : "Take photo"}</button>}</div>
      <div className="mt-6 flex justify-between border-t border-[#e2e7e3] pt-4"><button type="button" onClick={() => void removePhoto()} disabled={photoBusy || !photoUrl} className="text-sm font-semibold text-red-700 disabled:opacity-40">Remove photo</button><div className="flex gap-2"><button type="button" onClick={closePhoto} className="rounded-lg border border-[#d6dcd8] px-3 py-2 text-sm">Cancel</button><button type="button" onClick={() => void savePhoto()} disabled={!file || photoBusy} className="rounded-lg bg-[#173f2b] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{photoBusy ? <LoaderCircle className="animate-spin" size={16}/> : "Save photo"}</button></div></div></section></div>}
  </div>;
}
