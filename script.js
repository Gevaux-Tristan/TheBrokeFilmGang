const canvas = document.getElementById("previewCanvas");
const ctx = canvas.getContext("2d", { willReadFrequently: true });
let fullResImage = null;
let lutData = null;
let leakImage = null;
let originalImageDataUrl = null;

// Utility functions
function applyContrast(value, factor) {
  // Ensure value is between 0 and 1
  value = Math.max(0, Math.min(1, value));
  
  // Apply contrast using a sigmoid-like curve
  // factor > 0 increases contrast, factor < 0 decreases contrast
  const center = 0.5;
  const range = 0.5;
  
  // Normalize the value to -1 to 1 range
  const normalized = (value - center) / range;
  
  // Apply contrast using a sigmoid-like curve
  const contrasted = normalized * (1 + factor) / (1 + Math.abs(normalized) * factor);
  
  // Convert back to 0-1 range
  return Math.max(0, Math.min(1, contrasted * range + center));
}

const dropZone = document.getElementById('dropZone');
const previewPanel = document.getElementById('previewPanel');
const imageUpload = document.getElementById('imageUpload');

// --- GESTION DU DROPZONE TOUJOURS ACTIF ET AU-DESSUS DU CANVAS ---
dropZone.style.zIndex = 10; // Toujours au-dessus du canvas

// Affichage dynamique du nom du fichier choisi
const fileNameDisplay = document.getElementById('fileNameDisplay');

['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
  dropZone.addEventListener(eventName, preventDefaults, false);
  // document.body.addEventListener(eventName, preventDefaults, false); // Removed to prevent scroll interference
});

function preventDefaults(e) {
  e.preventDefault();
  e.stopPropagation();
}

['dragenter', 'dragover'].forEach(eventName => {
  dropZone.addEventListener(eventName, highlight, false);
});

['dragleave', 'drop'].forEach(eventName => {
  dropZone.addEventListener(eventName, unhighlight, false);
});

function highlight(e) {
  dropZone.classList.add('drag-over');
}

function unhighlight(e) {
  dropZone.classList.remove('drag-over');
}

dropZone.addEventListener('drop', handleDrop, false);
dropZone.addEventListener('click', () => imageUpload.click());

function handleDrop(e) {
  const dt = e.dataTransfer;
  const files = dt.files;
  handleFiles(files);
}

imageUpload.addEventListener('change', (e) => {
  handleFiles(e.target.files);
});

function showDropZone() {
  dropZone.style.display = '';
  dropZone.style.opacity = '1';
  dropZone.style.pointerEvents = 'auto';
}

function hideDropZone() {
  dropZone.style.display = 'none';
  dropZone.style.opacity = '0';
  dropZone.style.pointerEvents = 'none';
}

function handleFiles(files) {
  if (files.length > 0) {
    const file = files[0];
    if (file.type.startsWith('image/')) {
      console.log('Starting to load image:', file.name);
      const reader = new FileReader();
      reader.onload = (e) => {
        console.log('FileReader loaded image data');
        originalImageDataUrl = e.target.result; // Sauvegarde l'image d'origine
        const img = new Image();
        img.onload = () => {
          console.log('Image loaded successfully:', img.width, 'x', img.height);
          fullResImage = img;
          leakImage = null; // Remove any previous light leak
          // Appliquer automatiquement Portra 160
          document.getElementById('filmSelect').value = 'kodak_portra_160';
          document.getElementById('filmSelect').dispatchEvent(new Event('change'));
          applyEffects();
        };
        img.onerror = (error) => {
          console.error('Error loading image:', error);
        };
        img.src = e.target.result;
      };
      reader.onerror = (error) => {
        console.error('Error reading file:', error);
      };
      reader.readAsDataURL(file);
    }
  } else {
    if (fileNameDisplay) fileNameDisplay.textContent = 'Aucun fichier choisi';
  }
}

// Window resize: only call applyEffects
window.addEventListener('resize', () => {
  if (fullResImage) applyEffects();
});

// Ajouter une variable pour stocker le LUT actuel
let currentLutName = 'kodak_portra_160';

// Ajouter un cache pour les LUTs
const lutCache = new Map();

// Détection mobile
const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
const MOBILE_MAX_WIDTH = 1080; // Reduced from 1200 for better performance
const MOBILE_MAX_HEIGHT = 1080;
const DESKTOP_MAX_WIDTH = 2048;
const DESKTOP_MAX_HEIGHT = 2048;

// Instagram recommended sizes:
// Stories: 1080x1920
// Feed: 1080x1080 (square), 1080x1350 (portrait), 1080x566 (landscape)
const EXPORT_MAX_WIDTH = 1080;
const EXPORT_MAX_HEIGHT = 1350;

// Increase throttle delay for better performance
const THROTTLE_DELAY = isMobile ? 250 : 50; // Increased delay on mobile

// Optimize throttling function
function createThrottledHandler(callback) {
  let timeoutId = null;
  let lastRun = 0;
  
  return function(...args) {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    const now = Date.now();
    const timeSinceLastRun = now - lastRun;

    if (timeSinceLastRun >= THROTTLE_DELAY) {
      callback.apply(this, args);
      lastRun = now;
    } else {
      timeoutId = setTimeout(() => {
        callback.apply(this, args);
        lastRun = Date.now();
      }, THROTTLE_DELAY - timeSinceLastRun);
    }
  };
}

// Optimize image processing
function processImageEffects(ctx, width, height, isExport = false) {
  // Get image data for processing
  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;
  const originalData = new Uint8ClampedArray(data);

  // Apply LUT first if present and intensity > 0
  if (lutData && lutIntensity > 0) {
    try {
      for (let i = 0; i < data.length; i += 4) {
        const r = originalData[i] / 255;
        const g = originalData[i + 1] / 255;
        const b = originalData[i + 2] / 255;

        const newColor = trilinearLUTLookup(lutData, r, g, b);
        
        data[i] = Math.round(originalData[i] * (1 - lutIntensity) + newColor[0] * 255 * lutIntensity);
        data[i + 1] = Math.round(originalData[i + 1] * (1 - lutIntensity) + newColor[1] * 255 * lutIntensity);
        data[i + 2] = Math.round(originalData[i + 2] * (1 - lutIntensity) + newColor[2] * 255 * lutIntensity);
      }
    } catch (error) {
      console.error("Error applying LUT:", error);
      data.set(originalData);
    }
  }

  // Apply exposure and contrast with higher precision
  if (exposureAmount !== 0 || contrastAmount !== 0) {
    for (let i = 0; i < data.length; i += 4) {
      let r = data[i] / 255;
      let g = data[i + 1] / 255;
      let b = data[i + 2] / 255;
      
      if (exposureAmount !== 0) {
        const exposureFactor = Math.pow(2, exposureAmount);
        r = Math.min(1, Math.max(0, r * exposureFactor));
        g = Math.min(1, Math.max(0, g * exposureFactor));
        b = Math.min(1, Math.max(0, b * exposureFactor));
      }
      
      if (contrastAmount !== 0) {
        const contrastFactor = contrastAmount / 100;
        r = applyContrast(r, contrastFactor);
        g = applyContrast(g, contrastFactor);
        b = applyContrast(b, contrastFactor);
      }
      
      data[i] = Math.round(r * 255);
      data[i + 1] = Math.round(g * 255);
      data[i + 2] = Math.round(b * 255);
    }
  }

  ctx.putImageData(imgData, 0, 0);

  // Apply subtle film blur by default
  if (DEFAULT_FILM_BLUR > 0) {
    applyRadialBlur(ctx, width, height, DEFAULT_FILM_BLUR);
  }

  // Apply enhanced grain
  if (selectedISO > 0) {
    const grainAmount = selectedISO; // Removed mobile reduction for consistency
    addGrain(ctx, width, height, grainAmount);
  }
}

function applyEffects(immediate = false) {
  if (!fullResImage) {
    console.log('No image loaded, skipping effects');
    return;
  }

  if (processingEffect && !immediate) {
    console.log('Already processing effects, queueing update');
    pendingEffect = true;
    return;
  }

  processingEffect = true;

  const maxWidth = isMobile ? MOBILE_MAX_WIDTH : DESKTOP_MAX_WIDTH;
  const maxHeight = isMobile ? MOBILE_MAX_HEIGHT : DESKTOP_MAX_HEIGHT;
  const aspectRatio = fullResImage.width / fullResImage.height;
  let newWidth = fullResImage.width;
  let newHeight = fullResImage.height;
  
  if (newWidth > maxWidth) {
    newWidth = maxWidth;
    newHeight = newWidth / aspectRatio;
  }
  if (newHeight > maxHeight) {
    newHeight = maxHeight;
    newWidth = newHeight * aspectRatio;
  }
  
  newWidth = Math.floor(newWidth);
  newHeight = Math.floor(newHeight);
  
  canvas.width = newWidth;
  canvas.height = newHeight;
  
  // Set preview quality based on device
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = isMobile ? 'medium' : 'high';
  
  ctx.drawImage(fullResImage, 0, 0, newWidth, newHeight);
  
  processImageEffects(ctx, newWidth, newHeight, false);

  processingEffect = false;

  if (pendingEffect) {
    pendingEffect = false;
    requestAnimationFrame(() => applyEffects(true));
  }
}

document.getElementById("downloadBtn").addEventListener("click", async () => {
  if (!fullResImage) return;

  // Show loading state
  const downloadBtn = document.getElementById("downloadBtn");
  const originalText = downloadBtn.innerHTML;
  downloadBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v6m0 0l-3-3m3 3l3-3M4 14v4a2 2 0 002 2h12a2 2 0 002-2v-4"/></svg> Processing...';
  downloadBtn.disabled = true;

  try {
    const exportCanvas = document.createElement("canvas");
    const exportCtx = exportCanvas.getContext("2d", { 
      willReadFrequently: true,
      alpha: true,
      desynchronized: false
    });
    
    // Calculate export dimensions based on Instagram requirements
    const aspectRatio = fullResImage.width / fullResImage.height;
    let exportWidth = fullResImage.width;
    let exportHeight = fullResImage.height;
    
    // Set maximum dimensions to maintain file size under 2MB
    const MAX_EXPORT_SIZE = isMobile ? 1080 : 2048; // Reduced mobile size for better performance
    if (exportWidth > MAX_EXPORT_SIZE) {
      exportWidth = MAX_EXPORT_SIZE;
      exportHeight = Math.floor(exportWidth / aspectRatio);
    }
    if (exportHeight > MAX_EXPORT_SIZE) {
      exportHeight = MAX_EXPORT_SIZE;
      exportWidth = Math.floor(exportHeight * aspectRatio);
    }

    // Set canvas size with high quality settings
    exportCanvas.width = exportWidth;
    exportCanvas.height = exportHeight;
    exportCtx.imageSmoothingEnabled = true;
    exportCtx.imageSmoothingQuality = 'high';

    // Draw the original image with high quality
    exportCtx.drawImage(fullResImage, 0, 0, exportWidth, exportHeight);

    // Process effects in chunks for better performance
    const processChunk = async (startY, chunkHeight) => {
      const imgData = exportCtx.getImageData(0, startY, exportWidth, chunkHeight);
      const data = imgData.data;
      const originalData = new Uint8ClampedArray(data);

      // Apply LUT with higher precision
      if (lutData && lutIntensity > 0) {
        for (let i = 0; i < data.length; i += 4) {
          const r = originalData[i] / 255;
          const g = originalData[i + 1] / 255;
          const b = originalData[i + 2] / 255;
          const newColor = trilinearLUTLookup(lutData, r, g, b);
          data[i] = Math.round(originalData[i] * (1 - lutIntensity) + newColor[0] * 255 * lutIntensity);
          data[i + 1] = Math.round(originalData[i + 1] * (1 - lutIntensity) + newColor[1] * 255 * lutIntensity);
          data[i + 2] = Math.round(originalData[i + 2] * (1 - lutIntensity) + newColor[2] * 255 * lutIntensity);
        }
      }

      // Apply exposure and contrast with higher precision
      if (exposureAmount !== 0 || contrastAmount !== 0) {
        for (let i = 0; i < data.length; i += 4) {
          let r = data[i] / 255;
          let g = data[i + 1] / 255;
          let b = data[i + 2] / 255;
          
          if (exposureAmount !== 0) {
            const exposureFactor = Math.pow(2, exposureAmount);
            r = Math.min(1, Math.max(0, r * exposureFactor));
            g = Math.min(1, Math.max(0, g * exposureFactor));
            b = Math.min(1, Math.max(0, b * exposureFactor));
          }
          
          if (contrastAmount !== 0) {
            const contrastFactor = contrastAmount / 100;
            r = applyContrast(r, contrastFactor);
            g = applyContrast(g, contrastFactor);
            b = applyContrast(b, contrastFactor);
          }
          
          data[i] = Math.round(r * 255);
          data[i + 1] = Math.round(g * 255);
          data[i + 2] = Math.round(b * 255);
        }
      }

      exportCtx.putImageData(imgData, 0, startY);
    };

    // Process image in chunks on mobile
    if (isMobile) {
      const CHUNK_SIZE = 200; // Increased from 100 for better quality
      for (let y = 0; y < exportHeight; y += CHUNK_SIZE) {
        const chunkHeight = Math.min(CHUNK_SIZE, exportHeight - y);
        await processChunk(y, chunkHeight);
      }
    } else {
      await processChunk(0, exportHeight);
    }

    // Apply blur if enabled with higher quality
    if (DEFAULT_FILM_BLUR > 0) {
      applyRadialBlur(exportCtx, exportWidth, exportHeight, DEFAULT_FILM_BLUR);
    }

    // Apply grain with higher quality
    if (selectedISO > 0) {
      const grainAmount = selectedISO;
      addGrain(exportCtx, exportWidth, exportHeight, grainAmount);
    }

    // Generate filename
    const now = new Date();
    const pad = n => n.toString().padStart(2, '0');
    const dateStr = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const fileName = `TheBrokeFilmGang-${dateStr}.jpg`;

    // Convert to Blob with adjusted quality
    const quality = isMobile ? 0.85 : 0.95; // Reduced mobile quality for better performance
    const blob = await new Promise(resolve => {
      exportCanvas.toBlob(resolve, 'image/jpeg', quality);
    });

    if (!blob) {
      throw new Error("Export failed: could not create image file. Try with a smaller image or different settings.");
    }

    // Clean up canvas
    exportCanvas.width = 1;
    exportCanvas.height = 1;
    exportCtx.clearRect(0, 0, 1, 1);

    // Create download link
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.download = fileName;
    link.href = url;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Delay revoke to ensure download starts
    setTimeout(() => {
      URL.revokeObjectURL(url);
      console.log('Object URL revoked:', url);
    }, 1000);

    console.log('Download triggered:', fileName);
  } catch (error) {
    console.error("Export error:", error);
    alert(error.message || "An error occurred during export. Please try again.");
  } finally {
    // Restore button state
    downloadBtn.innerHTML = originalText;
    downloadBtn.disabled = false;
  }
});

let selectedISO = 100;
let contrastAmount = 0;
let exposureAmount = 0;
let lutIntensity = 1.0;
const DEFAULT_FILM_BLUR = 2.2; // Increased from 1.5 for more visible blur

// Utiliser le slider ISO du HTML
const isoSlider = document.getElementById('isoSlider');
const isoValueSpan = document.getElementById('isoValue');

// Sliders Contrast et Exposure
const contrastSlider = document.getElementById('contrastSlider');
const contrastValueSpan = document.getElementById('contrastValue');
const exposureSlider = document.getElementById('exposureSlider');
const exposureValueSpan = document.getElementById('exposureValue');

// Slider d'intensité
const lutIntensitySlider = document.getElementById('lutIntensitySlider');
const intensityValueSpan = document.getElementById('intensityValue');

// Variables pour l'optimisation des performances
let processingEffect = false;
let pendingEffect = false;
let lastEffectTime = 0;

// Update grain levels
const GRAIN_LEVELS = {
  LIGHT: { amount: 30, intensity: 0.2 },
  MEDIUM: { amount: 50, intensity: 0.3 },
  STRONG: { amount: 70, intensity: 0.4 }
};

// Update ISO slider event listener
isoSlider.addEventListener('input', createThrottledHandler(() => {
  const level = parseInt(isoSlider.value);
  selectedISO = level;
  if (isoValueSpan) {
    switch(level) {
      case 0:
        isoValueSpan.textContent = 'Light';
        break;
      case 1:
        isoValueSpan.textContent = 'Medium';
        break;
      case 2:
        isoValueSpan.textContent = 'Strong';
        break;
    }
  }
  if (fullResImage) applyEffects(true);
}));

contrastSlider.addEventListener('input', createThrottledHandler(() => {
  contrastAmount = parseInt(contrastSlider.value);
  if (contrastValueSpan) contrastValueSpan.textContent = contrastAmount;
  if (fullResImage) applyEffects(true);
}));

exposureSlider.addEventListener('input', createThrottledHandler(() => {
  exposureAmount = parseFloat(exposureSlider.value);
  if (exposureValueSpan) exposureValueSpan.textContent = exposureAmount;
  if (fullResImage) applyEffects(true);
}));

lutIntensitySlider.addEventListener('input', createThrottledHandler(() => {
  lutIntensity = parseInt(lutIntensitySlider.value) / 100;
  if (intensityValueSpan) intensityValueSpan.textContent = lutIntensitySlider.value + '%';
  if (fullResImage) applyEffects(true);
}));

// Initialiser les valeurs affichées
if (isoValueSpan) isoValueSpan.textContent = selectedISO;
if (contrastValueSpan) contrastValueSpan.textContent = contrastAmount;
if (exposureValueSpan) exposureValueSpan.textContent = exposureAmount;
if (intensityValueSpan) intensityValueSpan.textContent = '100%';

// Update grain generation function
function addGrain(ctx, width, height, level) {
  if (level < 0) return;
  
  const grainSettings = GRAIN_LEVELS[Object.keys(GRAIN_LEVELS)[level]];
  const maxGrainAmount = grainSettings.amount;
  const grainIntensity = grainSettings.intensity;
  
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  
  // Generate larger grain pattern
  const noiseBuffer = new Float32Array(width * height);
  for (let i = 0; i < noiseBuffer.length; i++) {
    // Create larger grain clusters
    const clusterSize = level === 2 ? 3 + Math.random() * 2 : // Strong grain: larger clusters
                       level === 1 ? 2 + Math.random() * 1.5 : // Medium grain: medium clusters
                       1 + Math.random(); // Light grain: smaller clusters
    const baseNoise = (Math.random() * 2 - 1) * grainIntensity;
    noiseBuffer[i] = baseNoise * (0.8 + Math.random() * 0.4) * clusterSize;
  }
  
  // Apply noise with enhanced luminance-based adjustment
  for (let i = 0; i < data.length; i += 4) {
    const luminance = (data[i] * 0.299 + data[i+1] * 0.587 + data[i+2] * 0.114) / 255;
    // Adjust noise based on luminance for more natural look
    const noiseValue = noiseBuffer[i >> 2] * (1 - luminance * 0.15);
    
    for (let j = 0; j < 3; j++) {
      const value = data[i + j] / 255;
      // Enhanced overlay blending for more pronounced grain
      let result;
      const grainMultiplier = level === 2 ? 1.6 : // Strong grain: more pronounced
                             level === 1 ? 1.4 : // Medium grain: moderate
                             1.2; // Light grain: subtle
      if (value < 0.5) {
        result = 2 * value * (0.5 + noiseValue * grainMultiplier);
      } else {
        result = 1 - 2 * (1 - value) * (1 - (0.5 + noiseValue * grainMultiplier));
      }
      data[i + j] = Math.round(Math.max(0, Math.min(1, result)) * 255);
    }
  }
  
  ctx.putImageData(imageData, 0, 0);
}

function applyLUTToImage(pixels, lut) {
  if (!lut || !lut.values || !lut.size) {
    console.error("Invalid LUT:", lut);
    return;
  }

  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i] / 255;
    const g = pixels[i + 1] / 255;
    const b = pixels[i + 2] / 255;

    try {
      const newColor = trilinearLUTLookup(lut, r, g, b);
      
      // Ensure valid values and convert back to 0-255 range
      pixels[i] = Math.round(Math.max(0, Math.min(1, newColor[0])) * 255);
      pixels[i + 1] = Math.round(Math.max(0, Math.min(1, newColor[1])) * 255);
      pixels[i + 2] = Math.round(Math.max(0, Math.min(1, newColor[2])) * 255);
    } catch (error) {
      console.error("Error in LUT lookup for pixel", i, ":", error);
      // Keep original values on error
      continue;
    }
  }
}

function parseCubeLUT(lutText) {
  const lines = lutText.split('\n');
  let size = 33; // Default size
  let values = [];
  let readingData = false;
  let domainMin = [0, 0, 0];
  let domainMax = [1, 1, 1];

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (trimmedLine === '' || trimmedLine.startsWith('#')) continue;
    
    if (trimmedLine.startsWith('LUT_3D_SIZE')) {
      size = parseInt(trimmedLine.split(' ')[1]);
      continue;
    }

    if (trimmedLine.startsWith('DOMAIN_MIN')) {
      domainMin = trimmedLine.split(' ').slice(1).map(Number);
      continue;
    }

    if (trimmedLine.startsWith('DOMAIN_MAX')) {
      domainMax = trimmedLine.split(' ').slice(1).map(Number);
      continue;
    }
    
    if (!readingData && !trimmedLine.startsWith('TITLE') && !trimmedLine.startsWith('DOMAIN')) {
      readingData = true;
    }
    
    if (readingData) {
      const rgb = trimmedLine.split(' ').map(Number).filter(n => !isNaN(n));
      if (rgb.length === 3) {
        // Normalize values based on domain
        const normalizedRgb = rgb.map((val, i) => {
          const range = domainMax[i] - domainMin[i];
          return (val - domainMin[i]) / range;
        });
        values.push(...normalizedRgb);
      }
    }
  }

  // Validate LUT data
  const expectedSize = size * size * size * 3;
  if (values.length !== expectedSize) {
    console.error(`Invalid LUT data: expected ${expectedSize} values but got ${values.length}`);
    throw new Error("Invalid LUT data: incorrect number of values");
  }

  return { size, values };
}

function trilinearLUTLookup(lut, r, g, b) {
  if (!lut || !lut.values || !lut.size) {
    console.error("Invalid LUT:", lut);
    return [r, g, b];
  }

  const size = lut.size;
  const maxIndex = size - 1;

  // Scale and clamp input values to LUT space
  const rF = Math.min(Math.max(r * maxIndex, 0), maxIndex);
  const gF = Math.min(Math.max(g * maxIndex, 0), maxIndex);
  const bF = Math.min(Math.max(b * maxIndex, 0), maxIndex);

  // Get integer indices
  const r0 = Math.floor(rF);
  const g0 = Math.floor(gF);
  const b0 = Math.floor(bF);
  const r1 = Math.min(r0 + 1, maxIndex);
  const g1 = Math.min(g0 + 1, maxIndex);
  const b1 = Math.min(b0 + 1, maxIndex);

  // Get fractions
  const dr = rF - r0;
  const dg = gF - g0;
  const db = bF - b0;

  // Get values from LUT
  const getValue = (ri, gi, bi) => {
    const idx = (bi * size * size + gi * size + ri) * 3;
    if (idx < 0 || idx + 2 >= lut.values.length) {
      console.error(`Invalid LUT index: ${idx} for size ${size}`);
      return [0, 0, 0];
    }
    return [
      lut.values[idx],
      lut.values[idx + 1],
      lut.values[idx + 2]
    ];
  };

  try {
    // Get all corner values
    const c000 = getValue(r0, g0, b0);
    const c001 = getValue(r0, g0, b1);
    const c010 = getValue(r0, g1, b0);
    const c011 = getValue(r0, g1, b1);
    const c100 = getValue(r1, g0, b0);
    const c101 = getValue(r1, g0, b1);
    const c110 = getValue(r1, g1, b0);
    const c111 = getValue(r1, g1, b1);

    // Perform trilinear interpolation
    const result = [0, 0, 0];
    for (let i = 0; i < 3; i++) {
      // Interpolate along R axis
      const c00 = c000[i] * (1 - dr) + c100[i] * dr;
      const c01 = c001[i] * (1 - dr) + c101[i] * dr;
      const c10 = c010[i] * (1 - dr) + c110[i] * dr;
      const c11 = c011[i] * (1 - dr) + c111[i] * dr;

      // Interpolate along G axis
      const c0 = c00 * (1 - dg) + c10 * dg;
      const c1 = c01 * (1 - dg) + c11 * dg;

      // Final interpolation along B axis
      result[i] = c0 * (1 - db) + c1 * db;
    }

    return result;
  } catch (error) {
    console.error("Error in LUT lookup:", error);
    return [r, g, b]; // Return original values on error
  }
}

// Nouvelle fonction de flou simplifiée
function applySimpleBlur(ctx, width, height, radius) {
  if (radius <= 0) return;

  const imgData = ctx.getImageData(0, 0, width, height);
  const pixels = imgData.data;
  const tempPixels = new Uint8ClampedArray(pixels);

  const size = Math.floor(radius);
  const totalWeight = (size * 2 + 1) * (size * 2 + 1);

  // Passe horizontale puis verticale
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0, g = 0, b = 0;
      
      // Moyenne simple des pixels environnants
      for (let dy = -size; dy <= size; dy++) {
        const ny = Math.min(Math.max(y + dy, 0), height - 1);
        for (let dx = -size; dx <= size; dx++) {
          const nx = Math.min(Math.max(x + dx, 0), width - 1);
          const i = (ny * width + nx) * 4;
          r += tempPixels[i];
          g += tempPixels[i + 1];
          b += tempPixels[i + 2];
        }
      }

      const i = (y * width + x) * 4;
      pixels[i] = r / totalWeight;
      pixels[i + 1] = g / totalWeight;
      pixels[i + 2] = b / totalWeight;
    }
  }

  ctx.putImageData(imgData, 0, 0);
}

const customFileBtn = document.getElementById('customFileBtn');
if (customFileBtn) {
  customFileBtn.addEventListener('click', () => imageUpload.click());
}

const resetBtn = document.getElementById('resetBtn');
if (resetBtn) {
  resetBtn.addEventListener('click', () => {
    // Réinitialiser les curseurs
    isoSlider.value = 0;
    selectedISO = 0;
    if (isoValueSpan) isoValueSpan.textContent = 'Light';

    contrastSlider.value = 0;
    contrastAmount = 0;
    if (contrastValueSpan) contrastValueSpan.textContent = contrastAmount;

    exposureSlider.value = 0;
    exposureAmount = 0;
    if (exposureValueSpan) exposureValueSpan.textContent = exposureAmount;

    // Réinitialiser l'intensité du LUT
    lutIntensitySlider.value = 100;
    lutIntensity = 1.0;
    if (intensityValueSpan) intensityValueSpan.textContent = '100%';

    // Réappliquer le LUT par défaut
    document.getElementById('filmSelect').value = 'kodak_portra_160';
    document.getElementById('filmSelect').dispatchEvent(new Event('change'));

    // Réafficher l'image d'origine si elle existe
    if (originalImageDataUrl) {
      const img = new Image();
      img.onload = function () {
        fullResImage = img;
        leakImage = null;
        applyEffects(true);
      };
      img.src = originalImageDataUrl;
    } else {
      showDropZone();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      fullResImage = null;
    }
  });
}

// Liste des LUTs noir et blanc
const blackAndWhiteLUTs = [
  'agfa_apx_400',
  'agfa_apx_100',
  'ilford_hp5_plus_400',
  'ilford_delta_400',
  'ilford_delta_100',
  'ilford_delta_3200',
  'ilford_xp2_super_400',
  'ilford_pan_f_plus_50',
  'kodak_tmax_3200',
  'kodak_tmax_400',
  'kodak_trix_400',
  'CLASSIC_NOIR',
  'blue_noir'
];

// Optimize blur function
function applyFastBlur(ctx, width, height, radius) {
  if (radius <= 0) return;
  
  const iterations = isMobile ? Math.min(2, Math.ceil(radius / 2)) : Math.min(3, Math.ceil(radius / 2));
  const iterationRadius = Math.max(1, Math.ceil(radius / iterations));
  
  for (let i = 0; i < iterations; i++) {
    const imgData = ctx.getImageData(0, 0, width, height);
    const pixels = imgData.data;
    const tempPixels = new Uint8ClampedArray(pixels);
    
    // Horizontal pass
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let r = 0, g = 0, b = 0, count = 0;
        const range = iterationRadius;
        
        for (let dx = -range; dx <= range; dx++) {
          const nx = Math.min(Math.max(x + dx, 0), width - 1);
          const i = (y * width + nx) * 4;
          r += tempPixels[i];
          g += tempPixels[i + 1];
          b += tempPixels[i + 2];
          count++;
        }
        
        const i = (y * width + x) * 4;
        pixels[i] = r / count;
        pixels[i + 1] = g / count;
        pixels[i + 2] = b / count;
        pixels[i + 3] = tempPixels[i + 3];
      }
    }
    
    // Vertical pass
    tempPixels.set(pixels);
    for (let x = 0; x < width; x++) {
      for (let y = 0; y < height; y++) {
        let r = 0, g = 0, b = 0, count = 0;
        const range = iterationRadius;
        
        for (let dy = -range; dy <= range; dy++) {
          const ny = Math.min(Math.max(y + dy, 0), height - 1);
          const i = (ny * width + x) * 4;
          r += tempPixels[i];
          g += tempPixels[i + 1];
          b += tempPixels[i + 2];
          count++;
        }
        
        const i = (y * width + x) * 4;
        pixels[i] = r / count;
        pixels[i + 1] = g / count;
        pixels[i + 2] = b / count;
        pixels[i + 3] = tempPixels[i + 3];
      }
    }
    
    ctx.putImageData(imgData, 0, 0);
  }
}

// Add touch event handling for mobile
if (isMobile) {
  const sliders = document.querySelectorAll('input[type="range"]');
  sliders.forEach(slider => {
    // Prevent default touch behavior
    slider.addEventListener('touchstart', e => {
      e.preventDefault();
      slider.focus();
    }, { passive: false });
    
    // Handle touch move with improved performance
    slider.addEventListener('touchmove', e => {
      e.preventDefault();
      const touch = e.touches[0];
      const rect = slider.getBoundingClientRect();
      const value = ((touch.clientX - rect.left) / rect.width) * 
                    (parseFloat(slider.max) - parseFloat(slider.min)) + parseFloat(slider.min);
      slider.value = Math.min(Math.max(value, parseFloat(slider.min)), parseFloat(slider.max));
      slider.dispatchEvent(new Event('input', { bubbles: true }));
    }, { passive: false });

    // Handle touch end
    slider.addEventListener('touchend', e => {
      e.preventDefault();
      slider.dispatchEvent(new Event('change', { bubbles: true }));
    }, { passive: false });
  });

  // Optimize canvas for mobile
  canvas.style.imageRendering = 'optimizeSpeed';
  canvas.style.webkitImageRendering = 'optimizeSpeed';
}

// Film selection change handler
document.getElementById('filmSelect').addEventListener('change', async (e) => {
  const selectedFilm = e.target.value;
  try {
    const response = await fetch(`luts/${selectedFilm}.cube`);
    if (!response.ok) {
      throw new Error(`Failed to load LUT: ${response.statusText}`);
    }
    const lutText = await response.text();
    lutData = parseCubeLUT(lutText);
    if (fullResImage) applyEffects(true);
  } catch (error) {
    console.error('Error loading LUT:', error);
  }
});

function boxBlur(data, width, height, radius) {
  const tempData = new Uint8ClampedArray(data);
  const size = radius * 2 + 1;
  const scale = 1 / (size * size);

  // Horizontal pass
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0, g = 0, b = 0;
      for (let i = -radius; i <= radius; i++) {
        const px = Math.min(Math.max(x + i, 0), width - 1);
        const idx = (y * width + px) * 4;
        r += tempData[idx];
        g += tempData[idx + 1];
        b += tempData[idx + 2];
      }
      const idx = (y * width + x) * 4;
      data[idx] = r * scale;
      data[idx + 1] = g * scale;
      data[idx + 2] = b * scale;
      data[idx + 3] = tempData[idx + 3]; // Keep original alpha
    }
  }

  // Copy current state for vertical pass
  tempData.set(data);

  // Vertical pass
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      let r = 0, g = 0, b = 0;
      for (let i = -radius; i <= radius; i++) {
        const py = Math.min(Math.max(y + i, 0), height - 1);
        const idx = (py * width + x) * 4;
        r += tempData[idx];
        g += tempData[idx + 1];
        b += tempData[idx + 2];
      }
      const idx = (y * width + x) * 4;
      data[idx] = r * scale;
      data[idx + 1] = g * scale;
      data[idx + 2] = b * scale;
      data[idx + 3] = tempData[idx + 3]; // Keep original alpha
    }
  }
}

function applyRadialBlur(ctx, width, height, amount) {
  if (amount <= 0) return;
  
  const imgData = ctx.getImageData(0, 0, width, height);
  const pixels = imgData.data;
  const tempPixels = new Uint8ClampedArray(pixels);
  
  const centerX = width / 2;
  const centerY = height / 2;
  const maxDistance = Math.sqrt(centerX * centerX + centerY * centerY);
  const blurStrength = amount * 0.05; // Increased from 0.04
  
  // Optimize for mobile
  const isMobileDevice = isMobile;
  const maxRadius = isMobileDevice ? 10 : 12; // Increased from 8/10
  const sampleCount = isMobileDevice ? 12 : 16; // Increased from 10/14
  const blendFactor = isMobileDevice ? 0.4 : 0.5; // Adjusted for stronger effect
  
  // Pre-calculate angles for better performance
  const angleStep = Math.PI * 2 / sampleCount;
  const angles = new Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    angles[i] = i * angleStep;
  }
  
  // Process in chunks for better performance
  const chunkSize = isMobileDevice ? 4 : 8;
  for (let chunkY = 0; chunkY < height; chunkY += chunkSize) {
    for (let chunkX = 0; chunkX < width; chunkX += chunkSize) {
      const endY = Math.min(chunkY + chunkSize, height);
      const endX = Math.min(chunkX + chunkSize, width);
      
      for (let y = chunkY; y < endY; y++) {
        for (let x = chunkX; x < endX; x++) {
          const dx = x - centerX;
          const dy = y - centerY;
          const distance = Math.sqrt(dx * dx + dy * dy);
          const angle = Math.atan2(dy, dx);
          
          const normalizedDistance = distance / maxDistance;
          const blurRadius = Math.max(1, Math.min(maxRadius, normalizedDistance * blurStrength * 15));
          
          let r = 0, g = 0, b = 0, count = 0;
          
          // Sample along radial direction
          for (let i = 0; i < sampleCount; i++) {
            const t = (i / (sampleCount - 1)) * 2 - 1;
            const sampleDistance = distance + t * blurRadius;
            const sampleX = Math.round(centerX + Math.cos(angle) * sampleDistance);
            const sampleY = Math.round(centerY + Math.sin(angle) * sampleDistance);
            
            if (sampleX >= 0 && sampleX < width && sampleY >= 0 && sampleY < height) {
              const idx = (sampleY * width + sampleX) * 4;
              r += tempPixels[idx];
              g += tempPixels[idx + 1];
              b += tempPixels[idx + 2];
              count++;
            }
          }
          
          if (count > 0) {
            const idx = (y * width + x) * 4;
            pixels[idx] = tempPixels[idx] * blendFactor + (r / count) * (1 - blendFactor);
            pixels[idx + 1] = tempPixels[idx + 1] * blendFactor + (g / count) * (1 - blendFactor);
            pixels[idx + 2] = tempPixels[idx + 2] * blendFactor + (b / count) * (1 - blendFactor);
            pixels[idx + 3] = tempPixels[idx + 3];
          }
        }
      }
    }
  }
  
  ctx.putImageData(imgData, 0, 0);
}
