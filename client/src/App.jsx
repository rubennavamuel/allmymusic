import { useState, useEffect } from 'react'
import { Search, Download, Music, Video, Loader2, CheckCircle2, AlertCircle, ListMusic, CheckSquare, Square, Clock } from 'lucide-react'
import { clsx } from 'clsx'

function App() {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [info, setInfo] = useState(null)
  const [error, setError] = useState(null)
  const [format, setFormat] = useState('mp3')
  const [quality, setQuality] = useState('best')
  const [jobId, setJobId] = useState(null)
  const [jobStatus, setJobStatus] = useState(null)
  const [progress, setProgress] = useState(0)
  const [jobResult, setJobResult] = useState(null)
  const [selectedTracks, setSelectedTracks] = useState(new Set())
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 })

  // Poll for job status
  useEffect(() => {
    let interval;
    if (jobId && (jobStatus === 'starting' || jobStatus === 'downloading')) {
      interval = setInterval(async () => {
        try {
          const res = await fetch(`/api/job/${jobId}`);
          const data = await res.json();
          setJobStatus(data.status);
          setProgress(data.progress || 0);
          if (data.currentItem) {
            setBatchProgress({ current: data.currentItem, total: data.totalItems });
          }
          if (data.status === 'completed') {
            setJobResult(data.result);
            clearInterval(interval);
          } else if (data.status === 'failed') {
            clearInterval(interval);
          }
        } catch (err) {
          console.error('Polling error:', err);
        }
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [jobId, jobStatus]);

  const fetchInfo = async (e) => {
    e.preventDefault();
    if (!url) return;
    
    setLoading(true);
    setError(null);
    setInfo(null);
    setJobId(null);
    setJobStatus(null);
    setProgress(0);
    setSelectedTracks(new Set());

    try {
      const res = await fetch('/api/info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });
      const data = await res.json();
      if (res.ok) {
        setInfo(data);
        // If playlist, select all tracks by default
        if (data.isPlaylist && data.tracks) {
          setSelectedTracks(new Set(data.tracks.map((_, i) => i)));
        }
      } else {
        let msg = data.error || 'Failed to fetch media info';
        if (msg.includes('403')) msg = 'Access Forbidden (403). Try another link.';
        if (msg.includes('NotFound')) msg = 'Media not found on Spotify. It might be restricted or invalid.';
        if (msg.includes('timeout')) msg = 'Request timed out. The server is busy, please try again.';
        setError(msg);
      }
    } catch (err) {
      setError('Connection error: Could not reach the download server.');
    } finally {
      setLoading(false);
    }
  };

  const toggleTrack = (index) => {
    const newSelected = new Set(selectedTracks);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedTracks(newSelected);
  };

  const selectAllTracks = () => {
    if (info && info.tracks) {
      setSelectedTracks(new Set(info.tracks.map((_, i) => i)));
    }
  };

  const deselectAllTracks = () => {
    setSelectedTracks(new Set());
  };

  const startDownload = async () => {
    setError(null);
    setJobStatus('starting');

    // PopAds
    try {
      if (window.popads && typeof window.popads.openPopunder === 'function') {
        window.popads.openPopunder();
      }
    } catch (e) {
      console.log('PopAds not ready yet');
    }

    if (info && info.isPlaylist && info.tracks && info.tracks.length > 0) {
      // Batch download: only selected tracks
      const selectedUrls = Array.from(selectedTracks).map(i => info.tracks[i].url).filter(Boolean);
      if (selectedUrls.length === 0) {
        setError('No tracks selected');
        setJobStatus(null);
        return;
      }
      try {
        const res = await fetch('/api/download-batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ urls: selectedUrls, format, quality })
        });
        const data = await res.json();
        if (res.ok) {
          setJobId(data.jobId);
          setBatchProgress({ current: 0, total: selectedUrls.length });
        } else {
          setError(data.error || 'Failed to start batch download');
          setJobStatus(null);
        }
      } catch (err) {
        setError('Connection error');
        setJobStatus(null);
      }
    } else {
      // Single download
      try {
        const res = await fetch('/api/download', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url, format, quality, title: info?.title })
        });
        const data = await res.json();
        if (res.ok) {
          setJobId(data.jobId);
        } else {
          setError(data.error || 'Failed to start download');
          setJobStatus(null);
        }
      } catch (err) {
        setError('Connection error');
        setJobStatus(null);
      }
    }
  };

  const formatDuration = (seconds) => {
    if (!seconds && seconds !== 0) return '';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const isPlaylist = info && info.isPlaylist && info.tracks && info.tracks.length > 0;

  return (
    <div className="max-w-4xl mx-auto px-4 py-12 flex flex-col gap-8">
      {/* Header */}
      <header className="text-center">
        <h1 className="text-5xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-600 mb-2">
          allmymusic
        </h1>
        <p className="text-slate-400">Fast, free, and unified media downloader</p>
      </header>

      {/* Top Ad Placeholder */}
      <div className="w-full h-24 bg-slate-800/50 rounded-lg flex items-center justify-center border border-slate-700 border-dashed text-slate-500 text-sm">
        Leaderboard Ad Placeholder
      </div>

      {/* Main Search Section */}
      <main className="bg-slate-800 rounded-2xl p-6 shadow-xl border border-slate-700">
        <form onSubmit={fetchInfo} className="relative group">
          <input
            type="text"
            placeholder="Paste YouTube, Spotify, or any other link here..."
            className="w-full bg-slate-900 border-2 border-slate-700 rounded-xl py-4 pl-12 pr-4 text-lg focus:outline-none focus:border-purple-500 transition-colors"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-purple-500 transition-colors" size={24} />
          <button 
            type="submit"
            disabled={loading}
            className="absolute right-2 top-1/2 -translate-y-1/2 bg-purple-600 hover:bg-purple-700 disabled:bg-slate-700 text-white font-bold py-2 px-6 rounded-lg transition-all"
          >
            {loading ? <Loader2 className="animate-spin" /> : 'Fetch'}
          </button>
        </form>

        {/* Loading indicator during fetch */}
        {loading && (
          <div className="mt-6 space-y-4 animate-in fade-in duration-300">
            <div className="flex items-center gap-3 text-slate-300">
              <Loader2 className="animate-spin text-purple-400" size={20} />
              <span className="text-sm font-medium">Fetching media info...</span>
            </div>
            <div className="w-full bg-slate-900 rounded-full h-2 border border-slate-700 overflow-hidden">
              <div className="bg-gradient-to-r from-purple-500 to-pink-500 h-full rounded-full animate-pulse"
                style={{ width: '60%' }}
              ></div>
            </div>
            <p className="text-xs text-slate-500">This may take up to 60 seconds for large playlists or albums.</p>
          </div>
        )}

        {error && (
          <div className="mt-4 p-4 bg-red-900/30 border border-red-800 text-red-200 rounded-xl flex items-center gap-3">
            <AlertCircle size={20} />
            {error}
          </div>
        )}

        {/* Media Info */}
        {info && !isPlaylist && (
          <div className="mt-8 flex flex-col md:flex-row gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="md:w-1/3">
              <img 
                src={info.thumbnail} 
                alt={info.title} 
                className="w-full aspect-video md:aspect-square object-cover rounded-xl shadow-lg border border-slate-700"
              />
            </div>
            <div className="md:w-2/3 flex flex-col justify-between">
              <div>
                <h2 className="text-2xl font-bold line-clamp-2 mb-1">{info.title}</h2>
                <p className="text-slate-400 mb-4">{info.duration}</p>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Format</label>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => setFormat('mp3')}
                        className={clsx(
                          "flex-1 flex items-center justify-center gap-2 py-2 rounded-lg border-2 transition-all",
                          format === 'mp3' ? "border-purple-500 bg-purple-500/10 text-purple-400" : "border-slate-700 hover:border-slate-600"
                        )}
                      >
                        <Music size={16} /> MP3
                      </button>
                      <button 
                        onClick={() => setFormat('mp4')}
                        className={clsx(
                          "flex-1 flex items-center justify-center gap-2 py-2 rounded-lg border-2 transition-all",
                          format === 'mp4' ? "border-purple-500 bg-purple-500/10 text-purple-400" : "border-slate-700 hover:border-slate-600"
                        )}
                      >
                        <Video size={16} /> MP4
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Quality</label>
                    <select 
                      value={quality}
                      onChange={(e) => setQuality(e.target.value)}
                      className="w-full bg-slate-900 border-2 border-slate-700 rounded-lg py-2 px-3 focus:outline-none focus:border-purple-500"
                    >
                      <option value="best">Best Quality</option>
                      <option value="192">192 kbps / 720p</option>
                      <option value="128">128 kbps / 480p</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="mt-6">
                {!jobStatus && (
                  <button 
                    onClick={startDownload}
                    className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-black py-4 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-purple-900/20 transition-all"
                  >
                    <Download size={20} /> DOWNLOAD NOW
                  </button>
                )}

                {(jobStatus === 'starting' || jobStatus === 'downloading') && (
                  <div className="space-y-3">
                    <div className="flex justify-between text-sm font-medium">
                      <span className="flex items-center gap-2">
                        {jobStatus === 'starting' ? (
                          <Clock className="text-purple-400 animate-pulse" size={16} />
                        ) : (
                          <Loader2 className="animate-spin text-purple-500" size={16} />
                        )}
                        {jobStatus === 'starting' ? 'Starting download... please wait' : 'Downloading...'}
                      </span>
                      <span>{jobStatus === 'starting' ? '--' : `${batchProgress.current}/${batchProgress.total}`}</span>
                    </div>
                    <div className="w-full bg-slate-900 rounded-full h-3 border border-slate-700 overflow-hidden">
                      <div 
                        className={clsx(
                          "h-full transition-all duration-500",
                          jobStatus === 'starting' 
                            ? "bg-gradient-to-r from-purple-500 to-pink-500 animate-pulse" 
                            : "bg-purple-500"
                        )}
                        style={{ width: jobStatus === 'starting' ? '30%' : `${progress}%` }}
                      ></div>
                    </div>
                  </div>
                )}

                {jobStatus === 'completed' && jobResult && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-green-400 font-bold justify-center text-lg">
                      <CheckCircle2 size={24} /> Download Ready!
                    </div>
                    <a 
                      href={jobResult.downloadUrl} 
                      download
                      className="w-full bg-green-600 hover:bg-green-500 text-white font-black py-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-green-900/20"
                    >
                      <Download size={20} /> SAVE FILE NOW
                    </a>
                    <button 
                      onClick={() => { setInfo(null); setUrl(''); setJobStatus(null); setJobResult(null); }}
                      className="w-full text-slate-500 hover:text-slate-300 text-sm font-medium transition-colors"
                    >
                      Download Another
                    </button>
                  </div>
                )}

                {jobStatus === 'failed' && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-red-400 font-bold justify-center">
                      <AlertCircle size={24} /> Download Failed
                    </div>
                    <button 
                      onClick={startDownload}
                      className="w-full bg-slate-700 hover:bg-slate-600 text-white font-black py-4 rounded-xl flex items-center justify-center gap-2 transition-all"
                    >
                      Retry Download
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Playlist View */}
        {info && isPlaylist && (
          <div className="mt-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-start gap-4 mb-6">
              {info.thumbnail && (
                <img 
                  src={info.thumbnail} 
                  alt={info.title} 
                  className="w-24 h-24 md:w-32 md:h-32 object-cover rounded-xl shadow-lg border border-slate-700 flex-shrink-0"
                />
              )}
              <div className="flex-1 min-w-0">
                <h2 className="text-xl md:text-2xl font-bold truncate mb-1">{info.title}</h2>
                <p className="text-slate-400 text-sm mb-2">
                  <ListMusic size={16} className="inline mr-1" />
                  {info.tracks.length} tracks
                </p>
                <div className="flex gap-2 flex-wrap">
                  <button 
                    onClick={() => setFormat('mp3')}
                    className={clsx(
                      "px-3 py-1 rounded-lg text-xs font-bold border-2 transition-all",
                      format === 'mp3' ? "border-purple-500 bg-purple-500/10 text-purple-400" : "border-slate-700 hover:border-slate-600"
                    )}
                  >
                    <Music size={12} className="inline mr-1" /> MP3
                  </button>
                  <button 
                    onClick={() => setFormat('mp4')}
                    className={clsx(
                      "px-3 py-1 rounded-lg text-xs font-bold border-2 transition-all",
                      format === 'mp4' ? "border-purple-500 bg-purple-500/10 text-purple-400" : "border-slate-700 hover:border-slate-600"
                    )}
                  >
                    <Video size={12} className="inline mr-1" /> MP4
                  </button>
                  <select 
                    value={quality}
                    onChange={(e) => setQuality(e.target.value)}
                    className="bg-slate-900 border-2 border-slate-700 rounded-lg py-1 px-2 text-xs focus:outline-none focus:border-purple-500"
                  >
                    <option value="best">Best</option>
                    <option value="192">192k</option>
                    <option value="128">128k</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Track Selection Controls */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex gap-2">
                <button 
                  onClick={selectAllTracks}
                  className="text-xs font-medium text-purple-400 hover:text-purple-300 flex items-center gap-1"
                >
                  <CheckSquare size={14} /> Select All
                </button>
                <button 
                  onClick={deselectAllTracks}
                  className="text-xs font-medium text-slate-500 hover:text-slate-300 flex items-center gap-1"
                >
                  <Square size={14} /> Deselect All
                </button>
              </div>
              <span className="text-xs text-slate-500">
                {selectedTracks.size} of {info.tracks.length} selected
              </span>
            </div>

            {/* Track List */}
            <div className="space-y-1 max-h-96 overflow-y-auto rounded-xl border border-slate-700 bg-slate-900/50">
              {info.tracks.map((track, index) => (
                <div 
                  key={index}
                  onClick={() => toggleTrack(index)}
                  className={clsx(
                    "flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors hover:bg-slate-700/50",
                    selectedTracks.has(index) ? "bg-purple-900/20 border-l-2 border-purple-500" : "border-l-2 border-transparent"
                  )}
                >
                  <div className="flex-shrink-0">
                    {selectedTracks.has(index) ? (
                      <CheckSquare size={18} className="text-purple-400" />
                    ) : (
                      <Square size={18} className="text-slate-600" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{track.title}</p>
                    <p className="text-xs text-slate-500 truncate">
                      {track.artist || ''}
                      {track.artist && track.duration ? ' · ' : ''}
                      {formatDuration(track.duration)}
                    </p>
                  </div>
                  <span className="text-xs text-slate-500 flex-shrink-0">{formatDuration(track.duration)}</span>
                </div>
              ))}
            </div>

            {/* Download Button */}
            <div className="mt-4">
              {!jobStatus && (
                <button 
                  onClick={startDownload}
                  disabled={selectedTracks.size === 0}
                  className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 disabled:from-slate-700 disabled:to-slate-700 disabled:text-slate-500 text-white font-black py-4 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-purple-900/20 transition-all"
                >
                  <Download size={20} /> 
                  {selectedTracks.size === info.tracks.length 
                    ? `DOWNLOAD ALL (${info.tracks.length} tracks)` 
                    : `DOWNLOAD SELECTED (${selectedTracks.size} tracks)`}
                </button>
              )}

              {/* Batch Progress */}
              {(jobStatus === 'starting' || jobStatus === 'downloading') && (
                <div className="space-y-3">
                  <div className="flex justify-between text-sm font-medium">
                    <span className="flex items-center gap-2">
                      {jobStatus === 'starting' ? (
                        <Clock className="text-purple-400 animate-pulse" size={16} />
                      ) : (
                        <Loader2 className="animate-spin text-purple-500" size={16} />
                      )}
                      {jobStatus === 'starting' ? 'Starting download... please wait' : `Downloading ${batchProgress.current}/${batchProgress.total}...`}
                    </span>
                    <span>{jobStatus === 'starting' ? '--' : `${progress}%`}</span>
                  </div>
                  <div className="w-full bg-slate-900 rounded-full h-3 border border-slate-700 overflow-hidden">
                    <div 
                      className={clsx(
                        "h-full transition-all duration-500",
                        jobStatus === 'starting' 
                          ? "bg-gradient-to-r from-purple-500 to-pink-500 animate-pulse" 
                          : "bg-purple-500"
                      )}
                      style={{ width: jobStatus === 'starting' ? '30%' : `${progress}%` }}
                    ></div>
                  </div>
                </div>
              )}

              {/* Batch Complete */}
              {jobStatus === 'completed' && jobResult && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-green-400 font-bold justify-center text-lg">
                    <CheckCircle2 size={24} /> Download Complete!
                  </div>
                  <div className="text-center text-sm text-slate-400">
                    {jobResult.successfulFiles} of {jobResult.totalFiles} files downloaded successfully
                    {jobResult.failedFiles > 0 && ` (${jobResult.failedFiles} failed)`}
                  </div>
                  <div className="bg-slate-900/80 border border-slate-700 rounded-xl p-4 flex flex-col gap-2">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-purple-600/20 rounded flex items-center justify-center text-purple-500 font-bold">AD</div>
                      <div className="flex-1">
                        <div className="text-sm font-bold text-slate-200">Recommended for you</div>
                        <div className="text-xs text-slate-500">Premium quality and faster speeds.</div>
                      </div>
                      <button className="text-[10px] uppercase font-bold tracking-wider px-2 py-1 border border-slate-600 text-slate-500 rounded hover:bg-slate-800 transition-colors">Sponsored</button>
                    </div>
                  </div>
                  <a 
                    href={jobResult.downloadUrl} 
                    download
                    className="w-full bg-green-600 hover:bg-green-500 text-white font-black py-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-green-900/20"
                  >
                    <Download size={20} /> DOWNLOAD ZIP ({Math.round(jobResult.zipSize / 1024 / 1024 * 10) / 10} MB)
                  </a>
                  <button 
                    onClick={() => { setInfo(null); setUrl(''); setJobStatus(null); setJobResult(null); }}
                    className="w-full text-slate-500 hover:text-slate-300 text-sm font-medium transition-colors"
                  >
                    Download Another
                  </button>
                </div>
              )}

              {jobStatus === 'failed' && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-red-400 font-bold justify-center">
                    <AlertCircle size={24} /> Download Failed
                  </div>
                  <button 
                    onClick={startDownload}
                    className="w-full bg-slate-700 hover:bg-slate-600 text-white font-black py-4 rounded-xl flex items-center justify-center gap-2 transition-all"
                  >
                    Retry Download
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Secondary Content */}
      <div className="grid md:grid-cols-3 gap-8">
        <div className="md:col-span-2 space-y-6">
          <h3 className="text-xl font-bold">Why use allmymusic?</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-slate-800/30 border border-slate-700 rounded-xl">
              <h4 className="font-bold text-purple-400 mb-1">Unified</h4>
              <p className="text-sm text-slate-500">One bar for YouTube, Spotify, and more.</p>
            </div>
            <div className="p-4 bg-slate-800/30 border border-slate-700 rounded-xl">
              <h4 className="font-bold text-purple-400 mb-1">Playlists</h4>
              <p className="text-sm text-slate-500">Download entire albums and playlists as ZIP.</p>
            </div>
            <div className="p-4 bg-slate-800/30 border border-slate-700 rounded-xl">
              <h4 className="font-bold text-purple-400 mb-1">No Limits</h4>
              <p className="text-sm text-slate-500">Completely free, no registration needed.</p>
            </div>
            <div className="p-4 bg-slate-800/30 border border-slate-700 rounded-xl">
              <h4 className="font-bold text-purple-400 mb-1">Secure</h4>
              <p className="text-sm text-slate-500">Safe, direct downloads from source.</p>
            </div>
          </div>
        </div>
        <div className="space-y-4">
          <div className="h-64 bg-slate-800/50 rounded-lg flex items-center justify-center border border-slate-700 border-dashed text-slate-500 text-sm">
            Sidebar Ad Placeholder
          </div>
        </div>
      </div>

      <footer className="mt-12 text-center text-slate-600 text-sm">
        &copy; 2026 allmymusic. Built with speed and privacy in mind.
      </footer>
    </div>
  )
}

export default App