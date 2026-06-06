// Utility to generate creative, descriptive themed images with high color cast synthetically
// This allows the user to test the color correction immediately without needing local images!

export function createDemoImage(theme: 'underwater' | 'indoor' | 'forest'): string {
  const canvas = document.createElement('canvas');
  canvas.width = 800;
  canvas.height = 600;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  if (theme === 'underwater') {
    // 1. Draw baseline elements in their "natural" colors
    // We will apply the severe CYAN/BLUE cast on top to simulate raw underwater photography
    const grad = ctx.createLinearGradient(0, 0, 0, 600);
    grad.addColorStop(0, '#5bc0be'); // light teal
    grad.addColorStop(1, '#0b132b'); // dark oceanic blue
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 800, 600);

    // Draw some stylized coral silhouettes at the bottom
    ctx.fillStyle = '#ff7b00'; // Natural coral red
    ctx.beginPath();
    ctx.arc(150, 600, 100, Math.PI, 0);
    ctx.fill();

    ctx.fillStyle = '#ff007f'; // Natural coral pink
    ctx.beginPath();
    ctx.arc(650, 600, 130, Math.PI, 0);
    ctx.fill();

    // Draw coral branches
    ctx.strokeStyle = '#ff7b00';
    ctx.lineWidth = 14;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(150, 500);
    ctx.quadraticCurveTo(120, 420, 80, 400);
    ctx.moveTo(150, 500);
    ctx.quadraticCurveTo(180, 430, 220, 380);
    ctx.stroke();

    ctx.strokeStyle = '#ff007f';
    ctx.lineWidth = 16;
    ctx.beginPath();
    ctx.moveTo(650, 470);
    ctx.quadraticCurveTo(620, 390, 580, 350);
    ctx.moveTo(650, 470);
    ctx.quadraticCurveTo(690, 380, 720, 310);
    ctx.stroke();

    // Draw a golden natural fish swimming in the middle
    ctx.fillStyle = '#ffb703'; // Bright golden yellow (should look washed out under blue cast)
    ctx.beginPath();
    ctx.ellipse(400, 300, 45, 25, 0.1, 0, Math.PI * 2);
    ctx.fill();
    // Fish tail
    ctx.beginPath();
    ctx.moveTo(355, 300);
    ctx.lineTo(330, 275);
    ctx.lineTo(330, 325);
    ctx.closePath();
    ctx.fill();

    // Fish eye & bubble
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(425, 295, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.arc(426, 295, 3, 0, Math.PI * 2);
    ctx.fill();

    // Draw random white floating bubbles (neutral grey/white reference area!)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.82)';
    ctx.beginPath();
    ctx.arc(280, 220, 12, 0, Math.PI * 2);
    ctx.arc(295, 180, 8, 0, Math.PI * 2);
    ctx.arc(480, 150, 15, 0, Math.PI * 2);
    ctx.arc(500, 110, 9, 0, Math.PI * 2);
    ctx.fill();

    // Draw a sandy seabottom (natural greyish brown)
    ctx.fillStyle = '#d6ccc2'; // natural warm sand gray
    ctx.beginPath();
    ctx.moveTo(0, 550);
    ctx.quadraticCurveTo(400, 520, 800, 560);
    ctx.lineTo(800, 600);
    ctx.lineTo(0, 600);
    ctx.closePath();
    ctx.fill();

    // 2. NOW APPLY A MASSIVE COLOR CAST overlay (Multiply / Screen balance simulating underwater scattering)
    ctx.fillStyle = 'rgba(0, 150, 255, 0.45)'; // Heavy ocean blue color cast
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillRect(0, 0, 800, 600);

    ctx.fillStyle = 'rgba(0, 255, 230, 0.25)'; // Secondary cyan cast overlay
    ctx.globalCompositeOperation = 'color-burn';
    ctx.fillRect(0, 0, 800, 600);
    
    ctx.globalCompositeOperation = 'source-over';

  } else if (theme === 'indoor') {
    // Heavy Orange/Ambar tungsten light color cast
    const grad = ctx.createLinearGradient(0, 0, 800, 600);
    grad.addColorStop(0, '#fefae0'); // cream background
    grad.addColorStop(1, '#dda15e'); // warm brown tint
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 800, 600);

    // Draw some natural items like a grey tea-pot, white plates, and a green house plant
    // A grey teapot is an excellent Neutral Gray target!
    ctx.fillStyle = '#e5e5e5'; // Natural neutral light gray
    ctx.beginPath();
    ctx.arc(400, 360, 80, 0, Math.PI * 2); // main body
    ctx.fill();
    // spout
    ctx.beginPath();
    ctx.moveTo(480, 350);
    ctx.lineTo(540, 300);
    ctx.lineTo(550, 320);
    ctx.lineTo(480, 380);
    ctx.closePath();
    ctx.fill();
    // handle
    ctx.lineWidth = 12;
    ctx.strokeStyle = '#cccccc';
    ctx.beginPath();
    ctx.arc(320, 360, 40, -Math.PI / 2, Math.PI / 2);
    ctx.stroke();

    // White plates on table
    ctx.fillStyle = '#f8f9fa'; // neutral pure white area
    ctx.beginPath();
    ctx.ellipse(400, 460, 180, 40, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#e9ecef'; // shaded white
    ctx.beginPath();
    ctx.ellipse(400, 460, 150, 30, 0, 0, Math.PI * 2);
    ctx.fill();

    // House plant leaf green
    ctx.fillStyle = '#2d6a4f';
    ctx.beginPath();
    ctx.moveTo(150, 400);
    ctx.quadraticCurveTo(80, 260, 120, 180);
    ctx.quadraticCurveTo(180, 240, 150, 400);
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(150, 400);
    ctx.quadraticCurveTo(220, 290, 260, 250);
    ctx.quadraticCurveTo(220, 370, 150, 400);
    ctx.fill();

    // Overlay massive warm red/yellow cast to simulate incandescent bulbs
    ctx.fillStyle = 'rgba(255, 120, 0, 0.42)'; // strong tungsten orange
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillRect(0, 0, 800, 600);

    ctx.fillStyle = 'rgba(255, 180, 0, 0.15)'; // warm yellow burn
    ctx.globalCompositeOperation = 'screen';
    ctx.fillRect(0, 0, 800, 600);

    ctx.globalCompositeOperation = 'source-over';

  } else {
    // "Forest" theme - heavy toxic green cast
    const grad = ctx.createLinearGradient(0, 0, 0, 600);
    grad.addColorStop(0, '#52b788');
    grad.addColorStop(1, '#081c15');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 800, 600);

    // Draw a grey stone path in the middle (excellent neutral reference!)
    ctx.fillStyle = '#94a3b8'; // clear neutral slate gray path
    ctx.beginPath();
    ctx.moveTo(350, 600);
    ctx.lineTo(390, 250);
    ctx.lineTo(410, 250);
    ctx.lineTo(450, 600);
    ctx.closePath();
    ctx.fill();

    // Draw grey rocks alongside the forest path
    ctx.fillStyle = '#cbd5e1'; // light neutral gray
    ctx.beginPath();
    ctx.arc(310, 480, 35, 0, Math.PI * 2);
    ctx.arc(480, 520, 45, 0, Math.PI * 2);
    ctx.fill();

    // Pine trees silhouettes
    ctx.fillStyle = '#1b4332';
    for (let x of [100, 220, 580, 700]) {
      ctx.beginPath();
      ctx.moveTo(x, 450);
      ctx.lineTo(x - 60, 350);
      ctx.lineTo(x - 20, 350);
      ctx.lineTo(x - 50, 270);
      ctx.lineTo(x - 10, 270);
      ctx.lineTo(x, 150);
      ctx.lineTo(x + 10, 270);
      ctx.lineTo(x + 50, 270);
      ctx.lineTo(x + 20, 350);
      ctx.lineTo(x + 60, 350);
      ctx.closePath();
      ctx.fill();
    }

    // Huge toxic green cast simulating shooting forest under dense leaf foliage canopy or bad white balance
    ctx.fillStyle = 'rgba(0, 240, 100, 0.35)'; // heavy green cast
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillRect(0, 0, 800, 600);

    ctx.fillStyle = 'rgba(200, 255, 0, 0.12)'; // yellowish green flare
    ctx.globalCompositeOperation = 'screen';
    ctx.fillRect(0, 0, 800, 600);

    ctx.globalCompositeOperation = 'source-over';
  }

  // Draw some simple typography text in the corner to help confirm white point readability
  ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
  ctx.font = 'bold 16px "sans-serif"';
  ctx.fillText("Neutral Gray Reference", 30, 40);

  return canvas.toDataURL('image/png');
}
