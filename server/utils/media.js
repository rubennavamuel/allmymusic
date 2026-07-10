const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');

const DOWNLOAD_DIR = path.join(__dirname, '..', 'public', 'downloads');
const ZIP_DIR = path.join(__dirname, '..', 'public', 'zips');

if (!fs.existsSync(DOWNLOAD_DIR)) {
  fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
}
if (!fs.existsSync(ZIP_DIR)) {
  fs.mkdirSync(ZIP_DIR, { recursive: true });
}

function isSpotifyUrl(url) {
  return /open\.spotify\.com\/(track|album|playlist)/.test(url);
}

function isYoutubePlaylist(url) {
  return /youtube\.com\/.*\b(list=|playlist\b)|youtu\.be\/.*\b(list=|playlist\b)/i.test(url) || /\/playlist\b/.test(url);
}

async function getInfo(url) {
  if (isSpotifyUrl(url)) {
    const info = await getSpotifyInfo(url);
    info.isPlaylist = info.tracks && info.tracks.length > 1;
    return info;
  } else if (isYoutubePlaylist(url)) {
    return getYtdlpPlaylistInfo(url);
  } else {
    const info = await getYtdlpInfo(url);
    info.isPlaylist = false;
    return info;
  }
}

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36';

function getYtdlpInfo(url) {
  return new Promise((resolve, reject) => {
    console.log(`[${new Date().toISOString()}] Running yt-dlp info for ${url}`);
    const child = spawn('yt-dlp', [
      '-j', 
      '--simulate', 
      '--js-runtime', 'node',
      '--user-agent', USER_AGENT,
      '--no-check-certificate',
      url
    ]);
    let stdout = '';
    let stderr = '';

    // Add a 60-second timeout inside the promise
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error('yt-dlp info fetch timed out after 60s'));
    }, 60000);

    child.stdout.on('data', (data) => {
      stdout += data;
    });

    child.stderr.on('data', (data) => {
      stderr += data;
    });

    child.on('close', (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        console.error(`[${new Date().toISOString()}] yt-dlp failed for ${url}. Stderr: ${stderr}`);
        return reject(new Error(`yt-dlp failed with code ${code}: ${stderr}`));
      }
      try {
        const info = JSON.parse(stdout);
        resolve({
          title: info.title,
          thumbnail: info.thumbnail,
          duration: info.duration,
          formats: info.formats ? info.formats.map(f => ({
            formatId: f.format_id,
            ext: f.ext,
            resolution: f.resolution,
            filesize: f.filesize,
            vcodec: f.vcodec,
            acodec: f.acodec
          })) : [],
          uploader: info.uploader,
          url: info.webpage_url,
          source: 'yt-dlp',
          tracks: [],
          isPlaylist: false
        });
      } catch (err) {
        console.error(`[${new Date().toISOString()}] Failed to parse yt-dlp output for ${url}:`, err);
        reject(err);
      }
    });
  });
}

function getYtdlpPlaylistInfo(url) {
  return new Promise((resolve, reject) => {
    console.log(`[${new Date().toISOString()}] Running yt-dlp playlist info for ${url}`);
    // Use --flat-playlist to get list of videos without downloading details
    const child = spawn('yt-dlp', [
      '-J', 
      '--flat-playlist',
      '--js-runtime', 'node',
      '--user-agent', USER_AGENT,
      '--no-check-certificate',
      url
    ]);
    let stdout = '';
    let stderr = '';

    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error('yt-dlp playlist info fetch timed out after 60s'));
    }, 60000);

    child.stdout.on('data', (data) => {
      stdout += data;
    });

    child.stderr.on('data', (data) => {
      stderr += data;
    });

    child.on('close', (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        console.error(`[${new Date().toISOString()}] yt-dlp playlist failed for ${url}. Stderr: ${stderr}`);
        return reject(new Error(`yt-dlp playlist failed with code ${code}: ${stderr}`));
      }
      try {
        const info = JSON.parse(stdout);
        const entries = info.entries || [];
        const tracks = entries.map(entry => ({
          title: entry.title || 'Unknown',
          url: entry.url || entry.webpage_url || '',
          duration: entry.duration || 0,
          thumbnail: entry.thumbnail || info.thumbnail || '',
          source: 'yt-dlp'
        }));
        
        resolve({
          title: info.title || 'YouTube Playlist',
          thumbnail: info.thumbnail || (tracks.length > 0 ? tracks[0].thumbnail : ''),
          uploader: info.uploader || '',
          url: info.webpage_url || url,
          source: 'yt-dlp',
          tracks: tracks,
          isPlaylist: true
        });
      } catch (err) {
        console.error(`[${new Date().toISOString()}] Failed to parse yt-dlp playlist output for ${url}:`, err);
        reject(err);
      }
    });
  });
}

function getSpotifyInfo(url) {
  return new Promise((resolve, reject) => {
    const tempFile = path.join(DOWNLOAD_DIR, `meta_${Date.now()}.spotdl`);
    console.log(`[${new Date().toISOString()}] Running spotdl save for ${url} into ${tempFile}`);
    const child = spawn('spotdl', ['save', url, '--save-file', tempFile]);
    let stderr = '';

    // Add a 60-second timeout inside the promise
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error('spotdl info fetch timed out after 60s'));
    }, 60000);

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    child.on('close', (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        console.error(`[${new Date().toISOString()}] spotdl save failed for ${url}. Code: ${code}. Stderr: ${stderr}`);
        return reject(new Error(`spotdl failed with code ${code}: ${stderr}`));
      }
      try {
        if (!fs.existsSync(tempFile)) {
          throw new Error('spotdl metadata file was not created');
        }
        const data = fs.readFileSync(tempFile, 'utf8');
        const info = JSON.parse(data);
        fs.unlinkSync(tempFile); // Clean up
        
        console.log(`[${new Date().toISOString()}] Successfully parsed spotdl metadata for ${url}`);
        
        // Spotdl returns an array of tracks
        const tracks = info.map(t => ({
          title: t.name,
          artist: t.artist,
          album: t.album_name,
          thumbnail: t.cover_url,
          duration: t.duration,
          url: t.url,
          source: 'spotdl'
        }));

        resolve({
          title: tracks.length === 1 ? tracks[0].title : 'Spotify Playlist/Album',
          tracks: tracks,
          thumbnail: tracks.length > 0 ? tracks[0].thumbnail : null,
          source: 'spotdl'
        });
      } catch (err) {
        console.error(`[${new Date().toISOString()}] Failed to process spotdl output for ${url}:`, err);
        reject(err);
      }
    });
  });
}

async function download(url, options = {}, onProgress) {
  if (isSpotifyUrl(url)) {
    return downloadSpotify(url, options, onProgress);
  } else {
    return downloadYtdlp(url, options, onProgress);
  }
}

function sanitizeFilename(filename) {
  return filename.replace(/[^a-z0-9]/gi, '_').toLowerCase();
}

function downloadYtdlp(url, options, onProgress) {
  return new Promise((resolve, reject) => {
    const { format = 'mp4', quality = 'best', title } = options;
    const isAudio = format === 'mp3';
    const ext = isAudio ? 'mp3' : 'mp4';
    
    // Use yt-dlp's built-in %(title)s template so the actual video title is used
    // --print after_move:filepath prints the final file path so we know what was created
    const outputTemplate = path.join(DOWNLOAD_DIR, '%(title)s.%(ext)s');

    const args = [
      '-o', outputTemplate,
      '--print', 'after_move:filepath',
      '--js-runtime', 'node',
      '--user-agent', USER_AGENT,
      '--no-check-certificate',
    ];

    if (isAudio) {
      args.push('--extract-audio', '--audio-format', 'mp3');
      args.push('-f', 'bestaudio/best');
    } else {
      args.push('-f', quality === 'best' ? 'bestvideo+bestaudio/best' : 'best');
      args.push('--merge-output-format', 'mp4');
    }

    args.push(url);

    const child = spawn('yt-dlp', args);
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
      // Extract progress from stdout (yt-dlp outputs progress here when --print is used)
      const line = data.toString();
      const match = line.match(/(\d+\.?\d*)%/);
      if (match && onProgress) {
        onProgress(parseFloat(match[1]));
      }
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
      // Also try to extract progress from stderr
      const line = data.toString();
      const match = line.match(/(\d+\.?\d*)%/);
      if (match && onProgress) {
        onProgress(parseFloat(match[1]));
      }
    });

    child.on('close', (code) => {
      if (code === 0) {
        // The last line of stdout should contain the actual file path from --print after_move:filepath
        const lines = stdout.trim().split('\n').filter(l => l.trim());
        const actualPath = lines[lines.length - 1] || '';
        if (actualPath && fs.existsSync(actualPath)) {
          const filename = path.basename(actualPath);
          resolve({ filename, outputPath: actualPath });
        } else {
          // Fallback: find the newest file in the download directory
          const files = fs.readdirSync(DOWNLOAD_DIR)
            .filter(f => !f.startsWith('.') && f !== '.gitkeep')
            .map(f => ({ name: f, time: fs.statSync(path.join(DOWNLOAD_DIR, f)).mtime.getTime() }))
            .sort((a, b) => b.time - a.time);
          if (files.length > 0) {
            const filename = files[0].name;
            resolve({ filename, outputPath: path.join(DOWNLOAD_DIR, filename) });
          } else {
            reject(new Error('Download completed but could not find the output file'));
          }
        }
      } else {
        console.error('yt-dlp error output:', stderr);
        reject(new Error(`yt-dlp download failed with code ${code}`));
      }
    });
  });
}

function downloadSpotify(url, options, onProgress) {
  return new Promise((resolve, reject) => {
    const { format = 'mp3' } = options;
    // spotdl downloads to current directory by default
    // We can use --output to specify template or directory
    const outputTemplate = path.join(DOWNLOAD_DIR, '{title} - {artist}.{output-ext}');
    
    const args = [
      'download', url,
      '--format', format,
      '--output', outputTemplate
    ];

    const child = spawn('spotdl', args);
    let stderr = '';

    child.stdout.on('data', (data) => {
      const line = data.toString();
      // spotdl progress is a bit different, but let's try to find percentages
      const match = line.match(/(\d+)%/);
      if (match && onProgress) {
        onProgress(parseInt(match[1]));
      }
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      if (code === 0) {
        // Find the most recently created file in DOWNLOAD_DIR
        const files = fs.readdirSync(DOWNLOAD_DIR)
          .filter(f => !f.startsWith('.') && f !== '.gitkeep')
          .map(f => ({ name: f, time: fs.statSync(path.join(DOWNLOAD_DIR, f)).mtime.getTime() }))
          .sort((a, b) => b.time - a.time);

        if (files.length > 0) {
          const filename = files[0].name;
          resolve({ filename, outputPath: path.join(DOWNLOAD_DIR, filename) });
        } else {
          resolve({ message: 'Download complete', directory: DOWNLOAD_DIR });
        }
      } else {
        console.error('spotdl error output:', stderr);
        reject(new Error(`spotdl download failed with code ${code}`));
      }
    });
  });
}

async function downloadBatch(urls, options = {}, onProgress) {
  const results = [];
  const total = urls.length;
  
  for (let i = 0; i < total; i++) {
    const url = urls[i];
    console.log(`[${new Date().toISOString()}] Batch download ${i + 1}/${total}: ${url}`);
    
    try {
      const result = await download(url, options, (progress) => {
        if (onProgress) {
          // Overall progress: (i/total) + (progress/100 * 1/total)
          const overall = ((i / total) + (progress / 100 * (1 / total))) * 100;
          onProgress(Math.round(overall), i + 1, total);
        }
      });
      results.push(result);
    } catch (err) {
      console.error(`[${new Date().toISOString()}] Batch download failed for ${url}:`, err);
      results.push({ error: err.message, url });
    }
  }
  
  return results;
}

function createZipFromFiles(files, zipName) {
  return new Promise((resolve, reject) => {
    const zipPath = path.join(ZIP_DIR, zipName);
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 5 } });

    output.on('close', () => {
      console.log(`[${new Date().toISOString()}] ZIP created: ${zipPath} (${archive.pointer()} bytes)`);
      resolve({ zipPath, zipName, size: archive.pointer() });
    });

    archive.on('error', (err) => {
      reject(err);
    });

    archive.pipe(output);

    files.forEach(file => {
      if (file.outputPath && fs.existsSync(file.outputPath)) {
        archive.file(file.outputPath, { name: file.filename || path.basename(file.outputPath) });
      }
    });

    archive.finalize();
  });
}

module.exports = {
  getInfo,
  isSpotifyUrl,
  isYoutubePlaylist,
  download,
  downloadBatch,
  createZipFromFiles,
  DOWNLOAD_DIR,
  ZIP_DIR
};
