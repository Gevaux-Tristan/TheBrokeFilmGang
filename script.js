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
  document.body.addEventListener(eventName, preventDefaults, false);
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
  
  addGrain(exportCtx, exportCanvas.width, exportCanvas.height, isoValues[selectedISO]);
  
  const link = document.createElement("a");
  link.download = "exported.png";
  link.href = exportCanvas.toDataURL("image/png", 1.0); // Utiliser la meilleure qualité PNG
  link.click();
});

function applyEffects() {
  if (!fullResImage) return;
  
  // Définir les dimensions maximales
  const maxWidth = 800;
  const maxHeight = 800;
  
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
  ctx.imageSmoothingQuality = 'high';
  
  // Dessiner l'image avec la meilleure qualité possible
  ctx.drawImage(fullResImage, 0, 0, newWidth, newHeight);
  
  if (lutData) {
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    applyLUTToImage(imgData.data, lutData);
    ctx.putImageData(imgData, 0, 0);
  }
  addGrain(ctx, canvas.width, canvas.height, isoValues[selectedISO]);
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
  'kodak_trix_400'
];

async function loadLUT(url) {
  try {
    const response = await fetch(url);
    const text = await response.text();
    console.log("Contenu du LUT:", text);
    
    // Trouver la taille du LUT
    const sizeMatch = text.match(/LUT_3D_SIZE (\d+)/);
    const size = sizeMatch ? parseInt(sizeMatch[1]) : 16;
    
    // Filtrer les lignes de données
    const lines = text.split('\n')
      .filter(l => !l.startsWith('#') && !l.startsWith('TITLE') && !l.startsWith('LUT_3D_SIZE') && !l.startsWith('DOMAIN'))
      .map(line => line.trim())
      .filter(line => line.length > 0);
    
    // Convertir les lignes en valeurs RGB
    const values = lines.map(line => {
      const [r, g, b] = line.split(' ').map(parseFloat);
      return [r, g, b];
    });

    // Vérifier si le LUT est en noir et blanc en utilisant la liste
    const lutName = url.split('/').pop().replace('.cube', '');
    const isBlackAndWhite = blackAndWhiteLUTs.includes(lutName);
    
    return { size, values, isBlackAndWhite };
  } catch (error) {
    console.error("Erreur lors du chargement du LUT:", error);
    return null;
  }
}

// ISO grain logic
const isoValues = {
  100: 0.01,
  200: 0.03,
  400: 0.06,
  800: 0.1,
  1200: 0.15
};
let selectedISO = 100;
let contrastAmount = 0;
let exposureAmount = 0;

// Utiliser le slider ISO du HTML
const isoSlider = document.getElementById('isoSlider');
const isoValueSpan = document.getElementById('isoValue');

// Sliders Contrast et Exposure
const contrastSlider = document.getElementById('contrastSlider');
const contrastValueSpan = document.getElementById('contrastValue');
const exposureSlider = document.getElementById('exposureSlider');
const exposureValueSpan = document.getElementById('exposureValue');

isoSlider.addEventListener('input', () => {
  const steps = [100, 200, 400, 800, 1200];
  selectedISO = steps[parseInt(isoSlider.value)];
  if (isoValueSpan) isoValueSpan.textContent = selectedISO;
  if (fullResImage) applyEffects();
});

contrastSlider.addEventListener('input', () => {
  contrastAmount = parseInt(contrastSlider.value);
  if (contrastValueSpan) contrastValueSpan.textContent = contrastAmount;
  if (fullResImage) applyEffects();
});

exposureSlider.addEventListener('input', () => {
  exposureAmount = parseFloat(exposureSlider.value);
  if (exposureValueSpan) exposureValueSpan.textContent = exposureAmount;
  if (fullResImage) applyEffects();
});

// Initialiser les valeurs affichées
if (isoValueSpan) isoValueSpan.textContent = selectedISO;
if (contrastValueSpan) contrastValueSpan.textContent = contrastAmount;
if (exposureValueSpan) exposureValueSpan.textContent = exposureAmount;

function addGrain(ctx, width, height, amount) {
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const grain = (Math.random() - 0.5) * 255 * amount;
    data[i] = Math.min(255, Math.max(0, data[i] + grain));
    data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + grain));
    data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + grain));
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
    // Réappliquer le LUT par défaut
    document.getElementById('filmSelect').value = 'kodak_portra_160';
    document.getElementById('filmSelect').dispatchEvent(new Event('change'));
    // Réafficher l'image d'origine si elle existe
    if (originalImageDataUrl) {
      const img = new Image();
      img.onload = function () {
        fullResImage = img;
        leakImage = null;
        applyEffects();
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
