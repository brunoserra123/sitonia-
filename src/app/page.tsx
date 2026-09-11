"use client";

import React, { useState } from "react";
import { useSession, signIn, signOut } from "next-auth/react";
import { Search, Download, UploadCloud, Play, Pause, SkipForward, SkipBack, Volume2, HardDrive, LogOut, Check, Loader2 } from "lucide-react";

const OFFLINE_CACHE = "cloudmusic-offline-v1";
const streamUrl = (id: string) => `/api/stream/${id}`;

// Notificação nativa do navegador (funciona no Chrome Android, inclusive instalado como app)
const notifyDownloadComplete = async (fileName: string) => {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  try {
    let perm = Notification.permission;
    if (perm === "default") perm = await Notification.requestPermission();
    if (perm === "granted") {
      new Notification("Download concluído", { body: `${fileName} foi salvo no seu Drive.` });
    }
  } catch {}
};

export default function Home() {
  const { data: session } = useSession();
  const [isPlaying, setIsPlaying] = useState(false);
  const [link, setLink] = useState("");
  const [library, setLibrary] = useState<any[]>([]);
  const [loadingLibrary, setLoadingLibrary] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const [currentTrack, setCurrentTrack] = useState<any>(null);
  const [audioSrc, setAudioSrc] = useState<string>("");
  const audioRef = React.useRef<HTMLAudioElement>(null);
  const objectUrlRef = React.useRef<string | null>(null);

  // Novos estados para a barra de progresso
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);

  // Músicas salvas offline (Cache Storage do navegador)
  const [offlineIds, setOfflineIds] = useState<Set<string>>(new Set());
  const [offlineDownloadingId, setOfflineDownloadingId] = useState<string | null>(null);
  const [cacheSupported, setCacheSupported] = useState(false);

  React.useEffect(() => {
    setCacheSupported(typeof window !== "undefined" && "caches" in window);
  }, []);

  const fetchLibrary = () => {
    if (session) {
      setLoadingLibrary(true);
      fetch("/api/library")
        .then(res => res.json())
        .then(data => {
          if (data.files) setLibrary(data.files);
          setLoadingLibrary(false);
        })
        .catch(() => setLoadingLibrary(false));
    }
  };

  React.useEffect(() => {
    fetchLibrary();
  }, [session]);

  // Verifica quais músicas da biblioteca já estão salvas offline (cache do navegador)
  React.useEffect(() => {
    const checkOffline = async () => {
      if (!cacheSupported || library.length === 0) return;
      try {
        const cache = await caches.open(OFFLINE_CACHE);
        const keys = await cache.keys();
        const cachedIds = new Set(
          keys
            .map((req) => {
              const m = req.url.match(/\/api\/stream\/([^/?]+)/);
              return m ? m[1] : null;
            })
            .filter((v): v is string => !!v)
        );
        setOfflineIds(cachedIds);
      } catch {}
    };
    checkOffline();
  }, [library, cacheSupported]);

  const handleDownload = async () => {
    if (!link || !session) return;
    setIsDownloading(true);
    try {
      const res = await fetch("/api/youtube", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: link }),
      });
      const data = await res.json();
      if (data.success) {
        setLink("");
        fetchLibrary();
        notifyDownloadComplete(data.fileName || "Sua música");
        alert("Música baixada e salva com sucesso!");
      } else {
        alert("Erro: " + data.error);
      }
    } catch (err) {
      alert("Erro ao baixar música.");
    } finally {
      setIsDownloading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !session) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (data.success) {
        fetchLibrary();
        alert("Arquivo enviado com sucesso!");
      } else {
        alert("Erro no upload: " + data.error);
      }
    } catch (err) {
      alert("Erro ao enviar o arquivo.");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const playTrack = async (track: any) => {
    setCurrentTrack(track);
    setIsPlaying(true);
    setProgress(0);
    setDuration(0);

    let src = streamUrl(track.id);
    if (cacheSupported) {
      try {
        const cache = await caches.open(OFFLINE_CACHE);
        const cached = await cache.match(streamUrl(track.id));
        if (cached) {
          const blob = await cached.blob();
          if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
          src = URL.createObjectURL(blob);
          objectUrlRef.current = src;
        }
      } catch {}
    }
    setAudioSrc(src);
    setTimeout(() => {
      if (audioRef.current) {
        audioRef.current.play();
      }
    }, 100);
  };

  const playNext = () => {
    if (!currentTrack || library.length === 0) return;
    const idx = library.findIndex((f) => f.id === currentTrack.id);
    if (idx === -1) return;
    const next = library[(idx + 1) % library.length];
    if (next) playTrack(next);
  };

  const playPrevious = () => {
    if (!currentTrack || library.length === 0) return;
    const idx = library.findIndex((f) => f.id === currentTrack.id);
    if (idx === -1) return;
    const prev = library[(idx - 1 + library.length) % library.length];
    if (prev) playTrack(prev);
  };

  const downloadOffline = async (track: any) => {
    if (!cacheSupported || offlineIds.has(track.id) || offlineDownloadingId) return;
    setOfflineDownloadingId(track.id);
    try {
      const cache = await caches.open(OFFLINE_CACHE);
      const res = await fetch(streamUrl(track.id));
      if (!res.ok) throw new Error("Falha ao baixar");
      await cache.put(streamUrl(track.id), res);
      setOfflineIds((prev) => new Set(prev).add(track.id));
    } catch (err) {
      alert("Erro ao salvar música offline.");
    } finally {
      setOfflineDownloadingId(null);
    }
  };

  const togglePlay = () => {
    if (!currentTrack) return;
    if (isPlaying) {
      audioRef.current?.pause();
      setIsPlaying(false);
    } else {
      audioRef.current?.play();
      setIsPlaying(true);
    }
  };

  // Funções da barra de progresso
  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setProgress(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = Number(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setProgress(time);
    }
  };

  const formatTime = (time: number) => {
    if (!time || isNaN(time)) return "0:00";
    const min = Math.floor(time / 60);
    const sec = Math.floor(time % 60);
    return `${min}:${sec < 10 ? '0' : ''}${sec}`;
  };

  // Media Session: controles na tela de bloqueio / notificação (Android Chrome e navegadores modernos)
  React.useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    const ms: any = (navigator as any).mediaSession;
    if (!currentTrack) {
      ms.metadata = null;
      return;
    }
    const MediaMetadataCtor = (window as any).MediaMetadata;
    if (MediaMetadataCtor) {
      ms.metadata = new MediaMetadataCtor({
        title: currentTrack.name,
        artist: "CloudMusic",
        album: "Google Drive",
      });
    }
    ms.setActionHandler("play", () => audioRef.current?.play());
    ms.setActionHandler("pause", () => audioRef.current?.pause());
    ms.setActionHandler("previoustrack", () => playPrevious());
    ms.setActionHandler("nexttrack", () => playNext());
    try {
      ms.setActionHandler("seekto", (details: any) => {
        if (audioRef.current && details?.seekTime != null) {
          audioRef.current.currentTime = details.seekTime;
        }
      });
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTrack, library]);

  React.useEffect(() => {
    if (typeof navigator !== "undefined" && "mediaSession" in navigator) {
      (navigator as any).mediaSession.playbackState = isPlaying ? "playing" : "paused";
    }
  }, [isPlaying]);

  return (
    <div className="min-h-screen bg-slate-950 pb-40 md:pb-32 text-slate-100 font-sans selection:bg-blue-500/30">

      {/* Elemento de Áudio Oculto */}
      {currentTrack && (
        <audio
          ref={audioRef}
          src={audioSrc}
          onEnded={() => (library.length > 1 ? playNext() : setIsPlaying(false))}
          onPause={() => setIsPlaying(false)}
          onPlay={() => setIsPlaying(true)}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
        />
      )}

      {/* Background Effects */}
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600/20 blur-[120px] rounded-full mix-blend-screen" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-600/20 blur-[120px] rounded-full mix-blend-screen" />
      </div>

      {/* Header */}
      <header className="sticky top-0 z-40 glass-panel border-b border-white/5 px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <Play className="w-4 h-4 text-white fill-white" />
          </div>
          <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
            CloudMusic
          </h1>
        </div>

        {session ? (
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-3 bg-white/5 rounded-full pl-2 pr-4 py-1 border border-white/10">
              <img src={session.user?.image || ""} alt="Avatar" className="w-7 h-7 rounded-full" />
              <span className="text-sm font-medium">{session.user?.name}</span>
            </div>
            <button
              onClick={() => signOut()}
              className="w-9 h-9 rounded-full bg-white/10 hover:bg-red-500/20 transition-colors flex items-center justify-center group"
              title="Sair"
            >
              <LogOut className="w-4 h-4 text-slate-300 group-hover:text-red-400" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => signIn("google")}
            className="text-sm font-medium bg-blue-600 hover:bg-blue-500 transition-colors px-4 py-2 rounded-full flex items-center gap-2 shadow-lg shadow-blue-500/20"
          >
            <HardDrive className="w-4 h-4" />
            <span>Conectar Google Drive</span>
          </button>
        )}
      </header>

      {/* Main Content */}
      <main className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 pt-12">

        {/* Hero Section */}
        <div className="text-center mb-12">
          <h2 className="text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight mb-4">
            Sua música no <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500">Drive.</span>
          </h2>
          <p className="text-slate-400 text-lg max-w-2xl mx-auto">
            Baixe do YouTube ou faça upload dos seus arquivos e ouça em qualquer dispositivo. Tudo salvo com segurança no seu Google Drive.
          </p>
        </div>

        {/* Action Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-16">

          {/* YouTube Downloader */}
          <div className="glass-panel p-6 rounded-3xl transition-all hover:border-blue-500/30 group">
            <div className="w-12 h-12 rounded-2xl bg-blue-500/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <Download className="w-6 h-6 text-blue-400" />
            </div>
            <h3 className="text-xl font-semibold mb-2">Baixar do YouTube</h3>
            <p className="text-slate-400 text-sm mb-6">Cole o link de qualquer vídeo para extrair o áudio e salvar direto no seu Drive.</p>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  placeholder="https://youtube.com/..."
                  value={link}
                  onChange={(e) => setLink(e.target.value)}
                  className="w-full bg-black/20 border border-white/10 rounded-full py-3 pl-10 pr-4 text-sm focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all placeholder:text-slate-600"
                />
              </div>
              <button
                onClick={handleDownload}
                disabled={isDownloading || !link || !session}
                className="bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 disabled:cursor-not-allowed text-white px-6 py-3 rounded-full font-medium transition-colors shadow-lg shadow-blue-600/20 flex items-center gap-2"
              >
                {isDownloading ? (
                  <span className="animate-pulse">Baixando...</span>
                ) : (
                  <span>Baixar</span>
                )}
              </button>
            </div>
          </div>

          {/* Manual Upload */}
          <div className="glass-panel p-6 rounded-3xl transition-all hover:border-purple-500/30 group relative overflow-hidden">
            <div className="w-12 h-12 rounded-2xl bg-purple-500/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <UploadCloud className="w-6 h-6 text-purple-400" />
            </div>
            <h3 className="text-xl font-semibold mb-2">Upload Manual</h3>
            <p className="text-slate-400 text-sm mb-6">Selecione arquivos de áudio do seu celular ou computador para adicionar à sua biblioteca.</p>

            <input
              type="file"
              accept="audio/*,video/*"
              className="hidden"
              ref={fileInputRef}
              onChange={handleFileUpload}
            />

            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading || !session}
              className="w-full bg-white/5 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed border border-white/10 text-white px-6 py-3 rounded-full font-medium transition-colors flex items-center justify-center gap-2"
            >
              {isUploading ? (
                <>
                  <UploadCloud className="w-4 h-4 animate-bounce" />
                  <span>Enviando...</span>
                </>
              ) : (
                <>
                  <UploadCloud className="w-4 h-4" />
                  <span>Escolher Arquivo</span>
                </>
              )}
            </button>
          </div>

        </div>

        {/* Library Section */}
        <div>
          <div className="flex justify-between items-end mb-6">
            <h3 className="text-2xl font-bold">Sua Biblioteca</h3>
            <span className="text-sm text-slate-500">Músicas do Drive</span>
          </div>

          <div className="space-y-2">
            {!session && (
              <div className="text-center p-8 border border-white/5 rounded-2xl bg-white/5">
                <p className="text-slate-400">Faça login para ver suas músicas.</p>
              </div>
            )}

            {session && loadingLibrary && (
              <div className="text-center p-8 border border-white/5 rounded-2xl bg-white/5">
                <p className="text-slate-400 animate-pulse">Carregando músicas do Drive...</p>
              </div>
            )}

            {session && !loadingLibrary && library.length === 0 && (
              <div className="text-center p-8 border border-white/5 rounded-2xl bg-white/5">
                <p className="text-slate-400">Nenhuma música encontrada. Que tal baixar uma?</p>
              </div>
            )}

            {session && !loadingLibrary && library.map((file) => (
              <div
                key={file.id}
                onClick={() => playTrack(file)}
                className={`flex items-center gap-4 p-3 rounded-2xl transition-colors group cursor-pointer border ${currentTrack?.id === file.id ? 'bg-white/10 border-blue-500/50' : 'hover:bg-white/5 border-transparent hover:border-white/5'}`}
              >
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors ${currentTrack?.id === file.id ? 'bg-blue-500' : 'bg-slate-800 group-hover:bg-blue-500/20'}`}>
                  {currentTrack?.id === file.id && isPlaying ? (
                    <Pause className={`w-5 h-5 ${currentTrack?.id === file.id ? 'text-white fill-white' : 'text-slate-400 group-hover:text-blue-400 group-hover:fill-blue-400'}`} />
                  ) : (
                    <Play className={`w-5 h-5 ${currentTrack?.id === file.id ? 'text-white fill-white' : 'text-slate-400 group-hover:text-blue-400 group-hover:fill-blue-400'}`} />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className={`font-medium truncate transition-colors ${currentTrack?.id === file.id ? 'text-blue-400' : 'text-slate-200 group-hover:text-white'}`}>{file.name}</h4>
                  <p className="text-xs text-slate-500 truncate">Google Drive{offlineIds.has(file.id) ? " · Disponível offline" : ""}</p>
                </div>
                {cacheSupported && (
                  <button
                    onClick={(e) => { e.stopPropagation(); downloadOffline(file); }}
                    disabled={offlineIds.has(file.id) || offlineDownloadingId === file.id}
                    title={offlineIds.has(file.id) ? "Disponível offline" : "Baixar para ouvir offline"}
                    className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center bg-white/5 hover:bg-white/10 disabled:cursor-default transition-colors"
                  >
                    {offlineDownloadingId === file.id ? (
                      <Loader2 className="w-4 h-4 text-slate-300 animate-spin" />
                    ) : offlineIds.has(file.id) ? (
                      <Check className="w-4 h-4 text-green-400" />
                    ) : (
                      <Download className="w-4 h-4 text-slate-400" />
                    )}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

      </main>

      {/* Floating Player */}
      <div className="fixed bottom-0 left-0 right-0 z-50 p-4 sm:p-6 pointer-events-none">
        <div className="max-w-3xl mx-auto glass-panel rounded-2xl sm:rounded-full p-3 sm:pr-6 flex flex-col sm:flex-row items-center gap-4 pointer-events-auto shadow-2xl shadow-black/50 border-t border-white/10">

          <div className="flex items-center gap-4 w-full sm:w-auto">
            {/* Album Art / Icon */}
            <div className={`w-12 h-12 rounded-full flex-shrink-0 flex items-center justify-center shadow-inner overflow-hidden relative ${currentTrack ? 'bg-gradient-to-tr from-blue-600 to-purple-600 animate-spin-slow' : 'bg-gradient-to-tr from-slate-800 to-slate-700'}`}>
              <div className="w-3 h-3 rounded-full bg-slate-900 absolute"></div>
              {currentTrack && isPlaying && <div className="absolute inset-0 bg-black/20" />}
            </div>

            {/* Mobile Title */}
            <div className="sm:hidden flex-1 min-w-0">
              <div className="text-sm font-semibold text-white truncate">{currentTrack ? currentTrack.name : "Nenhuma música tocando"}</div>
            </div>
          </div>

          {/* Info & Progress */}
          <div className="flex-1 min-w-0 w-full flex flex-col justify-center">
            <div className="hidden sm:block text-sm font-semibold text-white truncate mb-1">{currentTrack ? currentTrack.name : "Nenhuma música tocando"}</div>
            <div className="flex items-center gap-3">
               <span className="text-[11px] text-slate-400 w-8 text-right font-medium">{formatTime(progress)}</span>
               <input
                 type="range"
                 min={0}
                 max={duration || 100}
                 value={progress}
                 onChange={handleSeek}
                 disabled={!currentTrack}
                 className="flex-1 h-1.5 bg-slate-800 rounded-full appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500/50 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-blue-500 [&::-webkit-slider-thumb]:rounded-full hover:[&::-webkit-slider-thumb]:bg-blue-400 transition-all"
                 style={{
                   background: currentTrack ? `linear-gradient(to right, #3b82f6 ${(progress / (duration || 1)) * 100}%, #1e293b ${(progress / (duration || 1)) * 100}%)` : '#1e293b'
                 }}
               />
               <span className="text-[11px] text-slate-400 w-8 font-medium">{formatTime(duration)}</span>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center justify-center gap-4 sm:gap-6 w-full sm:w-auto mt-2 sm:mt-0">
            <button
              onClick={playPrevious}
              disabled={!currentTrack || library.length < 2}
              className="text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <SkipBack className="w-5 h-5" />
            </button>
            <button
              onClick={togglePlay}
              disabled={!currentTrack}
              className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center transition-transform shadow-lg ${currentTrack ? 'bg-white text-black hover:scale-105 shadow-white/20' : 'bg-white/20 text-white/50 cursor-not-allowed'}`}
            >
              {isPlaying ? <Pause className="w-5 h-5 sm:w-6 sm:h-6 fill-current" /> : <Play className="w-5 h-5 sm:w-6 sm:h-6 fill-current ml-1" />}
            </button>
            <button
              onClick={playNext}
              disabled={!currentTrack || library.length < 2}
              className="text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <SkipForward className="w-5 h-5" />
            </button>

            <div className="w-[1px] h-6 bg-white/10 hidden sm:block mx-2"></div>

            <button className="text-slate-400 hover:text-white transition-colors hidden sm:block">
              <Volume2 className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

    </div>
  );
}
