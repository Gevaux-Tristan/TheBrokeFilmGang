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

document.getElementById("filmSelect").addEventListener("change", async () => {
  const selectedFilm = document.getElementById("filmSelect").value;
  console.log("Chargement du LUT:", selectedFilm);
  lutData = await loadLUT("luts/" + selectedFilm + ".cube");
  console.log("LUT chargé:", lutData);
  if (fullResImage) applyEffects();
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
  
  // Utiliser les dimensions originales pour l'export
  exportCanvas.width = fullResImage.width;
  exportCanvas.height = fullResImage.height;
  
  // Activer la meilleure qualité de rendu
  exportCtx.imageSmoothingEnabled = true;
  exportCtx.imageSmoothingQuality = 'high';
  
  // Dessiner l'image originale
  exportCtx.drawImage(fullResImage, 0, 0);
  
  if (lutData) {
    const imgData = exportCtx.getImageData(0, 0, exportCanvas.width, exportCanvas.height);
    applyLUTToImage(imgData.data, lutData);
    exportCtx.putImageData(imgData, 0, 0);
  }
  
  if (leakImage) {
    exportCtx.drawImage(leakImage, 0, 0, exportCanvas.width, exportCanvas.height);
  }
  
  let grainAmountForExport = isoValues[selectedISO];
  if (canvas.width > 0 && fullResImage.width > canvas.width) {
    const resolutionScaleRatio = fullResImage.width / canvas.width;
    let scaledAmount = isoValues[selectedISO] * Math.sqrt(resolutionScaleRatio);
    
    const maxGrainAmountCap = 0.70;
    scaledAmount = Math.min(scaledAmount, maxGrainAmountCap);

    grainAmountForExport = Math.max(scaledAmount, isoValues[selectedISO]);
  }
  
  addGrain(exportCtx, exportCanvas.width, exportCanvas.height, grainAmountForExport);
  
  // Générer un nom de fichier unique avec la date, l'heure et le LUT utilisé
  const now = new Date();
  const dateStr = now.toISOString().slice(0,19).replace(/[-:]/g, '').replace('T', '_');
  const selectedLUT = document.getElementById('filmSelect').value;
  const lutName = selectedLUT.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join('');
  const isoStr = selectedISO.toString();
  const fileName = `TBFG_${lutName}_${isoStr}ISO_${dateStr}.jpg`;
  
  const link = document.createElement("a");
  link.download = fileName;
  link.href = exportCanvas.toDataURL("image/jpeg", 0.9);
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

// Fonction optimisée pour appliquer les effets
function applyEffects(immediate = false) {
  if (!fullResImage) return;

  // Si un effet est en cours de traitement, marquer comme en attente
  if (processingEffect && !immediate) {
    pendingEffect = true;
    return;
  }

  // Throttling sur mobile
  if (isMobile && !immediate) {
    const now = Date.now();
    if (now - lastEffectTime < THROTTLE_DELAY) {
      if (!pendingEffect) {
        pendingEffect = true;
        setTimeout(() => {
          pendingEffect = false;
          applyEffects(true);
        }, THROTTLE_DELAY);
      }
      return;
    }
  }

  processingEffect = true;
  lastEffectTime = Date.now();

  // Définir les dimensions maximales (réduites sur mobile)
  const maxWidth = isMobile ? 640 : 800;
  const maxHeight = isMobile ? 640 : 800;
  
  // Calculer le ratio d'aspect
  const aspectRatio = fullResImage.width / fullResImage.height;
  
  // Calculer les nouvelles dimensions en préservant le ratio
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
  
  // Mettre à jour la taille du canvas
  canvas.width = newWidth;
  canvas.height = newHeight;
  
  // Utiliser une meilleure qualité de redimensionnement
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = isMobile ? 'medium' : 'high';
  
  // Dessiner l'image originale
  ctx.drawImage(fullResImage, 0, 0, newWidth, newHeight);

  // Appliquer le LUT avec une taille de bloc optimisée pour mobile
  if (lutData) {
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    applyLUTToImage(imgData.data, lutData);
    ctx.putImageData(imgData, 0, 0);
  }

  // Appliquer le flou optique avec une qualité adaptée au mobile
  if (blurAmount > 0) {
    applyLensBlur(ctx, canvas.width, canvas.height, blurAmount);
  }
  
  // Ajouter le grain avec une intensité adaptée au mobile
  const mobileGrainReduction = isMobile ? 0.7 : 1;
  addGrain(ctx, canvas.width, canvas.height, isoValues[selectedISO] * mobileGrainReduction);

  processingEffect = false;

  // Si un effet est en attente, l'appliquer
  if (pendingEffect) {
    pendingEffect = false;
    requestAnimationFrame(() => applyEffects(true));
  }
}

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
  if (fullResImage) applyEffects();
}));

contrastSlider.addEventListener('input', createThrottledHandler(() => {
  contrastAmount = parseInt(contrastSlider.value);
  if (contrastValueSpan) contrastValueSpan.textContent = contrastAmount;
  if (fullResImage) applyEffects();
}));

exposureSlider.addEventListener('input', createThrottledHandler(() => {
  exposureAmount = parseFloat(exposureSlider.value);
  if (exposureValueSpan) exposureValueSpan.textContent = exposureAmount;
  if (fullResImage) applyEffects();
}));

lutIntensitySlider.addEventListener('input', createThrottledHandler(() => {
  lutIntensity = parseInt(lutIntensitySlider.value) / 100;
  if (intensityValueSpan) intensityValueSpan.textContent = lutIntensitySlider.value + '%';
  if (fullResImage) applyEffects();
}));

blurSlider.addEventListener('input', createThrottledHandler(() => {
  blurAmount = parseInt(blurSlider.value);
  if (blurValueSpan) blurValueSpan.textContent = blurAmount + '%';
  if (fullResImage) applyEffects();
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
    console.error("LUT invalide:", lut);
    return;
  }
  const size = lut.size;
  const maxIndex = size - 1;

  // Liste des LUTs qui nécessitent une amplification
  const lutsToAmplify = [
    'fuji_pro',
    'kentmere',
    'kodak_vision',
    'lomography_cn',
    'lomography_analogue_fade',
    'lomography_crossx_poison',
    'lomography_dream_shift',
    'lomography_dust_and_grain',
    'lomography_night_snap',
    'lomography_overburn',
    'lomography_pastel_glow',
    'lomography_purple_dream',
    'lomography_sunset_bleach'
  ];

  // Vérifier si le LUT actuel nécessite une amplification
  const lutName = lut.values.title || '';
  const needsAmplification = lutsToAmplify.some(name => lutName.toLowerCase().includes(name.toLowerCase()));
  const baseAmplificationFactor = needsAmplification ? 1.5 : 1.0;

  // Appliquer le LUT avec interpolation trilineaire
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
        // Appliquer l'intensité personnalisée
        for (let c = 0; c < 3; c++) {
          const original = data[i + c] / 255;
          const modified = color[c];
          // Calculer la différence entre l'original et le modifié
          const diff = modified - original;
          // Appliquer l'intensité personnalisée et l'amplification de base si nécessaire
          const finalIntensity = lutIntensity * (needsAmplification ? baseAmplificationFactor : 1.0);
          color[c] = original + diff * finalIntensity;
          // S'assurer que la valeur reste dans les limites
          color[c] = Math.min(1, Math.max(0, color[c]));
        }
        data[i]     = color[0] * 255;
        data[i + 1] = color[1] * 255;
        data[i + 2] = color[2] * 255;
      }
    }
  }

  // Appliquer l'exposition et le contraste (S-curve) AVANT le stretch automatique
  const exposureFactor = Math.pow(2, exposureAmount);
  const contrastFactor = (contrastAmount / 100);
  // Contraste hybride : linéaire pour |c|<0.3, blend linéaire/S-curve entre 0.3 et 0.4, S-curve plafonnée au-delà
  function applyContrast(x, c) {
    if (c === 0) return x;
    if (c > 0) {
      if (c < 0.3) {
        // Interpolation linéaire douce
        return x + (x - 0.5) * c;
      } else if (c < 0.4) {
        // Blend linéaire/S-curve
        const lin = x + (x - 0.5) * c;
        const k = 2; // plafonné
        const scurve = 1 / (1 + Math.exp(-k * (x - 0.5)));
        const t = (c - 0.3) / 0.1;
        return lin * (1 - t) + scurve * t;
      } else {
        // Clamp c à 0.3 max pour la S-curve
        const k = 2;
        return 1 / (1 + Math.exp(-k * (x - 0.5)));
      }
    } else {
      // Interpolation linéaire vers 0.5 (plat)
      return x + (0.5 - x) * (-c);
    }
  }
  for (let i = 0; i < data.length; i += 4) {
    // Normaliser entre 0 et 1
    let r = data[i] / 255;
    let g = data[i + 1] / 255;
    let b = data[i + 2] / 255;
    // Exposure
    r = Math.min(1, Math.max(0, r * exposureFactor));
    g = Math.min(1, Math.max(0, g * exposureFactor));
    b = Math.min(1, Math.max(0, b * exposureFactor));
    // Contrast hybride
    r = Math.min(1, Math.max(0, applyContrast(r, contrastFactor)));
    g = Math.min(1, Math.max(0, applyContrast(g, contrastFactor)));
    b = Math.min(1, Math.max(0, applyContrast(b, contrastFactor)));
    // Remettre sur 0-255
    data[i]   = r * 255;
    data[i+1] = g * 255;
    data[i+2] = b * 255;
  }

  // Étirement automatique du contraste (stretch linéaire) UNIQUEMENT si exposureAmount et contrastAmount sont à 0
  if (exposureAmount === 0 && contrastAmount === 0) {
    let minR = 255, maxR = 0, minG = 255, maxG = 0, minB = 255, maxB = 0;
    for (let i = 0; i < data.length; i += 4) {
      minR = Math.min(minR, data[i]);   maxR = Math.max(maxR, data[i]);
      minG = Math.min(minG, data[i+1]); maxG = Math.max(maxG, data[i+1]);
      minB = Math.min(minB, data[i+2]); maxB = Math.max(maxB, data[i+2]);
    }
    const stretch = (v, min, max) => max > min ? (v - min) * 255 / (max - min) : v;
    for (let i = 0; i < data.length; i += 4) {
      data[i]   = stretch(data[i],   minR, maxR);
      data[i+1] = stretch(data[i+1], minG, maxG);
      data[i+2] = stretch(data[i+2], minB, maxB);
    }
  }
}

function applyLensBlur(ctx, width, height, radius) {
  if (radius <= 0) return;

  // Optimisation : réduire la taille du canvas pour le flou
  const scale = isMobile ? 0.5 : 0.75;
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = width * scale;
  tempCanvas.height = height * scale;
  const tempCtx = tempCanvas.getContext('2d');

  // Copier l'image dans le canvas temporaire réduit
  tempCtx.scale(scale, scale);
  tempCtx.drawImage(ctx.canvas, 0, 0);
  tempCtx.scale(1/scale, 1/scale);

  // Appliquer plusieurs passes de flou box pour approximer un flou gaussien
  const iterations = 3;
  const boxSize = Math.floor(radius * scale / iterations);
  
  // Fonction de flou box optimisée
  function boxBlur(ctx, w, h, r) {
    const imgData = ctx.getImageData(0, 0, w, h);
    const pixels = imgData.data;
    const temp = new Uint8ClampedArray(pixels.length);
    
    // Passe horizontale
    const div = 2 * r + 1;
    for (let y = 0; y < h; y++) {
      let sum = [0, 0, 0];
      const row = y * w * 4;
      
      // Initialiser la somme pour la première fenêtre
      for (let i = -r; i <= r; i++) {
        const x = Math.min(Math.max(0, i), w - 1);
        const pixel = row + x * 4;
        sum[0] += pixels[pixel];
        sum[1] += pixels[pixel + 1];
        sum[2] += pixels[pixel + 2];
      }
      
      // Faire glisser la fenêtre
      for (let x = 0; x < w; x++) {
        const pixel = row + x * 4;
        temp[pixel] = sum[0] / div;
        temp[pixel + 1] = sum[1] / div;
        temp[pixel + 2] = sum[2] / div;
        temp[pixel + 3] = pixels[pixel + 3];
        
        // Mettre à jour la somme pour la prochaine fenêtre
        const remove = Math.max(0, x - r);
        const add = Math.min(w - 1, x + r + 1);
        sum[0] += pixels[add * 4] - pixels[remove * 4];
        sum[1] += pixels[add * 4 + 1] - pixels[remove * 4 + 1];
        sum[2] += pixels[add * 4 + 2] - pixels[remove * 4 + 2];
      }
    }
    
    // Passe verticale
    for (let x = 0; x < w; x++) {
      let sum = [0, 0, 0];
      
      // Initialiser la somme pour la première fenêtre
      for (let i = -r; i <= r; i++) {
        const y = Math.min(Math.max(0, i), h - 1);
        const pixel = (y * w + x) * 4;
        sum[0] += temp[pixel];
        sum[1] += temp[pixel + 1];
        sum[2] += temp[pixel + 2];
      }
      
      // Faire glisser la fenêtre
      for (let y = 0; y < h; y++) {
        const pixel = (y * w + x) * 4;
        pixels[pixel] = sum[0] / div;
        pixels[pixel + 1] = sum[1] / div;
        pixels[pixel + 2] = sum[2] / div;
        
        // Mettre à jour la somme pour la prochaine fenêtre
        const remove = Math.max(0, y - r) * w + x;
        const add = Math.min(h - 1, y + r + 1) * w + x;
        sum[0] += temp[add * 4] - temp[remove * 4];
        sum[1] += temp[add * 4 + 1] - temp[remove * 4 + 1];
        sum[2] += temp[add * 4 + 2] - temp[remove * 4 + 2];
      }
    }
    
    ctx.putImageData(imgData, 0, 0);
  }

  // Appliquer plusieurs passes de flou box
  for (let i = 0; i < iterations; i++) {
    boxBlur(tempCtx, tempCanvas.width, tempCanvas.height, boxSize);
  }

  // Redimensionner et dessiner le résultat final
  ctx.save();
  ctx.globalCompositeOperation = 'copy';
  ctx.scale(1/scale, 1/scale);
  ctx.drawImage(tempCanvas, 0, 0);
  ctx.restore();
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
