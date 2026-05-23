const { execSync } = require('child_process');
const fs = require('fs');

const ytDlpPath = '/tmp/yt-dlp';

try {
  if (!fs.existsSync(ytDlpPath)) {
    console.log('Downloading yt-dlp to /tmp...');
    execSync(`curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o ${ytDlpPath}`, { stdio: 'inherit' });
    execSync(`chmod +x ${ytDlpPath}`, { stdio: 'inherit' });
    console.log('yt-dlp downloaded to /tmp/yt-dlp');
  } else {
    console.log('yt-dlp already exists at /tmp/yt-dlp');
  }
} catch (error) {
  console.error('Failed to setup yt-dlp:', error.message);
  process.exit(1);
}