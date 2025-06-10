const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');
const detectChrome = require('../utils/detectChrome');
const { spawn } = require('child_process');
const { app } = require('electron');

// Enhanced FFmpeg path resolution for packaged apps
function getFFmpegPath() {
  try {
    // Try the standard @ffmpeg-installer path first
    const standardPath = require('@ffmpeg-installer/ffmpeg').path;
    
    // In development mode, this should work fine
    if (fs.existsSync(standardPath)) {
      console.log(`[FFmpeg] Using standard path: ${standardPath}`);
      return standardPath;
    }
  } catch (err) {
    console.log(`[FFmpeg] Standard path failed: ${err.message}`);
  }

  // For packaged apps, check the unpacked location
  try {
    const appPath = app.getAppPath();
    const unpackedPath = path.join(
      path.dirname(appPath), 
      'app.asar.unpacked', 
      'server-node', 
      'node_modules', 
      '@ffmpeg-installer', 
      'ffmpeg.exe'
    );
    
    if (fs.existsSync(unpackedPath)) {
      console.log(`[FFmpeg] Using unpacked path: ${unpackedPath}`);
      return unpackedPath;
    }
  } catch (err) {
    console.log(`[FFmpeg] Unpacked path failed: ${err.message}`);
  }

  // Try platform-specific paths as fallback
  const platform = require('os').platform();
  const possiblePaths = [];
  
  if (platform === 'win32') {
    possiblePaths.push(
      'C:/ffmpeg/bin/ffmpeg.exe',
      'C:/Program Files/ffmpeg/bin/ffmpeg.exe'
    );
  } else if (platform === 'darwin') {
    possiblePaths.push(
      '/usr/local/bin/ffmpeg',
      '/opt/homebrew/bin/ffmpeg'
    );
  } else {
    possiblePaths.push(
      '/usr/bin/ffmpeg',
      '/usr/local/bin/ffmpeg'
    );
  }

  for (const testPath of possiblePaths) {
    if (fs.existsSync(testPath)) {
      console.log(`[FFmpeg] Using system path: ${testPath}`);
      return testPath;
    }
  }

  throw new Error('FFmpeg executable not found. Please install FFmpeg or check your installation.');
}

// Directories for scripts and generated media
const SCRIPTS_DIR = path.join(app.getPath('userData'), 'scripts');
const MEDIA_DIR   = path.join(app.getPath('userData'), 'media', 'videos');

/**
 * Renders a p5.js sketch to a video file.
 * @param {string} code  - The JavaScript p5.js code (sketch.js content)
 * @param {string} runId - Unique identifier for this render job
 * @param {function(string):void} [logFn] - Optional logging callback
 * @param {number} [durationSecs=4] - Duration of the video in seconds
 * @returns {Promise<string>} - Resolves to the path of the generated MP4
 */
async function generateWithP5(code, runId, logFn = () => {}, durationSecs = 4) {
  // 1) Ensure output directories exist
  if(!fs.existsSync(SCRIPTS_DIR)) fs.mkdirSync(SCRIPTS_DIR, { recursive: true });
  if(!fs.existsSync(MEDIA_DIR)) fs.mkdirSync(MEDIA_DIR, { recursive: true });
  const outDir = path.join(MEDIA_DIR, runId);
  if(!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  // 2) Write HTML wrapper and sketch file
  const sketchPath = path.join(SCRIPTS_DIR, `${runId}.js`);
  fs.writeFileSync(sketchPath, code);

  const html = `
<!DOCTYPE html>
<html>
  <head>
    <script src="https://cdn.jsdelivr.net/npm/p5@1.6.0/lib/p5.min.js"></script>
  </head>
  <body>
    <script>
      ${code}
    </script>
  </body>
</html>
`;
  const htmlPath = path.join(SCRIPTS_DIR, `${runId}.html`);
  fs.writeFileSync(htmlPath, html);

  // 3) Detect Chrome
  let chromePath;
  try {
    chromePath = await detectChrome();
    logFn(`Found Chrome at ${chromePath}`);
  } catch (err) {
    logFn(`Chrome detection failed: ${err.message}`);
    throw err;
  }

  // 4) Launch browser & load
  const browser = await puppeteer.launch({ executablePath: chromePath, headless: true });
  const page = await browser.newPage();
  await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle0' });
  await page.waitForFunction('typeof frameCount === "number"');

  // 5) Capture frames
  const framesDir = path.join(outDir, 'frames');
  fs.mkdirSync(framesDir, { recursive: true });
  // Determine total frames based on duration (seconds) and frame rate
  const frameRateValue = 30;
  const totalFrames = durationSecs * frameRateValue;
  for (let i = 0; i < totalFrames; i++) {
    const imgPath = path.join(framesDir, `${String(i).padStart(4, '0')}.png`);
    await page.screenshot({ path: imgPath });
    await page.evaluate('draw()');
    logFn(`Captured frame ${i + 1}/${totalFrames}`);
  }
  await browser.close();

  // 6) Encode with FFmpeg - using enhanced path resolution
  const framesPattern = path.join(framesDir, '%04d.png');
  const tempOutputPath = path.join(outDir, 'animation.mp4');
  const finalOutputPath = path.join(MEDIA_DIR, `${runId}.mp4`);
  
  // Get FFmpeg path with enhanced resolution
  let ffmpegPath;
  try {
    ffmpegPath = getFFmpegPath();
    logFn(`Using FFmpeg at: ${ffmpegPath}`);
  } catch (err) {
    logFn(`FFmpeg detection failed: ${err.message}`);
    throw err;
  }
  
  const ffArgs = [
    '-y', '-framerate', '30',
    '-i', framesPattern,
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
    tempOutputPath
  ];
  await new Promise((resolve, reject) => {
    const ffProc = spawn(ffmpegPath, ffArgs);
    ffProc.stderr.on('data', d => logFn(`ffmpeg: ${d}`));
    ffProc.on('close', code => code === 0 ? resolve() : reject(new Error('ffmpeg error')));
  });
  logFn('Video encoding complete');

  // 7) Move video to final location and cleanup temporary directory
  fs.copyFileSync(tempOutputPath, finalOutputPath);
  fs.rmSync(outDir, { recursive: true, force: true });
  logFn(`Video saved to ${finalOutputPath}`);

  // 8) Return final video path
  return finalOutputPath;
}

module.exports = { generateWithP5 }; 