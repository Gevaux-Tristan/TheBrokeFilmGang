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
      const reader = new FileReader();
      reader.onload = (e) => {
        originalImageDataUrl = e.target.result; // Sauvegarde l'image d'origine
        const img = new Image();
        img.onload = () => {
          fullResImage = img;
          leakImage = null; // Remove any previous light leak
          // Appliquer automatiquement Portra 160
          document.getElementById('filmSelect').value = 'kodak_portra_160';
          document.getElementById('filmSelect').dispatchEvent(new Event('change'));
          applyEffects();
        };
        img.src = e.target.result;
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

document.getElementById("filmSelect").addEventListener("change", async () => {
  const selectedFilm = document.getElementById("filmSelect").value;
  currentLutName = selectedFilm;
  console.log("Chargement du LUT:", selectedFilm);
  lutData = await loadLUT("luts/" + selectedFilm + ".cube");
  console.log("LUT chargé:", lutData);
  if (fullResImage) applyEffects(true);
});

document.getElementById("imageUpload").addEventListener("change", e => {
  const file = e.target.files[0];
  const reader = new FileReader();
  reader.onload = function (event) {
    const img = new Image();
    img.onload = function () {
      fullResImage = img;
      // Définir les dimensions maximales
      const maxWidth = 800;
      const maxHeight = 800;
      
      // Calculer le ratio d'aspect
      const aspectRatio = img.width / img.height;
      
      // Calculer les nouvelles dimensions en préservant le ratio
      let newWidth = img.width;
      let newHeight = img.height;
      
      if (newWidth > maxWidth) {
        newWidth = maxWidth;
        newHeight = newWidth / aspectRatio;
      }
      
      if (newHeight > maxHeight) {
        newHeight = maxHeight;
        newWidth = newHeight * aspectRatio;
      }
      
      canvas.width = newWidth;
      canvas.height = newHeight;
      applyEffects();
    };
    img.src = event.target.result;
  };
  reader.readAsDataURL(file);
});

document.getElementById("downloadBtn").addEventListener("click", () => {
  if (!fullResImage) return;

  const exportCanvas = document.createElement("canvas");
  const exportCtx = exportCanvas.getContext("2d", { willReadFrequently: true });
  
  // Utiliser les mêmes dimensions que le preview pour la cohérence
  const previewWidth = canvas.width;
  const previewHeight = canvas.height;
  exportCanvas.width = previewWidth;
  exportCanvas.height = previewHeight;
  
  // Utiliser la même qualité de rendu
  exportCtx.imageSmoothingEnabled = true;
  exportCtx.imageSmoothingQuality = 'high';
  
  // Dessiner l'image
  exportCtx.drawImage(fullResImage, 0, 0, exportCanvas.width, exportCanvas.height);
  
  // Appliquer le LUT
  if (lutData) {
    const imgData = exportCtx.getImageData(0, 0, exportCanvas.width, exportCanvas.height);
    applyLUTToImage(imgData.data, lutData);
    exportCtx.putImageData(imgData, 0, 0);
  }
  
  // Appliquer le flou si nécessaire
  if (blurAmount > 0) {
    applySimpleBlur(exportCtx, exportCanvas.width, exportCanvas.height, blurAmount / 100 * 20);
  }
  
  // Ajouter le grain
  addGrain(exportCtx, exportCanvas.width, exportCanvas.height, isoValues[selectedISO]);
  
  // Générer un nom de fichier unique
  const now = new Date();
  const dateStr = now.toISOString().slice(0,19).replace(/[-:]/g, '').replace('T', '_');
  const lutName = currentLutName.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join('');
  const isoStr = selectedISO.toString();
  const fileName = `TBFG_${lutName}_${isoStr}ISO_${dateStr}.jpg`;
  
  const link = document.createElement("a");
  link.download = fileName;
  link.href = exportCanvas.toDataURL("image/jpeg", 0.95);
  link.click();
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
const THROTTLE_DELAY = 50; // Délai minimum entre les mises à jour sur mobile

// Détection mobile
const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

// Optimiser les gestionnaires d'événements pour les curseurs
function createThrottledHandler(callback) {
  let waiting = false;
  return function() {
    if (!waiting) {
      waiting = true;
      requestAnimationFrame(() => {
        callback.apply(this, arguments);
        waiting = false;
      });
    }
  };
}

// Appliquer les gestionnaires optimisés aux curseurs
isoSlider.addEventListener('input', createThrottledHandler(() => {
  const steps = [100, 200, 400, 800, 1200];
  selectedISO = steps[parseInt(isoSlider.value)];
  if (isoValueSpan) isoValueSpan.textContent = selectedISO;
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

function addGrain(ctx, width, height, amount) {
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  
  // Fonction pour générer un bruit gaussien
  function gaussianRandom() {
    let u = 0, v = 0;
    while(u === 0) u = Math.random();
    while(v === 0) v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  }
  
  // Créer un buffer de bruit avec cohérence spatiale
  const noiseBuffer = new Float32Array(width * height);
  const grainSize = Math.max(1, Math.floor(1 + amount * 2)); // Taille du grain basée sur l'ISO
  
  // Remplir le buffer avec du bruit cohérent
  for(let y = 0; y < height; y += grainSize) {
    for(let x = 0; x < width; x += grainSize) {
      const noise = gaussianRandom() * amount;
      // Appliquer le même bruit à tous les pixels dans la zone du grain
      for(let dy = 0; dy < grainSize && y + dy < height; dy++) {
        for(let dx = 0; dx < grainSize && x + dx < width; dx++) {
          const idx = (y + dy) * width + (x + dx);
          noiseBuffer[idx] = noise;
        }
      }
    }
  }
  
  // Appliquer le bruit à l'image
  for(let y = 0; y < height; y++) {
    for(let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const noise = noiseBuffer[y * width + x] * 255;
      
      // Variation de couleur légère pour un grain plus naturel
      const rNoise = noise * (0.9 + Math.random() * 0.2);
      const gNoise = noise * (0.9 + Math.random() * 0.2);
      const bNoise = noise * (0.9 + Math.random() * 0.2);
      
      // Ajuster l'intensité du grain en fonction de la luminosité
      const luminance = (data[i] * 0.299 + data[i+1] * 0.587 + data[i+2] * 0.114) / 255;
      const grainStrength = 0.5 + luminance * 0.5; // Plus fort dans les tons moyens
      
      data[i] = Math.min(255, Math.max(0, data[i] + rNoise * grainStrength));
      data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + gNoise * grainStrength));
      data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + bNoise * grainStrength));
    }
  }
  
  ctx.putImageData(imageData, 0, 0);
}

function trilinearLUTLookup(lut, r, g, b) {
  const size = lut.size;
  const maxIndex = size - 1;

  // Calculer les indices flottants
  const rF = r * maxIndex;
  const gF = g * maxIndex;
  const bF = b * maxIndex;

  // Indices entiers et fractions
  const r0 = Math.floor(rF), r1 = Math.min(r0 + 1, maxIndex);
  const g0 = Math.floor(gF), g1 = Math.min(g0 + 1, maxIndex);
  const b0 = Math.floor(bF), b1 = Math.min(b0 + 1, maxIndex);
  const dr = rF - r0, dg = gF - g0, db = bF - b0;

  // Fonction d'accès
  const idx = (ri, gi, bi) => ri + gi * size + bi * size * size;
  const v000 = lut.values[idx(r0, g0, b0)];
  const v100 = lut.values[idx(r1, g0, b0)];
  const v010 = lut.values[idx(r0, g1, b0)];
  const v110 = lut.values[idx(r1, g1, b0)];
  const v001 = lut.values[idx(r0, g0, b1)];
  const v101 = lut.values[idx(r1, g0, b1)];
  const v011 = lut.values[idx(r0, g1, b1)];
  const v111 = lut.values[idx(r1, g1, b1)];

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
  return out;
}

function applyLUTToImage(data, lut) {
  if (!lut || !lut.values || lut.values.length === 0) {
    console.error("Invalid LUT:", lut);
    return;
  }

  // Apply LUT with trilinear interpolation
  for (let i = 0; i < data.length; i += 4) {
    let r = data[i] / 255;
    let g = data[i + 1] / 255;
    let b = data[i + 2] / 255;

    if (lut.isBlackAndWhite) {
      const gray = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      r = g = b = gray;
    }

    let color = trilinearLUTLookup(lut, r, g, b);
    if (color) {
      if (lut.isBlackAndWhite) {
        const grayValue = (color[0] + color[1] + color[2]) / 3;
        data[i] = data[i + 1] = data[i + 2] = grayValue * 255;
      } else {
        data[i] = color[0] * 255;
        data[i + 1] = color[1] * 255;
        data[i + 2] = color[2] * 255;
      }
    }
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

// ISO grain logic
const isoValues = {
  100: 0.02,
  200: 0.06,
  400: 0.12,
  800: 0.20,
  1200: 0.30
};

async function loadLUT(url) {
  try {
    const response = await fetch(url);
    const text = await response.text();
    console.log("Chargement du LUT:", url);
    
    // Trouver la taille du LUT
    const sizeMatch = text.match(/LUT_3D_SIZE (\d+)/);
    const size = sizeMatch ? parseInt(sizeMatch[1]) : 33; // Par défaut 33 pour les nouveaux LUTs
    
    // Filtrer les lignes de données et normaliser le format
    const lines = text.split('\n')
      .filter(l => !l.startsWith('#') && !l.startsWith('TITLE') && !l.startsWith('LUT_3D_SIZE') && !l.startsWith('DOMAIN'))
      .map(line => line.trim())
      .filter(line => line.length > 0 && line.split(' ').length >= 3);
    
    // Convertir les lignes en valeurs RGB et s'assurer qu'elles sont dans la plage [0,1]
    const values = lines.map(line => {
      const [r, g, b] = line.split(' ').map(parseFloat);
      return [
        Math.min(1, Math.max(0, r)),
        Math.min(1, Math.max(0, g)),
        Math.min(1, Math.max(0, b))
      ];
    });

    // Vérifier si le LUT est en noir et blanc en utilisant la liste
    const lutName = url.split('/').pop().replace('.cube', '');
    const isBlackAndWhite = blackAndWhiteLUTs.includes(lutName);
    
    if (!values.length) {
      console.error("LUT invalide - pas de données:", url);
      return null;
    }
    
    console.log("LUT chargé avec succès:", url, "taille:", size, "valeurs:", values.length);
    return { size, values, isBlackAndWhite };
  } catch (error) {
    console.error("Erreur lors du chargement du LUT:", url, error);
    return null;
  }
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
  'kodak_tmax_100',
  'kodak_tmax_3200',
  'kodak_tmax_400',
  'kodak_trix_400',
  'CLASSIC_NOIR'
];

// New optimized blur function
function applyFastBlur(ctx, width, height, radius) {
  if (radius <= 0) return;

  const imgData = ctx.getImageData(0, 0, width, height);
  const pixels = imgData.data;
  const tempPixels = new Uint8ClampedArray(pixels);

  // Optimize radius for performance
  const size = Math.max(1, Math.floor(radius)) | 1; // Ensure odd size
  const halfSize = Math.floor(size / 2);

  // Two-pass box blur (horizontal then vertical)
  // Horizontal pass
  for (let y = 0; y < height; y++) {
    let r = 0, g = 0, b = 0;
    let count = 0;

    // Initialize first window
    for (let x = -halfSize; x <= halfSize; x++) {
      const nx = Math.min(Math.max(x, 0), width - 1);
      const i = (y * width + nx) * 4;
      r += tempPixels[i];
      g += tempPixels[i + 1];
      b += tempPixels[i + 2];
      count++;
    }

    // Slide window
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      pixels[i] = r / count;
      pixels[i + 1] = g / count;
      pixels[i + 2] = b / count;

      // Remove leftmost pixel
      const leftX = Math.max(0, x - halfSize);
      const leftI = (y * width + leftX) * 4;
      r -= tempPixels[leftI];
      g -= tempPixels[leftI + 1];
      b -= tempPixels[leftI + 2];

      // Add rightmost pixel
      const rightX = Math.min(width - 1, x + halfSize + 1);
      const rightI = (y * width + rightX) * 4;
      r += tempPixels[rightI];
      g += tempPixels[rightI + 1];
      b += tempPixels[rightI + 2];
    }
  }

  // Vertical pass
  for (let x = 0; x < width; x++) {
    let r = 0, g = 0, b = 0;
    let count = 0;

    // Initialize first window
    for (let y = -halfSize; y <= halfSize; y++) {
      const ny = Math.min(Math.max(y, 0), height - 1);
      const i = (ny * width + x) * 4;
      r += pixels[i];
      g += pixels[i + 1];
      b += pixels[i + 2];
      count++;
    }

    // Slide window
    for (let y = 0; y < height; y++) {
      const i = (y * width + x) * 4;
      pixels[i] = r / count;
      pixels[i + 1] = g / count;
      pixels[i + 2] = b / count;

      // Remove topmost pixel
      const topY = Math.max(0, y - halfSize);
      const topI = (topY * width + x) * 4;
      r -= pixels[topI];
      g -= pixels[topI + 1];
      b -= pixels[topI + 2];

      // Add bottommost pixel
      const bottomY = Math.min(height - 1, y + halfSize + 1);
      const bottomI = (bottomY * width + x) * 4;
      r += pixels[bottomI];
      g += pixels[bottomI + 1];
      b += pixels[bottomI + 2];
    }
  }

  ctx.putImageData(imgData, 0, 0);
}

function applyEffects(immediate = false) {
  if (!fullResImage) return;

  if (processingEffect && !immediate) {
    pendingEffect = true;
    return;
  }

  processingEffect = true;

  // Define dimensions
  const maxWidth = isMobile ? 640 : 1200;
  const maxHeight = isMobile ? 640 : 1200;
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
  
  canvas.width = newWidth;
  canvas.height = newHeight;
  
  // Draw original image
  ctx.drawImage(fullResImage, 0, 0, newWidth, newHeight);
  
  // Get image data for processing
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imgData.data;

  // Create a copy of the original data for independent processing
  const originalData = new Uint8ClampedArray(data);

  // Apply LUT first if present
  if (lutData) {
    // Create a temporary array for LUT processing
    const lutProcessedData = new Uint8ClampedArray(data);
    
    // Apply LUT with proper error handling
    try {
      applyLUTToImage(lutProcessedData, lutData);
      
      // Blend LUT result with original based on intensity
      for (let i = 0; i < data.length; i += 4) {
        for (let c = 0; c < 3; c++) {
          data[i + c] = Math.round(originalData[i + c] * (1 - lutIntensity) + lutProcessedData[i + c] * lutIntensity);
        }
      }
    } catch (error) {
      console.error("Error applying LUT:", error);
      // Fallback to original data if LUT application fails
      data.set(originalData);
    }
  }

  // Apply exposure and contrast
  if (exposureAmount !== 0 || contrastAmount !== 0) {
    for (let i = 0; i < data.length; i += 4) {
      // Start with current values
      let r = data[i] / 255;
      let g = data[i + 1] / 255;
      let b = data[i + 2] / 255;

      // Apply exposure
      if (exposureAmount !== 0) {
        const exposureFactor = Math.pow(2, exposureAmount);
        r = Math.min(1, Math.max(0, r * exposureFactor));
        g = Math.min(1, Math.max(0, g * exposureFactor));
        b = Math.min(1, Math.max(0, b * exposureFactor));
      }

      // Apply contrast
      if (contrastAmount !== 0) {
        const contrastFactor = contrastAmount / 100;
        r = applyContrast(r, contrastFactor);
        g = applyContrast(g, contrastFactor);
        b = applyContrast(b, contrastFactor);
      }

      // Convert back to 0-255
      data[i] = r * 255;
      data[i + 1] = g * 255;
      data[i + 2] = b * 255;
    }
  }

  // Put the processed image data back
  ctx.putImageData(imgData, 0, 0);

  // Apply blur if needed
  if (blurAmount > 0) {
    const blurRadius = (blurAmount / 100) * 20;
    applyFastBlur(ctx, canvas.width, canvas.height, blurRadius);
  }

  // Add grain
  addGrain(ctx, canvas.width, canvas.height, isoValues[selectedISO]);

  processingEffect = false;

  if (pendingEffect) {
    pendingEffect = false;
    requestAnimationFrame(() => applyEffects(true));
  }
}

// Helper function for contrast adjustment
function applyContrast(x, c) {
  if (c === 0) return x;
  if (c > 0) {
    if (c < 0.3) {
      return x + (x - 0.5) * c;
    } else if (c < 0.4) {
      const lin = x + (x - 0.5) * c;
      const k = 2;
      const scurve = 1 / (1 + Math.exp(-k * (x - 0.5)));
      const t = (c - 0.3) / 0.1;
      return lin * (1 - t) + scurve * t;
    } else {
      const k = 2;
      return 1 / (1 + Math.exp(-k * (x - 0.5)));
    }
  } else {
    return x + (0.5 - x) * (-c);
  }
}
