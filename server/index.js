console.log("ALLMYMUSIC_SERVER_START_V1");
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { getInfo, download, DOWNLOAD_DIR } = require('./utils/media');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`);
  next();
});

// API routes
const jobs = {};

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running', timestamp: new Date().toISOString() });
});

app.post('/api/info', async (req, res) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  try {
    const info = await getInfo(url);
    res.json(info);
  } catch (err) {
    console.error('Error getting info:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/download', async (req, res) => {
  const { url, format, quality } = req.body;
  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  const options = { format, quality };
  const jobId = Date.now().toString();
  jobs[jobId] = { status: 'starting', progress: 0, createdAt: Date.now() };

  download(url, options, (progress) => {
    if (jobs[jobId]) {
      jobs[jobId].progress = progress;
      jobs[jobId].status = 'downloading';
    }
  }).then((result) => {
    if (jobs[jobId]) {
      jobs[jobId].status = 'completed';
      jobs[jobId].result = {
        ...result,
        downloadUrl: `/downloads/${result.filename}`
      };
      jobs[jobId].completedAt = Date.now();
    }
  }).catch((err) => {
    console.error(`Download failed for job ${jobId}:`, err);
    if (jobs[jobId]) {
      jobs[jobId].status = 'failed';
      jobs[jobId].error = err.message;
    }
  });

  res.json({ jobId });
});

app.get('/api/job/:id', (req, res) => {
  const job = jobs[req.params.id];
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }
  res.json(job);
});

// Static files (downloads)
app.use('/downloads', express.static(DOWNLOAD_DIR));

// Frontend static files (built assets)
const distPath = path.join(__dirname, '../client/dist');
console.log(`Static dist path: ${distPath}`);
if (fs.existsSync(distPath)) {
  console.log("Dist path exists");
  console.log("Contents:", fs.readdirSync(distPath));
} else {
  console.log("Dist path DOES NOT exist");
}
app.use(express.static(distPath));

// Fallback to index.html for SPA routing
app.use((req, res) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/downloads')) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.sendFile(path.join(__dirname, '../client/dist/index.html'));
});

// Cleanup old jobs and files
setInterval(() => {
  const now = Date.now();
  const MAX_AGE = 1000 * 60 * 60; // 1 hour
  
  Object.keys(jobs).forEach(jobId => {
    if (now - jobs[jobId].createdAt > MAX_AGE) {
      delete jobs[jobId];
    }
  });

  if (fs.existsSync(DOWNLOAD_DIR)) {
    fs.readdirSync(DOWNLOAD_DIR).forEach(file => {
      if (file === '.gitkeep' || file.startsWith('.')) return;
      const filePath = path.join(DOWNLOAD_DIR, file);
      const stats = fs.statSync(filePath);
      if (now - stats.mtimeMs > MAX_AGE) {
        console.log(`Cleaning up old file: ${file}`);
        fs.unlinkSync(filePath);
      }
    });
  }
}, 1000 * 60 * 10);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is listening on http://0.0.0.0:${PORT}`);
});
