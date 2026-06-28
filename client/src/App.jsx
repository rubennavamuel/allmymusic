import { useState, useEffect } from 'react'
import { Search, Download, Music, Video, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
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

    try {
      const res = await fetch('/api/info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });
      const data = await res.json();
      if (res.ok) {
        setInfo(data);
      } else {
        setError(data.error || 'Failed to fetch media info');
      }
    } catch (err) {
      setError('Connection error. Is the server running?');
    } finally {
      setLoading(false);
    }
  };

  const startDownload = async () => {
    setError(null);
    setJobStatus('starting');
    try {
      const res = await fetch('/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, format, quality })
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
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-12 flex flex-col gap-8">
      {/* Header & Ads Placeholder */}
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

        {error && (
          <div className="mt-4 p-4 bg-red-900/30 border border-red-800 text-red-200 rounded-xl flex items-center gap-3">
            <AlertCircle size={20} />
            {error}
          </div>
        )}

        {/* Media Info Card */}
        {info && (
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
                        <Loader2 className="animate-spin text-purple-500" size={16} />
                        {jobStatus === 'starting' ? 'Preparing...' : 'Downloading...'}
                      </span>
                      <span>{progress}%</span>
                    </div>
                    <div className="w-full bg-slate-900 rounded-full h-3 border border-slate-700 overflow-hidden">
                      <div 
                        className="bg-purple-500 h-full transition-all duration-300"
                        style={{ width: `${progress}%` }}
                      ></div>
                    </div>
                  </div>
                )}

                {jobStatus === 'completed' && jobResult && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-green-400 font-bold justify-center text-lg">
                      <CheckCircle2 size={24} /> Download Ready!
                    </div>
                    
                    {/* Download Complete Ad Placeholder */}
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
      </main>

      {/* Secondary Content / Ads */}
      <div className="grid md:grid-cols-3 gap-8">
        <div className="md:col-span-2 space-y-6">
          <h3 className="text-xl font-bold">Why use allmymusic?</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-slate-800/30 border border-slate-700 rounded-xl">
              <h4 className="font-bold text-purple-400 mb-1">Unified</h4>
              <p className="text-sm text-slate-500">One bar for YouTube, Spotify, and more.</p>
            </div>
            <div className="p-4 bg-slate-800/30 border border-slate-700 rounded-xl">
              <h4 className="font-bold text-purple-400 mb-1">High Quality</h4>
              <p className="text-sm text-slate-500">Up to 320kbps audio and 4K video.</p>
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
