const express = require('express');
const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Path para sa cookies.txt
const cookiesPath = path.join(__dirname, 'cookies.txt');

// Helper function para i-check kung may cookies.txt
function getCookiesArg() {
  return fs.existsSync(cookiesPath) ? ['--cookies', cookiesPath] : [];
}

// API Endpoint 1: Get Video Details
app.post('/api/info', (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'No URL provided.' });

  const args = [
    '-j', 
    '--no-warnings', 
    ...getCookiesArg(), 
    '--extractor-args', 'youtube:player-client=android,web', 
    url
  ];

  execFile('yt-dlp', args, { maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
    if (error) {
      const actualError = stderr || error.message || 'Unknown error';
      console.error('yt-dlp inspect error:', actualError);
      return res.status(400).json({ error: `yt-dlp failed: ${actualError}` });
    }
    try {
      let info = JSON.parse(stdout);
      if (info.entries && info.entries.length > 0) info = info.entries[0];
      res.json({
        title: info.title || 'Unknown Title',
        thumbnail: info.thumbnail || '',
        uploader: info.uploader || info.uploader_id || 'Creator'
      });
    } catch (e) {
      res.status(500).json({ error: 'Failed to parse video metadata.' });
    }
  });
});

// API Endpoint 2: Download File
app.post('/api/download', (req, res) => {
  const { url, format } = req.body;
  if (!url) return res.status(400).json({ error: 'Please provide a valid URL!' });

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dl-'));
  const outputTemplate = path.join(tempDir, '%(title)s.%(ext)s');

  let baseArgs = [...getCookiesArg(), '--extractor-args', 'youtube:player-client=android,web'];

  let args = [];
  if (format === 'mp3') {
    args = ['-x', '--audio-format', 'mp3', '--audio-quality', '192K', ...baseArgs, '-o', outputTemplate, url];
  } else if (format === 'mp4') {
    args = ['-f', 'best[ext=mp4]/best', ...baseArgs, '-o', outputTemplate, url];
  } else { // combined
    args = ['-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best', '--merge-output-format', 'mp4', ...baseArgs, '-o', outputTemplate, url];
  }

  execFile('yt-dlp', args, { maxBuffer: 1024 * 1024 * 50 }, (error, stdout, stderr) => {
    if (error) {
      fs.rmSync(tempDir, { recursive: true, force: true });
      const actualError = stderr || error.message || 'Unknown error';
      console.error('Download error:', actualError);
      return res.status(500).json({ error: `Download failed: ${actualError}` });
    }

    const files = fs.readdirSync(tempDir);
    if (files.length === 0) {
      fs.rmSync(tempDir, { recursive: true, force: true });
      return res.status(500).json({ error: 'No downloaded file found.' });
    }

    const filePath = path.join(tempDir, files[0]);

    res.download(filePath, files[0], () => {
      fs.rmSync(tempDir, { recursive: true, force: true });
    });
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
