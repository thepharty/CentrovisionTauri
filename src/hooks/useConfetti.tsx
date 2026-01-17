import confetti from 'canvas-confetti';

export const useConfetti = () => {
  const fireConfetti = () => {
    // Explosión desde la izquierda
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { x: 0.1, y: 0.6 }
    });
    
    // Explosión desde la derecha
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { x: 0.9, y: 0.6 }
    });

    // Explosión desde el centro arriba (como lluvia de confeti)
    setTimeout(() => {
      confetti({
        particleCount: 150,
        spread: 120,
        origin: { x: 0.5, y: 0.3 }
      });
    }, 200);
  };

  return { fireConfetti };
};
