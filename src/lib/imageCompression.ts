/**
 * Comprime una imagen de forma adaptativa según su tamaño
 * Objetivo: Garantizar que todas las imágenes queden por debajo de 1MB
 */
export const compressImage = async (file: File): Promise<File> => {
  // Solo comprimir imágenes
  if (!file.type.startsWith('image/')) {
    return file;
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      const img = new Image();
      
      img.onload = async () => {
        const originalWidth = img.width;
        const originalHeight = img.height;
        const originalSizeMB = file.size / (1024 * 1024);
        
        // Determinar estrategia de compresión según tamaño original
        let maxSize: number;
        let quality: number;
        
        if (originalSizeMB > 10 || Math.max(originalWidth, originalHeight) > 5000) {
          // Imágenes muy grandes
          maxSize = 2800;
          quality = 0.60;
          console.log(`📸 Estrategia: Muy grande (${originalSizeMB.toFixed(1)}MB) -> Agresiva`);
        } else if (originalSizeMB > 5 || Math.max(originalWidth, originalHeight) > 3000) {
          // Imágenes grandes
          maxSize = 2500;
          quality = 0.65;
          console.log(`📸 Estrategia: Grande (${originalSizeMB.toFixed(1)}MB) -> Alta compresión`);
        } else if (originalSizeMB > 2 || Math.max(originalWidth, originalHeight) > 2000) {
          // Imágenes medianas
          maxSize = 2200;
          quality = 0.70;
          console.log(`📸 Estrategia: Mediana (${originalSizeMB.toFixed(1)}MB) -> Compresión moderada`);
        } else {
          // Imágenes pequeñas
          maxSize = 2000;
          quality = 0.75;
          console.log(`📸 Estrategia: Pequeña (${originalSizeMB.toFixed(1)}MB) -> Compresión ligera`);
        }
        
        // Calcular nuevas dimensiones
        let width = originalWidth;
        let height = originalHeight;
        
        if (width > maxSize || height > maxSize) {
          if (width > height) {
            height = Math.round((height * maxSize) / width);
            width = maxSize;
          } else {
            width = Math.round((width * maxSize) / height);
            height = maxSize;
          }
        }
        
        // Función auxiliar para comprimir con una calidad específica
        const compressWithQuality = (targetQuality: number): Promise<Blob | null> => {
          return new Promise((resolveBlob) => {
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            
            const ctx = canvas.getContext('2d');
            if (!ctx) {
              resolveBlob(null);
              return;
            }
            
            ctx.drawImage(img, 0, 0, width, height);
            canvas.toBlob(resolveBlob, 'image/jpeg', targetQuality);
          });
        };
        
        try {
          // Primera compresión
          let blob = await compressWithQuality(quality);
          
          if (!blob) {
            reject(new Error('Error al comprimir la imagen'));
            return;
          }
          
          // Si todavía es mayor a 1MB, aplicar segunda pasada más agresiva
          const TARGET_SIZE_MB = 1;
          if (blob.size / (1024 * 1024) > TARGET_SIZE_MB) {
            console.log(`⚠️ Primera compresión: ${(blob.size / (1024 * 1024)).toFixed(2)}MB (>1MB) -> Aplicando segunda pasada...`);
            blob = await compressWithQuality(0.55);
            
            if (!blob) {
              reject(new Error('Error en segunda compresión'));
              return;
            }
          }
          
          // Crear archivo final
          const compressedFile = new File([blob], file.name, {
            type: 'image/jpeg',
            lastModified: Date.now(),
          });
          
          // Logs detallados
          const compressedSizeMB = compressedFile.size / (1024 * 1024);
          const compressionRatio = ((1 - compressedFile.size / file.size) * 100).toFixed(1);
          
          console.log(`✅ Imagen comprimida: ${file.name}`);
          console.log(`   📏 Dimensiones: ${originalWidth}x${originalHeight}px → ${width}x${height}px`);
          console.log(`   💾 Tamaño: ${originalSizeMB.toFixed(2)}MB → ${compressedSizeMB.toFixed(2)}MB`);
          console.log(`   📊 Reducción: ${compressionRatio}%`);
          console.log(`   ${compressedSizeMB < TARGET_SIZE_MB ? '✓' : '⚠️'} Objetivo <1MB: ${compressedSizeMB < TARGET_SIZE_MB ? 'Cumplido' : 'Revisar'}`);
          
          resolve(compressedFile);
        } catch (error) {
          reject(error);
        }
      };
      
      img.onerror = () => {
        reject(new Error('Error al cargar la imagen'));
      };
      
      img.src = e.target?.result as string;
    };
    
    reader.onerror = () => {
      reject(new Error('Error al leer el archivo'));
    };
    
    reader.readAsDataURL(file);
  });
};

/**
 * Comprime múltiples imágenes en paralelo
 */
export const compressImages = async (files: File[]): Promise<File[]> => {
  const compressionPromises = files.map(file => compressImage(file));
  return Promise.all(compressionPromises);
};
