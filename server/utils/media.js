const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const DOWNLOAD_DIR = path.join(__dirname, '..', 'public', 'downloads');

if (!fs.existsSync(DOWNLOAD_DIR)) {
  fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
}

function isSpotifyUrl(url) {
  return /open\.spotify\.com\/(track|album|playlist)/.test(url);
}

async function getInfo(url) {
  if (isSpotifyUrl(url)) {
    return getSpotifyInfo(url);
  } else {
    return getYtdlpInfo(url);
  }
}

function getYtdlpInfo(url) {
  return new Promise((resolve, reject) => {
    const child = spawn('yt-dlp', ['-j', '--simulate', url]);
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data;
    });

    child.stderr.on('data', (data) => {
      stderr += data;
    });

    child.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(`yt-dlp failed with code ${code}: ${stderr}`));
      }
      try {
        const info = JSON.parse(stdout);
        resolve({
          title: info.title,
          thumbnail: info.thumbnail,
          duration: info.duration,
          formats: info.formats.map(f => ({
            formatId: f.format_id,
            ext: f.ext,
            resolution: f.resolution,
            filesize: f.filesize,
            vcodec: f.vcodec,
            acodec: f.acodec
          })),
          uploader: info.uploader,
          url: info.webpage_url,
          source: 'yt-dlp'
        });
      } catch (err) {
        reject(err);
      }
    });
  });
}

function getSpotifyInfo(url) {
  return new Promise((resolve, reject) => {
    const tempFile = path.join(DOWNLOAD_DIR, `meta_${Date.now()}.spotdl`);
    const child = spawn('spotdl', ['save', url, '--save-file', tempFile]);
    
    child.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(`spotdl failed with code ${code}`));
      }
      try {
        const data = fs.readFileSync(tempFile, 'utf8');
        const info = JSON.parse(data);
        fs.unlinkSync(tempFile); // Clean up
        
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
          source: 'spotdl'
        });
      } catch (err) {
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

function downloadYtdlp(url, options, onProgress) {
  return new Promise((resolve, reject) => {
    const { format = 'mp4', quality = 'best' } = options;
    const isAudio = format === 'mp3';
    const ext = isAudio ? 'mp3' : 'mp4';
    const jobId = Date.now();
    const filename = `dl_${jobId}.${ext}`;
    const outputPath = path.join(DOWNLOAD_DIR, filename);

    const args = [
      '-o', outputPath,
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

    child.stdout.on('data', (data) => {
      const line = data.toString();
      // Simple regex to extract progress
      const match = line.match(/(\d+\.?\d*)%/);
      if (match && onProgress) {
        onProgress(parseFloat(match[1]));
      }
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ filename, outputPath });
      } else {
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

    child.stdout.on('data', (data) => {
      const line = data.toString();
      // spotdl progress is a bit different, but let's try to find percentages
      const match = line.match(/(\d+)%/);
      if (match && onProgress) {
        onProgress(parseInt(match[1]));
      }
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
        reject(new Error(`spotdl download failed with code ${code}`));
      }
    });
  });
}

module.exports = {
  getInfo,
  isSpotifyUrl,
  download,
  DOWNLOAD_DIR
};
