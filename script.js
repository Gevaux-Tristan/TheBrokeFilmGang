const canvas = document.getElementById("previewCanvas");
const ctx = canvas.getContext("2d", { willReadFrequently: true });
let fullResImage = null;
let lutData = null;
let leakImage = null;
let originalImageDataUrl = null;

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
const MOBILE_MAX_WIDTH = 480; // Reduced from 640
const MOBILE_MAX_HEIGHT = 480;
const DESKTOP_MAX_WIDTH = 1200;
const DESKTOP_MAX_HEIGHT = 1200;

// Instagram recommended sizes:
// Stories: 1080x1920
// Feed: 1080x1080 (square), 1080x1350 (portrait), 1080x566 (landscape)
const EXPORT_MAX_WIDTH = 1080;
const EXPORT_MAX_HEIGHT = 1350;

// Increase throttle delay for better performance
const THROTTLE_DELAY = isMobile ? 150 : 50; // Longer delay on mobile

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
  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;
  const originalData = new Uint8ClampedArray(data);
  let needsUpdate = false;

  // Apply LUT if present and intensity > 0
  if (lutData && lutIntensity > 0) {
    const lutProcessedData = new Uint8ClampedArray(data);
    try {
      applyLUTToImage(lutProcessedData, lutData);
      
      // Optimize blending operation
      const intensity = Math.round(lutIntensity * 255);
      const invIntensity = 255 - intensity;
      
      for (let i = 0; i < data.length; i += 4) {
        data[i] = (originalData[i] * invIntensity + lutProcessedData[i] * intensity) >> 8;
        data[i + 1] = (originalData[i + 1] * invIntensity + lutProcessedData[i + 1] * intensity) >> 8;
        data[i + 2] = (originalData[i + 2] * invIntensity + lutProcessedData[i + 2] * intensity) >> 8;
      }
      needsUpdate = true;
    } catch (error) {
      console.error("Error applying LUT:", error);
      data.set(originalData);
    }
  }

  // Apply exposure and contrast only if needed
  if (exposureAmount !== 0 || contrastAmount !== 0) {
    const exposureFactor = exposureAmount !== 0 ? Math.pow(2, exposureAmount) : 1;
    const contrastFactor = contrastAmount / 100;
    
    for (let i = 0; i < data.length; i += 4) {
      for (let j = 0; j < 3; j++) {
        let value = data[i + j] / 255;
        
        if (exposureAmount !== 0) {
          value = Math.min(1, Math.max(0, value * exposureFactor));
        }
        
        if (contrastAmount !== 0) {
          value = applyContrast(value, contrastFactor);
        }
        
        data[i + j] = Math.round(value * 255);
      }
    }
    needsUpdate = true;
  }

  // Only update image data if changes were made
  if (needsUpdate) {
    ctx.putImageData(imgData, 0, 0);
  }

  // Apply blur if needed
  if (blurAmount > 0) {
    const maxBlur = 20;
    const blurRadius = (blurAmount / 100) * maxBlur;
    applyFastBlur(ctx, width, height, blurRadius);
  }

  // Apply grain if needed
  if (selectedISO > 0) {
    addGrain(ctx, width, height, selectedISO);
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

  try {
    const exportCanvas = document.createElement("canvas");
    const exportCtx = exportCanvas.getContext("2d", { willReadFrequently: true });
    
    // Calculate export dimensions based on Instagram requirements
    const aspectRatio = fullResImage.width / fullResImage.height;
    let exportWidth = fullResImage.width;
    let exportHeight = fullResImage.height;
    
    if (exportWidth > EXPORT_MAX_WIDTH) {
      exportWidth = EXPORT_MAX_WIDTH;
      exportHeight = Math.floor(exportWidth / aspectRatio);
    }
    if (exportHeight > EXPORT_MAX_HEIGHT) {
      exportHeight = EXPORT_MAX_HEIGHT;
      exportWidth = Math.floor(exportHeight * aspectRatio);
    }
    
    exportCanvas.width = exportWidth;
    exportCanvas.height = exportHeight;
    
    exportCtx.imageSmoothingEnabled = true;
    exportCtx.imageSmoothingQuality = 'high';
    
    exportCtx.drawImage(fullResImage, 0, 0, exportWidth, exportHeight);
    
    const imgData = exportCtx.getImageData(0, 0, exportWidth, exportHeight);
    const data = imgData.data;
    const originalData = new Uint8ClampedArray(data);

    if (lutData) {
      const lutProcessedData = new Uint8ClampedArray(data);
      try {
        applyLUTToImage(lutProcessedData, lutData);
        for (let i = 0; i < data.length; i += 4) {
          for (let c = 0; c < 3; c++) {
            data[i + c] = Math.round(originalData[i + c] * (1 - lutIntensity) + lutProcessedData[i + c] * lutIntensity);
          }
        }
      } catch (error) {
        console.error("Error applying LUT:", error);
        data.set(originalData);
      }
    }

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
          if (contrastFactor < 0) {
            const fadeAmount = Math.abs(contrastFactor);
            const gray = 0.5;
            r = r * (1 - fadeAmount) + gray * fadeAmount;
            g = g * (1 - fadeAmount) + gray * fadeAmount;
            b = b * (1 - fadeAmount) + gray * fadeAmount;
          } else {
            r = applyContrast(r, contrastFactor);
            g = applyContrast(g, contrastFactor);
            b = applyContrast(b, contrastFactor);
          }
        }

        data[i] = r * 255;
        data[i + 1] = g * 255;
        data[i + 2] = b * 255;
      }
    }

    exportCtx.putImageData(imgData, 0, 0);

    if (blurAmount > 0) {
      const maxBlur = 20;
      // Scale blur radius based on resolution difference
      const previewWidth = isMobile ? 640 : 1200;
      const scaleFactor = exportWidth / previewWidth;
      const blurRadius = (blurAmount / 100) * maxBlur * scaleFactor;
      applyFastBlur(exportCtx, exportWidth, exportHeight, blurRadius);
    }

    // Scale grain for export resolution
    const previewWidth = isMobile ? 640 : 1200;
    const scaleFactor = exportWidth / previewWidth;
    const grainAmount = selectedISO * scaleFactor;
    addGrain(exportCtx, exportWidth, exportHeight, grainAmount);
    
    // Générer un nom de fichier unique
    const now = new Date();
    const dateStr = now.toISOString().slice(0,19).replace(/[-:]/g, '').replace('T', '_');
    const lutName = currentLutName.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join('');
    const isoStr = selectedISO.toString();
    const fileName = `TBFG_${lutName}_${isoStr}ISO_${dateStr}.jpg`;
    
    // Convertir en Blob pour une meilleure qualité
    const blob = await new Promise(resolve => {
      exportCanvas.toBlob(resolve, 'image/jpeg', 0.95);
    });
    
    if (!blob) {
      throw new Error("Échec de la création du Blob");
    }
    
    // Créer l'URL et télécharger
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.download = fileName;
    link.href = url;
    link.click();
    
    // Nettoyer l'URL
    setTimeout(() => URL.revokeObjectURL(url), 100);
  } catch (error) {
    console.error("Erreur lors de l'export:", error);
    alert("Une erreur est survenue lors de l'export. Veuillez réessayer.");
  }
});

let selectedISO = 100;
let contrastAmount = 0;
let exposureAmount = 0;
let lutIntensity = 1.0;
let blurAmount = 0; // Nouvelle variable pour le flou

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

// Nouveau slider de flou
const blurSlider = document.getElementById('blurSlider');
const blurValueSpan = document.getElementById('blurValue');

// Variables pour l'optimisation des performances
let processingEffect = false;
let pendingEffect = false;
let lastEffectTime = 0;

// Appliquer les gestionnaires optimisés aux curseurs
isoSlider.addEventListener('input', createThrottledHandler(() => {
  selectedISO = parseInt(isoSlider.value);
  if (isoValueSpan) {
    isoValueSpan.textContent = selectedISO + '%';
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

blurSlider.addEventListener('input', createThrottledHandler(() => {
  blurAmount = parseInt(blurSlider.value);
  if (blurValueSpan) blurValueSpan.textContent = blurAmount + '%';
  if (fullResImage) applyEffects(true);
}));

// Initialiser les valeurs affichées
if (isoValueSpan) isoValueSpan.textContent = selectedISO;
if (contrastValueSpan) contrastValueSpan.textContent = contrastAmount;
if (exposureValueSpan) exposureValueSpan.textContent = exposureAmount;
if (intensityValueSpan) intensityValueSpan.textContent = '100%';

// Optimize grain generation
function addGrain(ctx, width, height, amount) {
  if (amount <= 0) return;
  
  const grainIntensity = (amount / 100) * 0.25;
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  
  // Use a single noise buffer for better performance
  const noiseBuffer = new Float32Array(width * height);
  
  // Simplified noise generation
  for (let i = 0; i < noiseBuffer.length; i++) {
    noiseBuffer[i] = (Math.random() * 2 - 1) * grainIntensity;
  }
  
  // Apply noise with optimized luminance calculation
  for (let i = 0; i < data.length; i += 4) {
    const luminance = (data[i] * 0.299 + data[i+1] * 0.587 + data[i+2] * 0.114) / 255;
    const noiseValue = noiseBuffer[i >> 2] * (1 - luminance * 0.5);
    
    for (let j = 0; j < 3; j++) {
      const value = data[i + j] / 255;
      data[i + j] = Math.max(0, Math.min(255, Math.round(
        ((value > 0.5) ? 
          (1 - (1 - 2 * (value - 0.5)) * (1 - noiseValue)) : 
          (2 * value * (1 + noiseValue))) * 255
      )));
    }
  }
  
  ctx.putImageData(imageData, 0, 0);
}

function trilinearLUTLookup(lut, r, g, b) {
  if (!lut || !lut.size || !lut.values) {
    console.error("Invalid LUT data:", lut);
    return [r, g, b]; // Return original color if LUT is invalid
  }

  const size = lut.size;
  const maxIndex = size - 1;

  // Calculer les indices flottants
  const rF = r * maxIndex;
  const gF = g * maxIndex;
  const bF = b * maxIndex;

  // Log sample input values
  if (r === 0 && g === 0 && b === 0) {
    console.log("LUT lookup for black:", { rF, gF, bF });
  }

  // Indices entiers et fractions
  const r0 = Math.floor(rF), r1 = Math.min(r0 + 1, maxIndex);
  const g0 = Math.floor(gF), g1 = Math.min(g0 + 1, maxIndex);
  const b0 = Math.floor(bF), b1 = Math.min(b0 + 1, maxIndex);
  const dr = rF - r0, dg = gF - g0, db = bF - b0;

  try {
    // Fonction d'accès
    const idx = (ri, gi, bi) => {
      const index = ri + gi * size + bi * size * size;
      if (index >= lut.values.length) {
        throw new Error(`LUT index out of bounds: ${index} >= ${lut.values.length}`);
      }
      return lut.values[index];
    };

    const v000 = idx(r0, g0, b0);
    const v100 = idx(r1, g0, b0);
    const v010 = idx(r0, g1, b0);
    const v110 = idx(r1, g1, b0);
    const v001 = idx(r0, g0, b1);
    const v101 = idx(r1, g0, b1);
    const v011 = idx(r0, g1, b1);
    const v111 = idx(r1, g1, b1);

    // Log sample interpolation values for black
    if (r === 0 && g === 0 && b === 0) {
      console.log("LUT interpolation values for black:", {
        v000, v100, v010, v110,
        v001, v101, v011, v111
      });
    }

    // Interpolation trilineaire
    const lerp = (a, b, t) => a * (1 - t) + b * t;
    let out = [0, 0, 0];
    for (let c = 0; c < 3; c++) {
      const c00 = lerp(v000[c], v100[c], dr);
      const c01 = lerp(v001[c], v101[c], dr);
      const c10 = lerp(v010[c], v110[c], dr);
      const c11 = lerp(v011[c], v111[c], dr);
      const c0 = lerp(c00, c10, dg);
      const c1 = lerp(c01, c11, dg);
      out[c] = lerp(c0, c1, db);
    }

    // Log sample output for black
    if (r === 0 && g === 0 && b === 0) {
      console.log("LUT output for black:", out);
    }

    return out;
  } catch (error) {
    console.error("Error in trilinear LUT lookup:", error);
    return [r, g, b]; // Return original color on error
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
    selectedISO = 100;
    if (isoValueSpan) isoValueSpan.textContent = selectedISO;

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

    // Réinitialiser le flou
    blurSlider.value = 0;
    blurAmount = 0;
    if (blurValueSpan) blurValueSpan.textContent = '0%';

    // Réappliquer le LUT par défaut
    document.getElementById('filmSelect').value = 'kodak_portra_160';
    document.getElementById('filmSelect').dispatchEvent(new Event('change'));

    // Réafficher l'image d'origine si elle existe
    if (originalImageDataUrl) {
      const img = new Image();
      img.onload = function () {
        fullResImage = img;
        leakImage = null;
        applyEffects(true); // Force une mise à jour immédiate
      };
      img.src = originalImageDataUrl;
    } else {
      // Si pas d'image, réafficher le dropZone
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
  
  const iterations = Math.min(3, Math.ceil(radius / 2));
  const iterationRadius = radius / iterations;
  
  for (let i = 0; i < iterations; i++) {
    const imgData = ctx.getImageData(0, 0, width, height);
    const pixels = imgData.data;
    const tempPixels = new Uint8ClampedArray(pixels);
    
    // Horizontal pass
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let r = 0, g = 0, b = 0, count = 0;
        const range = Math.ceil(iterationRadius);
        
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
      }
    }
    
    ctx.putImageData(imgData, 0, 0);
  }
}

function applyLUTToImage(pixels, lut) {
  if (!lut || !lut.values || !lut.size) {
    console.error("LUT invalide:", lut);
    return;
  }

  console.log("Starting LUT application - size:", lut.size, "values length:", lut.values.length);
  console.log("Sample LUT values:", lut.values.slice(0, 3));
  
  let invalidValueCount = 0;
  let outOfRangeCount = 0;
  
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i] / 255;
    const g = pixels[i + 1] / 255;
    const b = pixels[i + 2] / 255;

    try {
      // Log a sample of input values
      if (i === 0) {
        console.log("Sample input RGB:", [r, g, b]);
      }

      // Appliquer le LUT
      const newColor = trilinearLUTLookup(lut, r, g, b);

      // Log a sample of output values
      if (i === 0) {
        console.log("Sample output RGB:", newColor);
      }

      // Check for invalid values
      if (newColor.some(v => isNaN(v) || !isFinite(v))) {
        invalidValueCount++;
        continue;
      }

      // Check for out of range values
      if (newColor.some(v => v < 0 || v > 1)) {
        outOfRangeCount++;
        newColor[0] = Math.min(1, Math.max(0, newColor[0]));
        newColor[1] = Math.min(1, Math.max(0, newColor[1]));
        newColor[2] = Math.min(1, Math.max(0, newColor[2]));
      }

      // Mettre à jour les pixels
      pixels[i] = newColor[0] * 255;
      pixels[i + 1] = newColor[1] * 255;
      pixels[i + 2] = newColor[2] * 255;
    } catch (error) {
      console.error("Error applying LUT to pixel", i, ":", error);
      return;
    }
  }
  
  if (invalidValueCount > 0 || outOfRangeCount > 0) {
    console.warn("LUT application stats:", {
      invalidValues: invalidValueCount,
      outOfRangeValues: outOfRangeCount,
      totalPixels: pixels.length / 4
    });
  }
  
  console.log("LUT application completed");
}

// Add touch event handling for mobile
if (isMobile) {
  const sliders = document.querySelectorAll('input[type="range"]');
  sliders.forEach(slider => {
    slider.addEventListener('touchstart', e => {
      e.preventDefault();
      slider.focus();
    }, { passive: false });
    
    slider.addEventListener('touchmove', e => {
      e.preventDefault();
      const touch = e.touches[0];
      const rect = slider.getBoundingClientRect();
      const value = ((touch.clientX - rect.left) / rect.width) * 
                    (slider.max - slider.min) + Number(slider.min);
      slider.value = Math.min(Math.max(value, slider.min), slider.max);
      slider.dispatchEvent(new Event('input'));
    }, { passive: false });
  });
}
